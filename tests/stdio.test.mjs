import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { controlService } from "../dist/integrations/local-service/control.js";
import { replacePrivateText } from "../dist/infrastructure/private-files.js";
import { inspectInstallation } from "../plugin/scripts/preflight.mjs";

const cli = resolve("bin/task-conductor.mjs");
async function until(read, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await delay(50);
  }
  throw new Error("Timed out waiting for the local service");
}
async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, false, JSON.stringify(result));
  return result.structuredContent.data;
}
function connection(home, cwd, env, command = cli, args = []) {
  const child = spawn(process.execPath, [command, "mcp", "--home", home, ...args], {
    cwd, env, detached: true, stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  const closed = new Promise(resolve => child.once("close", resolve));
  const client = new Client({ name: "task-conductor-process-test", version: "1.0.0" });
  // The official line-framing transport accepts streams. Owning spawn here gives this real client a separate process group.
  const transport = new StdioServerTransport(child.stdout, child.stdin);
  return { child, client, closed, connect: () => client.connect(transport, { timeout: 15_000 }),
    get stdout() { return stdout; }, get stderr() { return stderr; } };
}
async function waitClosed(peer) {
  let timer;
  try {
    await Promise.race([peer.closed, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("MCP process did not close: " + peer.stderr)), 5000);
    })]);
  } finally { clearTimeout(timer); }
}

test("MCP startup requires explicit initialization and creates no installation", () => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "task-conductor-uninitialized-")), home = join(root, "private");
  try {
    const result = spawnSync(process.execPath, [cli, "mcp", "--home", home], {
      cwd: root, env: { PATH: "/usr/bin:/bin", HOME: root }, encoding: "utf8", timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /setup first/);
    assert.equal(existsSync(home), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("MCP notification files bind each creation after connect and reject unsafe bindings before HTTP dispatch", { timeout: 30_000 }, async t => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "task-conductor-binding-")), home = join(root, "private");
  const nativeBin = join(root, "bin"), userHome = join(root, "user"), workspace = join(root, "workspace"), override = join(root, "selected workspace");
  const bindingDirectory = join(root, "binding"), notificationFile = join(bindingDirectory, "origin.json");
  for (const directory of [nativeBin, userHome, workspace, override, bindingDirectory]) mkdirSync(directory, { mode: 0o700 });
  // The discoverable real failing program is never executed; all tasks are scheduled in the future.
  symlinkSync("/usr/bin/false", join(nativeBin, "opencode"));
  const env = { PATH: nativeBin, HOME: userHome }, peers = [];
  t.after(async () => {
    for (const peer of peers) {
      await peer.client.close().catch(() => {}); peer.child.stdin.end();
      if (peer.child.exitCode === null && peer.child.signalCode === null) peer.child.kill("SIGTERM");
      const timer = setTimeout(() => peer.child.kill("SIGKILL"), 5000);
      await peer.closed; clearTimeout(timer);
    }
    try { await controlService(home, "stop", 8000); }
    catch (error) { if (error.kind !== "unreachable") throw error; }
    rmSync(root, { recursive: true, force: true });
  });
  const cliCall = (command, ...args) => spawnSync(process.execPath, [cli, command, "--home", home, ...args], {
    cwd: workspace, env, encoding: "utf8", timeout: 10_000,
  });
  const initialized = cliCall("setup", "--data-dir", join(home, "data"), "--port", "0", "--generate-tokens", "--yes");
  assert.equal(initialized.status, 0, initialized.stderr);
  const configPath = join(home, "data/config.json"), config = JSON.parse(readFileSync(configPath, "utf8"));
  config.coordinator = { provider: "openai", model: "gpt-4.1" };
  config.disabledExecutors = ["pi", "codex", "claude"];
  writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });

  for (const [command, ...args] of [
    ["mcp", "--notification-file", "relative.json"],
    ["mcp", "--notification-file", notificationFile + "\n"],
    ["mcp", "--notification-file"],
    ["mcp", "--notification-file", notificationFile, "--notification-file", notificationFile],
    ["mcp", "--home", home],
    ["mcp", "--notification-file", notificationFile, "--unknown"],
    ["mcp", "--notification-file", notificationFile, "--data-dir", root],
    ["mcp", "--notification-file", notificationFile, "--json"],
    ["start", "--notification-file", notificationFile],
    ["stop", "--notification-file", notificationFile],
    ["setup", "--check", "--notification-file", notificationFile],
    ["notifications", "--notification-file", notificationFile],
  ]) {
    const result = cliCall(command, ...args);
    assert.equal(result.status, 1, `${command} ${args.join(" ")}: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.equal(existsSync(join(home, "launcher.log")), false, "invalid arguments must not start the backend");
  }
  await assert.rejects(controlService(home, "status"), error => error.kind === "unreachable");

  const peer = connection(home, workspace, env, cli, ["--notification-file", notificationFile]); peers.push(peer);
  await peer.connect();
  assert.equal(existsSync(notificationFile), false, "the binding may be published after MCP connects");
  const ready = await controlService(home, "status");
  const tools = (await peer.client.listTools()).tools;
  assert.equal(tools.length, 12);
  assert(tools.some(tool => tool.name === "task_update"));
  assert(!tools.some(tool => tool.name === "task_schedule_control"));
  await assert.rejects(peer.client.callTool({ name: "task_schedule_control", arguments: {} }), /Unknown Task Conductor tool/);
  assert.equal((await call(peer.client, "service_status")).coordinatorConfigured, true);
  assert.equal((await call(peer.client, "executor_list")).executors.find(item => item.id === "opencode").state, "ready");
  const foreign = Object.freeze({ projectId: "uuid:" + randomUUID(), sessionId: "pi:foreign" });
  const input = Object.freeze({ requestKey: "binding", name: "绑定任务", prompt: "检查工作目录",
    nodes: Object.freeze([Object.freeze({ id: "inspect", executorId: "opencode", prompt: "检查工作目录" })]),
    schedule: Object.freeze({ type: "once", at: new Date(Date.now() + 3_600_000).toISOString() }), notification: foreign });
  const assertBindingError = result => {
    assert.equal(result.isError, true, JSON.stringify(result));
    assert.equal(result.structuredContent.ok, false);
    assert.equal(result.structuredContent.code, "precondition");
    assert.equal(typeof result.structuredContent.error, "string");
    assert(result.structuredContent.error.length > 0);
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
    const text = JSON.stringify(result);
    for (const privateValue of [root, "private-binding-value", foreign.projectId, foreign.sessionId]) assert(!text.includes(privateValue));
  };
  const rejectCreation = async () => {
    assertBindingError(await peer.client.callTool({ name: "task_create", arguments: input }));
    assert.deepEqual((await call(peer.client, "task_list")).items, [], "failed binding must not persist a task");
  };
  // With the real HTTP process paused, a bounded tool error can only come from stdio before forwarding.
  process.kill(ready.pid, "SIGSTOP");
  try {
    assertBindingError(await peer.client.callTool({ name: "task_create", arguments: input }, undefined, { timeout: 2000 }));
  } finally { process.kill(ready.pid, "SIGCONT"); }
  await rejectCreation();
  const origin = { projectId: "uuid:" + randomUUID(), sessionId: "dsh:" + randomUUID() };
  for (const text of ["{\"private-binding-value\":", JSON.stringify({ ...origin, privateField: "private-binding-value" }),
    JSON.stringify({ projectId: origin.projectId }), JSON.stringify({ ...origin, projectId: "private-binding-value" }),
    JSON.stringify({ ...origin, sessionId: "invalid/session" }), "null"]) {
    replacePrivateText(notificationFile, text, true);
    await rejectCreation();
  }
  replacePrivateText(notificationFile, JSON.stringify(origin));
  chmodSync(notificationFile, 0o644);
  await rejectCreation();
  chmodSync(notificationFile, 0o600);
  chmodSync(bindingDirectory, 0o755);
  await rejectCreation();
  chmodSync(bindingDirectory, 0o700);
  const linkedFile = join(bindingDirectory, "linked.json");
  replacePrivateText(linkedFile, JSON.stringify(origin), true);
  rmSync(notificationFile); symlinkSync(linkedFile, notificationFile);
  await rejectCreation();
  rmSync(notificationFile);
  mkdirSync(notificationFile, { mode: 0o700 });
  await rejectCreation();
  rmSync(notificationFile, { recursive: true });

  replacePrivateText(notificationFile, JSON.stringify(origin), true);
  const first = await call(peer.client, "task_create", input);
  assert.deepEqual(first.notification, origin);
  assert.equal(first.workspace, workspace);
  assert.equal((await call(peer.client, "task_create", input)).taskId, first.taskId);
  assert.deepEqual(input.notification, foreign);
  const nextOrigin = { projectId: origin.projectId, sessionId: "dsh:" + randomUUID() };
  replacePrivateText(notificationFile, JSON.stringify(nextOrigin));
  const conflict = await peer.client.callTool({ name: "task_create", arguments: input });
  assert.equal(conflict.isError, true); assert.equal(conflict.structuredContent.code, "conflict");
  assert.deepEqual((await call(peer.client, "task_get", { taskId: first.taskId })).notification, origin);
  const second = await call(peer.client, "task_create", { ...input, requestKey: "override", workspace: override, notification: null });
  assert.deepEqual(second.notification, nextOrigin);
  assert.equal(second.workspace, override);
  const { notification: _notification, ...unboundInput } = input;
  const third = await call(peer.client, "task_create", { ...unboundInput, requestKey: "omitted" });
  assert.deepEqual(third.notification, nextOrigin);

  rmSync(notificationFile);
  assertBindingError(await peer.client.callTool({ name: "task_create", arguments: { ...input, requestKey: "removed" } }));
  assertBindingError(await peer.client.callTool({ name: "task_create", arguments: input }));
  assert.deepEqual((await call(peer.client, "task_list")).items.map(item => item.taskId), [first.taskId, second.taskId, third.taskId]);
  const updated = await call(peer.client, "task_update", { taskId: second.taskId,
    expected: { name: second.input.name, schedule: second.input.schedule, scheduleStatus: second.scheduleStatus, nextAt: second.nextAt },
    name: "原任务更新", enabled: false });
  assert.equal(updated.scheduleStatus, "paused"); assert.equal(updated.input.name, "原任务更新");
  assert.deepEqual((await call(peer.client, "task_run_list", { taskId: first.taskId })).items, []);
  assert.deepEqual((await call(peer.client, "task_get", { taskId: second.taskId })).notification, nextOrigin);
  await peer.client.close(); peer.child.stdin.end(); await waitClosed(peer);
  assert.equal((await controlService(home, "status")).instanceId, ready.instanceId);
  const reader = connection(home, workspace, env); peers.push(reader); await reader.connect();
  assert.deepEqual((await call(reader.client, "task_get", { taskId: first.taskId })).notification, origin);
  const unbound = await call(reader.client, "task_create", { ...unboundInput, requestKey: "unbound" });
  assert.equal(unbound.notification, null);
  const supplied = await call(reader.client, "task_create", { ...input, requestKey: "supplied" });
  assert.deepEqual(supplied.notification, foreign);
  for (const line of peer.stdout.trim().split("\n")) assert.equal(JSON.parse(line).jsonrpc, "2.0");
});

test("concurrent stdio projects share one backend whose future tasks survive EOF and process-group SIGHUP", { timeout: 30_000 }, async t => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "task-conductor-stdio-")), home = join(root, "private");
  const dataDir = join(home, "data"), nativeBin = join(root, "bin"), userHome = join(root, "user");
  const projectA = join(root, "project-a"), projectB = join(root, "project-b"), override = join(root, "selected workspace");
  for (const directory of [nativeBin, userHome, projectA, projectB, override]) mkdirSync(directory, { mode: 0o700 });
  // A real failing program supplies only a discoverable executable. This does not simulate ACP or prove successful execution.
  symlinkSync("/usr/bin/false", join(nativeBin, "opencode"));
  const env = { PATH: nativeBin, HOME: userHome };
  const invoke = (...args) => execFileSync(process.execPath, [cli, ...args, "--home", home], {
    env, encoding: "utf8", stdio: "pipe", timeout: 10_000,
  });
  const peers = [];
  let ready, connected = false;
  t.after(async () => {
    for (const peer of peers) {
      await peer.client.close().catch(() => {});
      if (peer.child.exitCode === null && peer.child.signalCode === null) peer.child.kill("SIGTERM");
      const timer = setTimeout(() => peer.child.kill("SIGKILL"), 5000);
      await peer.closed; clearTimeout(timer);
    }
    try { await controlService(home, "stop", 8000); }
    catch (error) {
      if (error.kind !== "unreachable" && ready) {
        try { process.kill(ready.pid, "SIGTERM"); } catch {}
        await until(async () => {
          try { await controlService(home, "status", 1000); return false; }
          catch (failure) { return failure.kind === "unreachable"; }
        }).catch(() => {});
      }
    }
    if (connected) rmSync(root, { recursive: true, force: true });
    else t.diagnostic("Failed MCP startup evidence retained at " + root);
  });
  invoke("setup", "--data-dir", dataDir, "--port", "0", "--generate-tokens", "--yes");
  const configPath = join(dataDir, "config.json"), environmentPath = join(dataDir, "environment.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")), environment = JSON.parse(readFileSync(environmentPath, "utf8"));
  config.coordinator = { provider: "openai", model: "not-a-real-model" };
  config.disabledExecutors = ["pi", "codex", "claude"];
  environment.OPENAI_API_KEY = "test-only-unused-model-credential";
  writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
  writeFileSync(environmentPath, JSON.stringify(environment), { mode: 0o600 });
  const first = connection(home, projectA, env), second = connection(home, projectB, env);
  peers.push(first, second);
  await Promise.all(peers.map(peer => peer.connect()));
  assert.match(first.client.getInstructions() ?? "", /task_run_list/);
  connected = true;
  ready = await controlService(home, "status");
  const executors = await call(first.client, "executor_list");
  assert.equal(executors.executors.find(item => item.id === "opencode").state, "ready");
  assert(executors.executors.filter(item => item.id !== "opencode").every(item => item.state === "disabled"));
  const input = { requestKey: "inspect", name: "Inspect", prompt: "Inspect project",
    nodes: [{ id: "inspect", executorId: "opencode", prompt: "Inspect project" }],
    schedule: { type: "once", at: new Date(Date.now() + 3000).toISOString() } };
  const taskA = await call(first.client, "task_create", input);
  const taskB = await call(second.client, "task_create", input);
  const taskC = await call(first.client, "task_create", { ...input, requestKey: "override", workspace: override });
  assert.equal(taskA.workspace, projectA); assert.equal(taskB.workspace, projectB); assert.equal(taskC.workspace, override);
  assert.notEqual(taskA.taskId, taskB.taskId, "request keys are scoped to the resolved task directory");
  assert.equal((await call(first.client, "task_create", input)).taskId, taskA.taskId);
  assert.equal((await call(second.client, "task_get", { taskId: taskA.taskId })).workspace, projectA);
  assert.equal((await call(second.client, "task_run_list", { taskId: taskA.taskId })).items.length, 0);
  await first.client.close(); first.child.stdin.end();
  await waitClosed(first);
  process.kill(-second.child.pid, "SIGHUP");
  await waitClosed(second); await second.client.close();
  const afterDisconnect = await controlService(home, "status");
  assert.equal(afterDisconnect.pid, ready.pid);
  assert.equal(afterDisconnect.instanceId, ready.instanceId);
  const origin = new URL(ready.url).origin;
  const admin = async path => {
    const response = await fetch(origin + "/admin/api" + path, {
      headers: { Authorization: "Bearer " + environment.TASK_CONDUCTOR_ADMIN_TOKEN }, signal: AbortSignal.timeout(3000),
    });
    assert.equal(response.status, 200);
    return (await response.json()).data;
  };
  const ids = new Set([taskA.taskId, taskB.taskId, taskC.taskId]);
  const runs = await until(async () => {
    const items = (await admin("/runs")).items.filter(run => ids.has(run.taskId));
    return items.length === 3 && items.every(run => run.status === "failed") && items;
  }, 20_000);
  for (const summary of runs) {
    const run = await admin("/runs/" + summary.id);
    assert.match(run.error, /no_model/);
    assert.ok(run.nodes.every(node => node.sessionId === null && node.turns.length === 0));
  }
  assert.equal((await controlService(home, "status")).pid, ready.pid);
  for (const peer of peers) {
    const lines = peer.stdout.trim().split("\n");
    assert(lines.length > 0);
    for (const line of lines) assert.equal(JSON.parse(line).jsonrpc, "2.0", "stdout contains MCP messages only");
    for (const credential of Object.values(environment)) assert(!(peer.stdout + peer.stderr).includes(credential));
  }
  assert.equal(JSON.parse(invoke("stop", "--json")).stopped, true);
  await assert.rejects(controlService(home, "status"), error => error.kind === "unreachable");
});

test("package updates retain process versions until full stop and MCP reconnect; preflight never restarts the backend", { timeout: 30_000 }, async t => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "task-conductor-upgrade-"));
  const app = join(root, "app"), home = join(root, "private"), bin = join(root, "bin");
  const user = join(root, "user"), workspace = join(root, "workspace");
  for (const directory of [app, bin, user, workspace]) mkdirSync(directory, { mode: 0o700 });
  // 使用隔离的真实服务包；只更新副本的包版本，不修改仓库或伪造协议响应。
  for (const entry of ["bin", "scripts", "dist", "package.json"]) cpSync(resolve(entry), join(app, entry), { recursive: true });
  symlinkSync(resolve("node_modules"), join(app, "node_modules"), "dir");
  const command = join(app, "bin/task-conductor.mjs"), packagePath = join(app, "package.json");
  const manifest = JSON.parse(readFileSync(packagePath, "utf8")), initialVersion = manifest.version;
  const updatedVersion = initialVersion + ".upgrade-test";
  symlinkSync(process.execPath, join(bin, "node"));
  symlinkSync("/usr/bin/false", join(bin, "opencode"));
  const env = { PATH: bin, HOME: user, TASK_CONDUCTOR_PREFLIGHT_COMMAND: command, TASK_CONDUCTOR_PREFLIGHT_HOME: home };
  const invoke = (...args) => execFileSync(process.execPath, [command, ...args, "--home", home], {
    env, encoding: "utf8", stdio: "pipe", timeout: 10_000,
  });
  const peers = [];
  t.after(async () => {
    for (const peer of peers) {
      await peer.client.close(); peer.child.stdin.end();
      await waitClosed(peer);
    }
    try { await controlService(home, "stop", 8000); }
    catch (error) { if (error.kind !== "unreachable") throw error; }
    rmSync(root, { recursive: true, force: true });
  });
  invoke("setup", "--data-dir", join(home, "data"), "--port", "0", "--generate-tokens", "--yes");
  assert.equal(await inspectInstallation({ env }), "coordinator-missing");
  assert.equal(existsSync(join(home, "launcher.log")), false, "version checking must not start a stopped backend");
  const first = connection(home, workspace, env, command); peers.push(first);
  await first.connect();
  const initial = JSON.parse(invoke("status", "--json"));
  assert.equal(initial.installedVersion, initialVersion);
  assert.equal(initial.launcherVersion, initialVersion);
  assert.equal(initial.serviceVersion, initialVersion);
  assert.equal(initial.restartRequired, false);
  assert.equal((await call(first.client, "service_status")).serviceVersion, initialVersion);

  // 暂停真实服务进程验证超时和进行中的取消，不提供模拟健康响应。
  process.kill(initial.pid, "SIGSTOP");
  try {
    assert.equal(await inspectInstallation({ env }), "runtime-unknown");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 500);
    try { assert.equal(await inspectInstallation({ env, signal: controller.signal }), "cancelled"); }
    finally { clearTimeout(timer); }
  } finally { process.kill(initial.pid, "SIGCONT"); }
  assert.equal((await controlService(home, "status")).instanceId, initial.instanceId);

  writeFileSync(packagePath, JSON.stringify({ ...manifest, version: updatedVersion }));
  const upgraded = JSON.parse(invoke("status", "--json"));
  assert.equal(upgraded.installedVersion, updatedVersion);
  assert.equal(upgraded.launcherVersion, initialVersion);
  assert.equal(upgraded.serviceVersion, initialVersion);
  assert.equal(upgraded.restartRequired, true);
  assert.equal((await call(first.client, "service_status")).serviceVersion, initialVersion);
  assert.equal(await inspectInstallation({ env }), "runtime-outdated");
  assert.equal((await controlService(home, "status")).instanceId, initial.instanceId);

  // 重启只更新服务子进程，旧 launcher 仍须被识别。
  const restarted = JSON.parse(invoke("restart"));
  assert.equal(restarted.launcherVersion, initialVersion);
  assert.equal(restarted.serviceVersion, updatedVersion);
  assert.notEqual(restarted.instanceId, initial.instanceId);
  assert.equal(JSON.parse(invoke("status", "--json")).restartRequired, true);
  assert.equal(await inspectInstallation({ env }), "runtime-outdated");
  await first.client.close(); first.child.stdin.end(); await waitClosed(first);
  invoke("stop");
  assert.equal(await inspectInstallation({ env }), "coordinator-missing");
  await assert.rejects(controlService(home, "status"), error => error.kind === "unreachable");

  // 关闭管理员接口仍须显示运行版本，检查不依赖管理员 API 是否启用。
  const environmentPath = join(home, "data/environment.json");
  const environment = JSON.parse(readFileSync(environmentPath, "utf8"));
  delete environment.TASK_CONDUCTOR_ADMIN_TOKEN;
  writeFileSync(environmentPath, JSON.stringify(environment), { mode: 0o600 });
  const second = connection(home, workspace, env, command); peers.push(second);
  await second.connect();
  const current = JSON.parse(invoke("status", "--json"));
  assert.equal(current.installedVersion, updatedVersion);
  assert.equal(current.launcherVersion, updatedVersion);
  assert.equal(current.serviceVersion, updatedVersion);
  assert.equal(current.restartRequired, false);
  assert.equal(current.adminEnabled, false);
  assert.equal((await call(second.client, "service_status")).serviceVersion, updatedVersion);
  assert((await call(second.client, "executor_list")).executors.some(entry => entry.state === "ready"));
  assert.equal(await inspectInstallation({ env }), "coordinator-missing");
});
