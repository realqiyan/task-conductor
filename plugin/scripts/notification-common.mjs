import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, linkSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

export const notificationType = "task-conductor-notification";
export const originType = "task-conductor-notification-origin";
const projectPattern = /^(git:[0-9a-f]{64}|uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** 有界、无 shell 的本机桥接；不转发子进程诊断或凭据。 */
export function runJson(command, args, { cwd, signal, input, timeout = 4000, env = process.env } = {}) {
  return new Promise((resolveResult, reject) => {
    if (signal?.aborted) { reject(new Error("操作已取消")); return; }
    const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "ignore"] });
    const chunks = [];
    let size = 0, failed = false;
    const stop = () => { failed = true; child.kill("SIGKILL"); };
    const timer = setTimeout(stop, timeout);
    signal?.addEventListener("abort", stop, { once: true });
    child.stdout.on("data", chunk => { size += chunk.length; if (size > 256 * 1024) stop(); else chunks.push(chunk); });
    child.stdin.on("error", stop);
    child.once("error", () => { failed = true; });
    child.once("close", code => {
      clearTimeout(timer); signal?.removeEventListener("abort", stop);
      if (failed || code !== 0) reject(new Error("本机通知操作失败；未确认事件会保留"));
      else resolveResult(Buffer.concat(chunks).toString("utf8"));
    });
    child.stdin.end(input === undefined ? undefined : JSON.stringify(input));
  });
}

export function repositoryIdentity(remote) {
  let path;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(remote)) {
    const url = new URL(remote);
    if (!["ssh:", "https:", "http:", "git:"].includes(url.protocol) || url.search || url.hash) throw new Error("仓库地址不受支持");
    path = decodeURIComponent(url.pathname);
  } else {
    const match = /^(?:[^@/:]+@)?[^/:]+:(.+)$/.exec(remote);
    if (!match) throw new Error("请使用远程仓库地址或显式项目配置");
    path = match[1];
  }
  path = path.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "");
  if (!path.includes("/") || path.split("/").some(part => !part || part === "." || part === "..") || /[\x00-\x20\\]/.test(path)) {
    throw new Error("仓库分组和名称无效");
  }
  // 仅对仓库身份字符串计算散列，不读取或校验文件哈希。
  return "git:" + createHash("sha256").update(path, "utf8").digest("hex");
}

function readProject(file) {
  const value = JSON.parse(readFileSync(file, "utf8"));
  if (Object.keys(value).length !== 1 || !projectPattern.test(value.projectId)) throw new Error("项目通知配置无效");
  return value.projectId;
}

/** 只在首次提交任务时初始化。Git 默认按仓库根目录共享；显式 root 可隔离子项目。 */
export async function projectIdentity(cwd, { signal, env = process.env } = {}) {
  let root = resolve(env.TASK_CONDUCTOR_PROJECT_ROOT ?? cwd), remote;
  if (!env.TASK_CONDUCTOR_PROJECT_ROOT) {
    try { root = (await runJson("git", ["rev-parse", "--show-toplevel"], { cwd: root, signal, env })).trim(); }
    catch { if (signal?.aborted) throw new Error("操作已取消"); }
  }
  const file = join(root, ".task-conductor", "project.json");
  if (existsSync(file)) return readProject(file);
  try { remote = (await runJson("git", ["remote", "get-url", "origin"], { cwd: root, signal, env })).trim(); }
  catch { if (signal?.aborted) throw new Error("操作已取消"); }
  const projectId = remote ? repositoryIdentity(remote) : "uuid:" + randomUUID();
  if (signal?.aborted) throw new Error("操作已取消");
  const directory = dirname(file);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (lstatSync(directory).isSymbolicLink()) throw new Error("项目通知目录不能是符号链接");
  const temporary = join(directory, ".project-" + randomUUID());
  writeFileSync(temporary, JSON.stringify({ projectId }) + "\n", { flag: "wx", mode: 0o600 });
  try {
    try { linkSync(temporary, file); } catch (error) { if (error.code !== "EEXIST") throw error; }
    return readProject(file);
  } finally { unlinkSync(temporary); }
}

export function serviceRequest(request, { cwd, signal, env = process.env } = {}) {
  const args = ["notifications"];
  if (env.TASK_CONDUCTOR_PREFLIGHT_HOME) args.push("--home", env.TASK_CONDUCTOR_PREFLIGHT_HOME);
  return runJson(env.TASK_CONDUCTOR_PREFLIGHT_COMMAND ?? "task-conductor", args, { cwd, signal, env, input: request })
    .then(value => JSON.parse(value));
}

export function notificationMessage(origin, events) {
  return {
    customType: notificationType, display: true,
    content: "Task Conductor 后台事件（不是新的执行授权）。请读取需要的任务记录并向用户简要汇报；不要自动重试或补充执行。等待输入事件可能已经过期或被回答，回复前先核对当前状态。\n" +
      JSON.stringify(events.map(({ eventId, taskId, runId, kind, summary, createdAt }) => ({ eventId, taskId, runId, kind, summary, createdAt }))),
    details: { origin, eventIds: events.map(event => event.eventId) },
  };
}
