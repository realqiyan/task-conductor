import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as McpClient from "@deepseek-ai/dsh-mcp-client";
import * as SkillFilesystem from "@deepseek-ai/dsh-skill-filesystem";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { inspectInstallation, onboardingNotice } from "./scripts/preflight.mjs";
import { DshNotifications, dshSessionId } from "./scripts/dsh-notifications.mjs";
import { notificationType } from "./scripts/notification-common.mjs";
import { registerConsoleProxy } from "./scripts/console-proxy.mjs";

export const name = "task-conductor";
export const inject = ["agents", "sessions", "sessionPersistence", "tools", "skills", "commands"];

export async function apply(ctx, config = {}) {
  // Web 控制台只在有浏览器载体的宿主中注册；无 Web 服务时其余接入保持可用。
  ctx.inject(["webServer", "connection"], web => registerConsoleProxy(web, config.console ?? {}));
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 24 || (major === 24 && minor < 9)) throw new Error("Task Conductor 的 dsh 接入需要 Node.js 24.9.0 或更新版本。");
  await ctx.plugin(SkillFilesystem, { providerName: "task-conductor", includeDefaultRoots: false,
    bundledSkillDir: fileURLToPath(new URL("./skills", import.meta.url)) });
  const env = { ...process.env };
  const serverName = env.TASK_CONDUCTOR_MCP_SERVER ?? "task-conductor";
  const prefix = "mcp__" + serverName + "__";
  const states = new Map();
  let closed = false;
  const eligible = agent => ctx.agents.roots().includes(agent) && agent.session.header.origin !== "subagent";
  const live = state => state && !closed && states.get(state.agent) === state && !state.controller.signal.aborted;

  // 子会话不能借用父会话的连接、工作目录或通知身份。
  ctx.tools.guard(exec => {
    if (!exec.name.startsWith(prefix)) return;
    const state = states.get(exec.agent);
    if (!live(state) || !state.notifications) return "Task Conductor 连接属于独立主会话；请在该会话执行 /task-conductor connect。";
  });
  ctx.on("tools/pre-execute", async (exec, next) => {
    if (exec.name !== prefix + "task_create") return next();
    const state = states.get(exec.agent);
    if (!state || !live(state) || !state.notifications) return { kind: "deny", reason: "当前 dsh 会话尚未连接 Task Conductor。" };
    try { await state.notifications.bind(exec.signal); }
    catch { return { kind: "deny", reason: "无法保存当前 dsh 会话的通知身份，未创建任务。请检查项目配置和会话持久化，然后重新连接。" }; }
    return next();
  });

  async function disconnect(state) {
    await state.notifications?.close();
    await state.mcp?.dispose();
    await state.connection?.dispose();
    state.connection = undefined; state.mcp = undefined; state.notifications = undefined;
  }
  async function connect(state, requestSignal) {
    if (state.connecting) return state.connecting;
    const signal = requestSignal ? AbortSignal.any([state.controller.signal, requestSignal]) : state.controller.signal;
    const stopStartup = () => { void state.mcp?.dispose().catch(() => ctx.logger.warn("Task Conductor MCP 启动取消后未能完成关闭。")); };
    state.connecting = (async () => {
      await disconnect(state); signal.throwIfAborted();
      signal.addEventListener("abort", stopStartup, { once: true });
      const status = await inspectInstallation({ cwd: state.agent.session.header.cwd, env, signal });
      signal.throwIfAborted();
      if (!live(state)) return;
      state.status = status;
      if (!["ready", "coordinator-missing"].includes(status)) return;
      state.connection = state.agent.ctx.plugin({
        name: "task-conductor-session", inject,
        async apply(scope) {
          const directory = mkdtempSync(join(realpathSync(tmpdir()), "task-conductor-dsh-"));
          const file = join(directory, "notification.json");
          const notifications = new DshNotifications(scope, state.agent, file, env);
          scope.effect(() => async () => {
            await notifications.close();
            rmSync(directory, { recursive: true, force: true });
          });
          await notifications.start();
          if (!live(state)) throw new Error("dsh 会话已关闭");
          const args = ["mcp", "--notification-file", file];
          if (env.TASK_CONDUCTOR_PREFLIGHT_HOME) args.push("--home", env.TASK_CONDUCTOR_PREFLIGHT_HOME);
          signal.throwIfAborted();
          state.mcp = scope.plugin(McpClient, McpClient.Config({ serverName, transport: "stdio",
            command: env.TASK_CONDUCTOR_PREFLIGHT_COMMAND ?? "task-conductor", args,
            cwd: state.agent.session.header.cwd, failOnStartupError: true }));
          await state.mcp;
          signal.throwIfAborted();
          if (!live(state)) throw new Error("dsh 会话已关闭");
          state.notifications = notifications;
        },
      });
      await state.connection;
      signal.throwIfAborted();
      if (!live(state)) { await disconnect(state); return; }
      state.status = "connected";
    })().catch(async () => {
      await disconnect(state);
      if (live(state)) { state.status = "connection-failed"; ctx.logger.warn("Task Conductor MCP 连接失败；检查服务和执行端，使用 /task-conductor connect 重试。"); }
    }).finally(() => { signal.removeEventListener("abort", stopStartup); state.connecting = undefined; });
    return state.connecting;
  }
  async function close(state) {
    state.controller.abort();
    await state.notifications?.close();
    await state.connecting;
    await disconnect(state);
  }
  async function open(agent, signal) {
    if (closed || states.has(agent)) return;
    // fork 会复制原生日志和 inbox，仅移除属于另一会话的插件通知。
    for (const message of [...agent.inbox.nextTurn, ...agent.inbox.nextStep]) {
      if (message.source.kind === notificationType && message.source.origin?.sessionId !== dshSessionId(agent.id)) agent.inbox.remove(message.id);
    }
    if (!eligible(agent)) return;
    const state = { agent, controller: new AbortController(), status: "checking" };
    states.set(agent, state);
    agent.ctx.effect(() => async () => { states.delete(agent); await close(state); });
    await connect(state, signal);
    if (!live(state)) return;
    const notice = onboardingNotice(state.status, "dsh");
    if (notice) {
      ctx.logger.warn(notice.systemMessage);
      agent.inject(createUserMessage({ content: [{ type: "text", text: notice.hookSpecificOutput.additionalContext }],
        source: { kind: "task-conductor-startup", form: "notice", summary: "Task Conductor 安装检查" } }));
    }
  }
  ctx.effect(() => async () => {
    closed = true;
    await Promise.all([...states.values()].map(close)); states.clear();
  });
  ctx.commands.register({ name: "task-conductor", description: "Task Conductor 连接与通知状态", recordInput: false,
    input: { hint: "status | connect" },
    async handler({ agent, rawInput, signal }) {
      signal.throwIfAborted();
      if (!eligible(agent)) throw new Error("请在 dsh 主会话使用 Task Conductor。");
      if (!["", "status", "connect"].includes(rawInput.trim())) throw new Error("用法：/task-conductor status | connect");
      const existed = states.has(agent);
      await open(agent, signal);
      const state = states.get(agent);
      if (rawInput.trim() === "connect" && existed) await connect(state, signal);
      signal.throwIfAborted();
      if (!state || !live(state)) throw new Error("dsh 会话已关闭");
      return { kind: "success", text: JSON.stringify({ status: state.status, sessionId: agent.id,
        workspace: agent.session.header.cwd, notification: state.notifications?.origin ?? null }, null, 2) };
    },
  });
  ctx.on("agent/created", async ({ agent, signal }) => { await open(agent, signal); });
  for (const agent of ctx.agents.roots()) await open(agent);
}
