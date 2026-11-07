import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Loader from "@deepseek-ai/cordis-plugin-loader";
import { composeEntries, loadProfileDirectory } from "@deepseek-ai/dsh-app-boot";
import { openAcp } from "../../dist/integrations/acp/connection.js";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { buildForkSeed } from "@deepseek-ai/dsh-session";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import * as SkillTool from "@deepseek-ai/dsh-tool-skill";
import * as Plugin from "../../plugin/dsh.js";
import { DshDeliveryReceipts, dshNotification } from "../../plugin/scripts/dsh-notifications.mjs";
import { dshHost } from "../helpers/dsh-host.mjs";
import { controlService } from "../../dist/integrations/local-service/control.js";

async function until(check, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await check(); if (value) return value; await delay(25); }
  throw new Error("等待本机 dsh 行为超时");
}
async function fixture(t, { service = true, packed = false } = {}) {
  const root = mkdtempSync(join(realpathSync(process.platform === "darwin" ? "/tmp" : tmpdir()), "tc-dsh-"));
  const bin = join(root, "bin"), user = join(root, "user"), home = join(root, "installation");
  for (const path of [bin, user]) mkdirSync(path, { mode: 0o700 });
  symlinkSync(process.execPath, join(bin, "node"));
  symlinkSync(resolve("bin/task-conductor.mjs"), join(bin, "task-conductor"));
  // 真实失败程序只供注册及未来任务使用，不冒充 ACP 或模型。
  symlinkSync("/usr/bin/false", join(bin, "opencode"));
  const env = { PATH: bin, HOME: user, DSH_HOME: join(user, "dsh"), DSH_AGENTS_HOME: join(user, "agents"),
    TASK_CONDUCTOR_PREFLIGHT_COMMAND: join(bin, "task-conductor"), TASK_CONDUCTOR_PREFLIGHT_HOME: home };
  if (service) {
    execFileSync(process.execPath, [resolve("bin/task-conductor.mjs"), "setup", "--home", home, "--data-dir", join(home, "data"), "--port", "0", "--generate-tokens", "--yes"], { cwd: root, env, stdio: "pipe" });
    const path = join(home, "data/config.json");
    const config = JSON.parse(readFileSync(path));
    writeFileSync(path, JSON.stringify({ ...config, disabledExecutors: ["pi", "codex", "claude"],
      coordinator: { provider: "openai", model: "gpt-4.1" } }), { mode: 0o600 });
  }
  const old = process.env;
  process.env = env;
  let host;
  t.after(async () => {
    try { await host?.close(); }
    finally {
      try { if (service) await controlService(home, "stop", 8000); }
      catch (error) { if (error.kind !== "unreachable") throw error; }
      finally { process.env = old; rmSync(root, { recursive: true, force: true }); }
    }
  });
  host = await dshHost(root);
  if (packed) {
    const artifact = JSON.parse(execFileSync(process.execPath, [resolve("scripts/pack-plugin.mjs"), root], { env: old, encoding: "utf8" }));
    const unpacked = join(root, "unpacked"); mkdirSync(unpacked);
    execFileSync("tar", ["-xzf", artifact.filename, "-C", unpacked], { env: old });
    symlinkSync(resolve("node_modules"), join(unpacked, "node_modules"));
    const profile = join(root, "profile"); mkdirSync(join(profile, "node_modules"), { recursive: true });
    writeFileSync(join(profile, "package.json"), JSON.stringify({ dsh: { profile: { bundles: ["task-conductor-plugin"] } } }));
    symlinkSync(join(unpacked, "package"), join(profile, "node_modules/task-conductor-plugin"));
    const loaded = loadProfileDirectory("dsh", profile, resolve("node_modules/@deepseek-ai/dsh/package.json"));
    assert.deepEqual(loaded.skippedBundles, []);
    const entries = composeEntries(loaded.layers.map(layer => layer.patches));
    assert.equal(entries.length, 1);
    const loader = await host.ctx.plugin(Loader, { baseUrl: pathToFileURL(join(profile, "package.json")).href });
    for (const entry of entries) await loader.ctx.loader.create(entry);
    await loader.ctx.loader.await();
  } else await host.ctx.plugin(Plugin);
  await host.ctx.plugin(SkillTool);
  return { root, home, host, async restart(snapshot) {
    await host.close();
    // 恢复自己创建的测试日志快照，保留崩溃前已 flush 的 inbox；不构造模型响应。
    if (snapshot) writeFileSync(snapshot.path, snapshot.contents);
    host = await dshHost(root);
    await host.ctx.plugin(Plugin); await host.ctx.plugin(SkillTool);
    return host;
  } };
}
async function call(host, agent, name, args = {}) {
  const output = await host.ctx.tools.execute({ agent, signal: AbortSignal.timeout(15000),
    calls: [{ type: "tool-call", id: randomUUID(), name: "mcp__task-conductor__" + name, arguments: JSON.stringify(args) }] });
  assert.equal(output.results.length, 1);
  return output.results[0].result;
}
const task = key => ({ requestKey: key, name: "本机接入验证", prompt: "检查本地文件", nodes: [{ id: "a", executorId: "opencode", prompt: "检查本地文件" }],
  schedule: { type: "once", at: new Date(Date.now() + 86_400_000).toISOString() } });

async function status(host, agent) {
  return host.ctx.commands.execute(agent, "/task-conductor status", [], new AbortController().signal);
}

test("dsh 没有原生持久化屏障时拒绝产生通知回执", async t => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "tc-dsh-memory-"));
  const host = await dshHost(root, { persistence: false });
  t.after(async () => { await host.close(); rmSync(root, { recursive: true, force: true }); });
  const handle = await host.ctx.agents.create({ sessionId: randomUUID(), meta: { cwd: root } });
  const receipts = new DshDeliveryReceipts(handle.agent);
  await assert.rejects(receipts.refresh());
  assert.equal(receipts.ids.size, 0);
  await handle.dispose();
});

test("Task Conductor 的自定义 ACP 连接真实 dsh profile，建立会话并关闭", { timeout: 20000 }, async t => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "tc-dsh-acp-"));
  const results = join(root, "results"); mkdirSync(results);
  const previous = process.env;
  process.env = { HOME: root, PATH: process.env.PATH, DSH_HOME: join(root, "dsh"), DSH_AGENTS_HOME: join(root, "agents"),
    XDG_CONFIG_HOME: join(root, ".config"), XDG_DATA_HOME: join(root, ".local/share"), XDG_CACHE_HOME: join(root, ".cache") };
  let connection;
  t.after(async () => { try { await connection?.close(); } finally { process.env = previous; rmSync(root, { recursive: true, force: true }); } });
  const command = realpathSync(process.execPath), events = [];
  connection = await openAcp({ id: "dsh-acp", type: "custom", command, nativePath: command, adapterVersion: null,
    args: [resolve("node_modules/@deepseek-ai/dsh/lib/bin.js"), "--profile", "acp"] }, root, AbortSignal.timeout(15000),
    async (kind, data) => { events.push({ kind, data }); }, results);
  assert(events.some(event => event.kind === "session" && typeof event.data === "string"));
  await connection.close(); await connection.closed;
});

test("dsh 缺少服务时仍在首轮发现共享技能，安装检查不创建项目身份", { timeout: 20000 }, async t => {
  const { root, host } = await fixture(t, { service: false, packed: true });
  const handle = await host.ctx.agents.create({ sessionId: randomUUID(), meta: { cwd: root } });
  const catalog = await host.ctx.skills.list({ cwd: root, scope: handle.agent });
  assert.equal(catalog.filter(skill => skill.name === "using-task-conductor").length, 1);
  assert.equal(catalog.find(skill => skill.name === "using-task-conductor").provider, "task-conductor");
  assert.equal(existsSync(join(root, ".task-conductor")), false);
  const assembly = await host.ctx.systemPrompt.assemble({ scope: handle.agent });
  assert(assembly.tools.some(tool => tool.name === "skill"));
  assert.equal(assembly.tools.some(tool => tool.name.startsWith("mcp__task-conductor__")), false);
  assert.equal(handle.agent.inbox.nextStep.filter(message => message.source.kind === "task-conductor-startup").length, 1);
  assert(await status(host, handle.agent));
  const proposed = [];
  host.ctx.on("agent/pre-step", async (_input, next) => {
    const decision = await next();
    if (decision.kind === "enter") proposed.push(...decision.messages);
    return { kind: "reject" };
  }, { prepend: true });
  handle.agent.model.select({ provider: "openai", model: "gpt-4.1" });
  handle.agent.followup(createUserMessage({ content: [{ type: "text", text: "查看可用方法" }], source: { kind: "user" } }));
  await handle.agent.whenIdle();
  const firstCatalog = proposed.find(message => message.source.kind === "skill-catalog");
  assert(firstCatalog.source.entries.some(entry => entry.name === "using-task-conductor"));
  assert.equal(proposed.some(message => message.source.kind === "skill-invocation"), false);
  await handle.dispose();
});

test("dsh 原生 MCP 按主会话固定 cwd 和通知身份，子会话不能借用；恢复与 fork 保持归属", { timeout: 45000 }, async t => {
  const { root, home, host } = await fixture(t);
  const first = join(root, "first"), second = join(root, "second");
  mkdirSync(first); mkdirSync(second);
  const a = await host.ctx.agents.create({ sessionId: randomUUID(), meta: { cwd: first } });
  const b = await host.ctx.agents.create({ sessionId: "research.v1-" + randomUUID(), meta: { cwd: second } });
  assert.equal(host.ctx.tools.definitions(a.agent).filter(tool => tool.name.startsWith("mcp__task-conductor__")).length, 12, JSON.stringify(await status(host, a.agent)));
  let frozen = false;
  host.ctx.on("tools/pre-execute", async (exec, next) => { if (exec.name.endsWith("__task_create")) frozen = Object.isFrozen(exec.arguments); return next(); });
  const foreign = { projectId: "uuid:" + randomUUID(), sessionId: "pi:foreign" };
  const resultA = await call(host, a.agent, "task_create", { ...task("first"), notification: foreign });
  assert.equal(resultA.isError, false, JSON.stringify(resultA));
  const resultB = await call(host, b.agent, "task_create", task("second"));
  assert.equal(resultB.isError, false, JSON.stringify(resultB));
  assert(frozen);
  const db = new DatabaseSync(join(home, "data/tasks.sqlite")); t.after(() => db.close());
  const rows = db.prepare("SELECT data FROM definitions").all().map(row => JSON.parse(row.data));
  assert.equal(rows.length, 2);
  const one = rows.find(row => row.input.requestKey === "first"), two = rows.find(row => row.input.requestKey === "second");
  assert.equal(one.workspace, first); assert.equal(two.workspace, second);
  assert.equal(one.notification.sessionId, "dsh:" + a.agent.id); assert.match(two.notification.sessionId, /^dsh:sha256:[0-9a-f]{64}$/);
  assert.notEqual(one.notification.projectId, two.notification.projectId);
  const receipts = new DshDeliveryReceipts(a.agent); await receipts.refresh();
  assert.deepEqual(receipts.origin, one.notification);
  const child = await host.ctx.agents.create({ sessionId: randomUUID(), parentAgent: a.agent, meta: { cwd: second, parentSession: a.agent.id, origin: "subagent" } });
  assert.equal((await call(host, child.agent, "task_create", task("child"))).isError, true);
  await child.dispose();
  a.agent.send(dshNotification(one.notification, [{ eventId: randomUUID(), taskId: one.id, runId: randomUUID(), kind: "failed", summary: "待处理通知", createdAt: new Date().toISOString() }]), "next-turn", false);
  await host.ctx.sessions.flush(a.agent.session);
  const reader = await host.ctx.sessionPersistence.open(a.agent.id, "read");
  const { events } = await reader.read(); await reader.close();
  const seed = buildForkSeed(events, events.length - 1);
  const fork = await host.ctx.agents.create({ sessionId: randomUUID(), meta: { cwd: first, parentSession: a.agent.id, isSeeded: true }, seed, inheritedEventCount: events.length });
  const forkReceipts = new DshDeliveryReceipts(fork.agent); await forkReceipts.refresh();
  assert.equal(forkReceipts.origin, undefined);
  assert.equal(fork.agent.inbox.nextTurn.length, 0);
  a.agent.inbox.clear();
  assert.equal((await call(host, fork.agent, "task_create", task("fork"))).isError, false);
  await forkReceipts.refresh(); assert.equal(forkReceipts.origin.sessionId, "dsh:" + fork.agent.id);
  const id = a.agent.id;
  await a.dispose();
  const resumed = await host.ctx.agents.resume({ resumeSessionId: id });
  const restored = new DshDeliveryReceipts(resumed.agent); await restored.refresh();
  assert.deepEqual(restored.origin, one.notification);
  assert.equal((await call(host, resumed.agent, "task_list")).isError, false);
  const namedId = b.agent.id;
  await b.dispose();
  const namedResume = await host.ctx.agents.resume({ resumeSessionId: namedId });
  const namedReceipts = new DshDeliveryReceipts(namedResume.agent); await namedReceipts.refresh();
  assert.deepEqual(namedReceipts.origin, two.notification);
  const beforeRestart = await controlService(home, "status");
  await controlService(home, "restart", 10000);
  const afterRestart = await controlService(home, "status");
  assert.notEqual(afterRestart.instanceId, beforeRestart.instanceId);
  await until(async () => !(await call(host, resumed.agent, "task_list")).isError, 12000);
  await fork.dispose(); await namedResume.dispose(); await resumed.dispose();
});

test("dsh 取消 MCP 启动时回收原生连接，不等待后台请求超时", { timeout: 20000 }, async t => {
  const { root, home, host } = await fixture(t);
  const handle = await host.ctx.agents.create({ sessionId: randomUUID(), meta: { cwd: root } });
  const ready = await controlService(home, "status");
  const controller = new AbortController();
  let paused = false;
  host.ctx.on("internal/plugin", fiber => {
    if (fiber.name !== "mcp-client" || fiber.uid === null || paused) return;
    paused = true; process.kill(ready.pid, "SIGSTOP");
    setTimeout(() => controller.abort(), 100);
  }, { global: true });
  try {
    const started = Date.now();
    await assert.rejects(host.ctx.commands.execute(handle.agent, "/task-conductor connect", [], controller.signal), { name: "AbortError" });
    assert(paused);
    assert(Date.now() - started < 5000);
    assert.equal(host.ctx.tools.definitions(handle.agent).some(tool => tool.name.startsWith("mcp__task-conductor__")), false);
  } finally { if (paused) process.kill(ready.pid, "SIGCONT"); }
  await handle.dispose();
});

test("dsh 通知仅确认原生持久消息，排队及失败准入不确认，恢复后去重", { timeout: 45000 }, async t => {
  const fixtureData = await fixture(t);
  const { root, home } = fixtureData;
  let host = fixtureData.host;
  let handle = await host.ctx.agents.create({ sessionId: randomUUID(), meta: { cwd: root } });
  const result = await call(host, handle.agent, "task_create", { ...task("notice"), schedule: { type: "now" } });
  assert.equal(result.isError, false, JSON.stringify(result));
  const db = new DatabaseSync(join(home, "data/tasks.sqlite")); t.after(() => db.close());
  const row = await until(() => db.prepare("SELECT data FROM notification_events").get());
  const event = JSON.parse(row.data);
  assert.equal(event.kind, "failed"); // 真实协调器缺少凭据产生终结事件，没有模拟模型。
  let receipts = new DshDeliveryReceipts(handle.agent); await receipts.refresh();
  assert.equal(receipts.ids.size, 0);
  const message = dshNotification(receipts.origin, [event]);
  handle.agent.send(message, "next-turn", false);
  await host.ctx.sessions.flush(handle.agent.session);
  const stored = await host.ctx.sessionPersistence.stat(handle.agent.id);
  const snapshot = { path: stored.location.path, contents: readFileSync(stored.location.path) };
  await delay(5500);
  assert.equal(db.prepare("SELECT * FROM notification_deliveries WHERE channel='session'").all().length, 0);
  await receipts.refresh(); assert.equal(receipts.ids.size, 0);
  const queuedId = handle.agent.id;
  host = await fixtureData.restart(snapshot);
  handle = await host.ctx.agents.resume({ resumeSessionId: queuedId });
  assert.equal(handle.agent.inbox.nextTurn.length, 1);
  receipts = new DshDeliveryReceipts(handle.agent); await receipts.refresh();
  let admitted = 0;
  host.ctx.on("agent/pre-step", async (_input, _next) => { admitted++; return { kind: "reject" }; });
  handle.agent.model.select({ provider: "openai", model: "gpt-4.1" });
  await until(() => admitted === 1, 10000);
  await handle.agent.whenIdle();
  await delay(5500);
  assert.equal(admitted, 1);
  assert.equal(db.prepare("SELECT * FROM notification_deliveries WHERE channel='session'").all().length, 0);
  // 原生会话收件记录夹具，不生成模型响应；模型成功与否不属于确认条件。
  handle.agent.inbox.clear();
  handle.agent.session.append("turn/start", { turn: 2 });
  handle.agent.session.append("step/start", { turn: 2, step: 1 });
  handle.agent.session.append("user/message", message, { surfaceOp: "append" });
  handle.agent.session.append("step/end", { turn: 2, step: 1 });
  handle.agent.session.append("turn/end", { turn: 2, reason: { kind: "completed" } });
  await until(() => db.prepare("SELECT acknowledged_at FROM notification_deliveries WHERE event_id=? AND channel='session'").get(event.eventId));
  await receipts.refresh(); assert(receipts.ids.has(event.eventId));
  const id = handle.agent.id;
  await handle.dispose();
  const restored = await host.ctx.agents.resume({ resumeSessionId: id });
  const restoredReceipts = new DshDeliveryReceipts(restored.agent); await restoredReceipts.refresh();
  assert(restoredReceipts.ids.has(event.eventId));
  assert.equal(restored.agent.inbox.nextTurn.length, 0);
  await restored.dispose();
});
