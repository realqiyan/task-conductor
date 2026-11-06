#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { argumentsFor, installRoot, packageRoot, readManifest, operationLock } from "./install-lib.mjs";
import { acquireLauncherLock } from "../dist/infrastructure/lock.js";
import { controlService, ControlError } from "../dist/integrations/local-service/control.js";
import { connectBackground } from "../dist/application/background.js";
import { loadConfig, startupPaths } from "../dist/configuration/files.js";

const help = `用法：task-conductor update [--home 绝对目录] [--json]
更新当前 npm 全局安装至 latest，并完整重启 launcher 和服务；同版本也重启。
执行前核查活动及待回答运行，备份私有安装目录和数据目录，并保持宿主 MCP 断开。
需要数据迁移时保持停服，使用 migrate 显式处理；完成后重新连接宿主 MCP。`;
const installedVersion = () => JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version;
let options = {}, stage = "preflight", serviceState = "unchanged", releaseOperation, releaseLauncher;
const cancellation = new AbortController();
const cancel = () => cancellation.abort(new Error("更新已中断；请核查安装状态后再启动服务"));
process.on("SIGINT", cancel); process.on("SIGTERM", cancel);

function run(command, args, cwd, timeout = 60_000) {
  cancellation.signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", failure, killTimer;
    const stop = error => {
      if (failure) return;
      failure = error;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 3000);
    };
    const abort = () => stop(cancellation.signal.reason);
    const timer = setTimeout(() => stop(new Error("外部命令超时；服务未重新启动，请核查安装状态")), timeout);
    cancellation.signal.addEventListener("abort", abort, { once: true });
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", text => { stdout += text; });
    child.stderr.on("data", text => { stderr += text; });
    child.once("error", error => { failure ??= error; });
    child.once("close", (code, signal) => {
      clearTimeout(timer); clearTimeout(killTimer);
      cancellation.signal.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`${command === "npm" ? "npm" : "新版本命令"}执行失败（${signal ?? code}）：${stderr.trim()}`));
      else resolve(stdout);
    });
  });
}

try {
  process.umask(0o077);
  options = argumentsFor(process.argv.slice(2));
  if (options.help) { console.log(help); process.exit(0); }
  if (Object.keys(options).some(key => !["home", "json"].includes(key))) throw new Error(help);
  const home = installRoot(options), manifest = readManifest(home, true);
  if (manifest.phase !== "ready") throw new Error("请先核查并完成初始化，不能用更新修复 setup");
  const paths = startupPaths(home);
  if ([home, paths.dataDir, loadConfig(paths.configPath).dataDir].some(path => path === packageRoot || path.startsWith(packageRoot + "/"))) {
    throw new Error("私有安装目录和数据目录必须位于 npm 包目录之外；更新会替换整个包目录");
  }
  const prefix = realpathSync((await run("npm", ["prefix", "--global"], home)).trim());
  if (packageRoot !== join(prefix, "lib/node_modules/task-conductor")) {
    throw new Error("当前 CLI 不属于当前 npm 的全局 prefix；请使用对应的 npm 和已安装命令，不能更新另一份安装");
  }
  const previousVersion = installedVersion();
  cancellation.signal.throwIfAborted();
  releaseOperation = operationLock(home);
  stage = "stop";
  serviceState = "unknown";
  try { await controlService(home, "stop"); }
  catch (error) { if (!(error instanceof ControlError) || error.kind !== "unreachable") throw error; }
  releaseLauncher = await acquireLauncherLock(home);
  serviceState = "stopped";
  cancellation.signal.throwIfAborted();

  stage = "install";
  if (!options.json) console.error("后台已停止，正在更新 npm 安装。");
  await run("npm", ["install", "--global", "--prefix", prefix, "--ignore-scripts", "--no-audit", "--no-fund", "task-conductor@latest"], home, 300_000);

  stage = "check";
  const version = installedVersion();
  // 安装已替换本进程所在的包；格式检查必须由新进程加载更新后的代码。
  const checked = JSON.parse(await run(process.execPath, [join(packageRoot, "bin/task-conductor.mjs"), "migrate", "--check", "--home", home, "--json"], home));
  if (checked.migrationRequired || checked.resumeRequired) {
    throw new Error("数据需要迁移或续接；服务保持停止，请使用同一 --home 执行 migrate，完成后重新连接 MCP");
  }

  cancellation.signal.throwIfAborted();
  stage = "start";
  releaseLauncher(); releaseLauncher = undefined;
  serviceState = "unknown";
  const ready = await connectBackground(home);
  serviceState = "running";
  cancellation.signal.throwIfAborted();
  stage = "verify";
  if (ready.launcherVersion !== version || ready.serviceVersion !== version) {
    throw new Error("运行版本与安装版本不一致；请用同一 --home 查询 status 并检查 launcher.log");
  }
  if (!options.json) console.error("更新及后台重启完成，请重新连接宿主 MCP。");
  console.log(JSON.stringify({ event: "updated", previousVersion, installedVersion: version, ...ready, restartRequired: false }, null, options.json ? undefined : 2));
} catch (error) {
  const failure = { stage, serviceState, error: error.message };
  console.error(process.argv.includes("--json") ? JSON.stringify(failure) : `更新失败（${stage}，服务状态 ${serviceState}）：${error.message}`);
  process.exitCode = 1;
} finally {
  releaseLauncher?.();
  releaseOperation?.();
  process.off("SIGINT", cancel); process.off("SIGTERM", cancel);
}
