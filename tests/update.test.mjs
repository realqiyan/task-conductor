import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { controlService } from "../dist/integrations/local-service/control.js";
import { acquireLauncherLock } from "../dist/infrastructure/lock.js";
import { DatabaseSync } from "../dist/infrastructure/sqlite.js";
import { createTaskRuntime } from "../dist/application/task-runtime.js";
import { createExecution } from "../dist/integrations/acp/execution.js";
import { createCoordinator } from "../dist/integrations/coordinator/coordinator.js";
import { taskSchema } from "../dist/protocol/task-contract.js";

const json = path => JSON.parse(readFileSync(path, "utf8"));
const npm = execFileSync("which", ["npm"], { encoding: "utf8" }).trim();

function fixture(t, nestedHome = false) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "tc-update-"));
  const prefix = join(root, "prefix"), dataDir = join(root, "data"), user = join(root, "user");
  const app = join(prefix, "lib/node_modules/task-conductor"), bin = join(root, "bin");
  const home = nestedHome ? join(app, "private") : join(root, "private");
  for (const path of [app, bin, user]) mkdirSync(path, { recursive: true, mode: 0o700 });
  for (const entry of ["bin", "scripts", "dist", "package.json"]) cpSync(resolve(entry), join(app, entry), { recursive: true });
  symlinkSync(resolve("node_modules"), join(app, "node_modules"), "dir");
  symlinkSync(process.execPath, join(bin, "node"));
  symlinkSync(npm, join(bin, "npm"));
  const npmrc = join(root, "npmrc"); writeFileSync(npmrc, "", { mode: 0o600 });
  const env = { PATH: bin + ":/usr/bin:/bin", HOME: user, npm_config_prefix: prefix,
    npm_config_userconfig: npmrc, npm_config_globalconfig: join(root, "global-npmrc"), npm_config_cache: join(root, "cache"), npm_config_offline: "true" };
  const cli = join(app, "bin/task-conductor.mjs");
  const invoke = (args, extra = {}) => spawnSync(process.execPath, [cli, ...args, "--home", home], {
    cwd: root, env: { ...env, ...extra }, encoding: "utf8", timeout: 60_000,
  });
  const setup = invoke(["setup", "--data-dir", dataDir, "--port", "0", "--generate-tokens", "--yes"]);
  assert.equal(setup.status, 0, setup.stderr);
  t.after(async () => {
    try { await controlService(home, "stop", 8000); } catch (error) { if (error.kind !== "unreachable") throw error; }
    rmSync(root, { recursive: true, force: true });
  });
  return { root, prefix, app, home, dataDir, cli, env, invoke };
}

async function start(f, t) {
  const child = spawn(process.execPath, [f.cli, "start", "--home", f.home], { env: f.env, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  child.stdout.on("data", chunk => { logs += chunk; }); child.stderr.on("data", chunk => { logs += chunk; });
  const closed = new Promise(resolve => child.once("close", resolve));
  t.after(async () => {
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 8000);
    try { await closed; } finally { clearTimeout(timer); }
  });
  for (let i = 0; i < 100; i++) {
    try { return { ready: await controlService(f.home, "status", 1000), child, closed }; }
    catch { if (child.exitCode !== null) throw new Error(logs); await delay(50); }
  }
  throw new Error("隔离后台启动失败：" + logs);
}

function failure(result, stage, serviceState) {
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, "");
  const value = JSON.parse(result.stderr);
  assert.equal(value.stage, stage, value.error);
  assert.equal(value.serviceState, serviceState);
  return value;
}

test("更新拒绝错误 npm prefix，并在安装失败后保持停服和数据不变", { timeout: 30_000 }, async t => {
  const f = fixture(t), running = await start(f, t);
  const config = readFileSync(join(f.dataDir, "config.json"), "utf8"), credentials = readFileSync(join(f.dataDir, "environment.json"), "utf8");
  failure(f.invoke(["update", "--json"], { npm_config_prefix: f.root }), "preflight", "unchanged");
  assert.equal((await controlService(f.home, "status")).instanceId, running.ready.instanceId);
  // 真正的 npm 在隔离空缓存中离线安装失败，不替换 npm 或伪造 registry。
  failure(f.invoke(["update", "--json"]), "install", "stopped");
  await running.closed;
  await assert.rejects(controlService(f.home, "status"), error => error.kind === "unreachable");
  assert.equal(readFileSync(join(f.dataDir, "config.json"), "utf8"), config);
  assert.equal(readFileSync(join(f.dataDir, "environment.json"), "utf8"), credentials);
  const release = await acquireLauncherLock(f.home); release();
});

test("更新在停服前拒绝包目录内的私有 home 和数据目录", async t => {
  for (const nestedHome of [true, false]) {
    const f = fixture(t, nestedHome);
    if (!nestedHome) {
      const configPath = join(f.dataDir, "config.json");
      writeFileSync(configPath, JSON.stringify({ ...json(configPath), dataDir: join(f.app, "data") }));
    }
    const manifest = readFileSync(join(f.home, "installation.json"), "utf8");
    failure(f.invoke(["update", "--json"]), "preflight", "unchanged");
    assert.equal(readFileSync(join(f.home, "installation.json"), "utf8"), manifest);
  }
});

test("更新不能绕过已持有的 launcher 锁开始安装", { timeout: 15_000 }, async t => {
  const f = fixture(t), release = await acquireLauncherLock(f.home);
  try { failure(f.invoke(["update", "--json"]), "stop", "unknown"); }
  finally { release(); }
});

test("旧服务被强杀时更新停在 stop 阶段，释放资源但不开始安装", { timeout: 25_000 }, async t => {
  const f = fixture(t), running = await start(f, t);
  const packageText = readFileSync(join(f.app, "package.json"), "utf8");
  process.kill(running.ready.pid, "SIGSTOP");
  failure(f.invoke(["update", "--json"]), "stop", "unknown");
  assert.equal(await running.closed, 1, "launcher 必须保留收尾失败的退出码");
  assert.equal(readFileSync(join(f.app, "package.json"), "utf8"), packageText);
  await assert.rejects(controlService(f.home, "status"), error => error.kind === "unreachable");
  const release = await acquireLauncherLock(f.home); release();
});

test("中断更新会先结束真实 npm 进程，再释放安装锁", { timeout: 20_000 }, async t => {
  const f = fixture(t), sockets = new Set();
  let connected;
  const connection = new Promise(resolve => { connected = resolve; });
  // 真实 TCP 等待，不实现 registry 协议，不返回包或安装结果。
  const server = createServer(socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); connected(); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const child = spawn(process.execPath, [f.cli, "update", "--home", f.home, "--json"], {
    cwd: f.root, env: { ...f.env, npm_config_offline: "false", npm_config_registry: `http://127.0.0.1:${server.address().port}`,
      npm_config_fetch_retries: "0", npm_config_fetch_timeout: "15000" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "", stderr = "", npmPid;
  child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
  const closed = new Promise(resolve => child.once("close", status => resolve({ status, stdout, stderr })));
  const running = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === "ESRCH") return false; throw error; } };
  t.after(async () => {
    if (npmPid && running(npmPid)) process.kill(npmPid, "SIGKILL");
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await closed;
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  });
  await connection;
  const rows = execFileSync("/bin/ps", ["-axo", "pid=,ppid="], { encoding: "utf8" }).trim().split("\n").map(line => line.trim().split(/\s+/).map(Number));
  npmPid = rows.find(([, parent]) => parent === child.pid)?.[0];
  assert(npmPid, "真实 npm 子进程必须存在");
  await assert.rejects(acquireLauncherLock(f.home));
  child.kill("SIGTERM");
  let timer;
  try {
    const result = await Promise.race([closed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("更新中断后未及时退出")), 5000); })]);
    assert.equal(running(npmPid), false, "更新退出前必须回收 npm 子进程");
    failure(result, "install", "stopped");
    const release = await acquireLauncherLock(f.home); release();
  } finally { clearTimeout(timer); }
});

// 显式联网验收：隔离 prefix 安装本地候选 tarball，再更新到真实 registry 的 latest。
const registry = process.env.TASK_CONDUCTOR_UPDATE_REGISTRY;
test("真实 npm 更新替换两层进程、保留历史，同版本重启并阻断待迁移数据", {
  timeout: 300_000, skip: registry ? false : "需 TASK_CONDUCTOR_UPDATE_REGISTRY 启用真实 npm 联网安装验收",
}, async t => {
  const f = fixture(t);
  const env = { ...f.env, npm_config_registry: registry, npm_config_offline: "false", npm_config_fetch_retries: "0" };
  const version = execFileSync(npm, ["view", "task-conductor@latest", "version"], { cwd: f.root, env, encoding: "utf8", timeout: 30_000 }).trim();
  const [packed] = JSON.parse(execFileSync(npm, ["pack", "--ignore-scripts", "--json", "--pack-destination", f.root], {
    cwd: resolve("."), env, encoding: "utf8", timeout: 30_000,
  }));
  // 临时副本只用于 setup。此后每次候选安装、公开包替换都由真实 npm 执行。
  rmSync(f.app, { recursive: true });
  const installCandidate = () => {
    const result = spawnSync(npm, ["install", "--global", "--prefix", f.prefix, "--ignore-scripts", "--no-audit", "--no-fund", join(f.root, packed.filename)], {
      cwd: f.root, env, encoding: "utf8", timeout: 90_000,
    });
    assert.equal(result.status, 0, result.stderr);
  };
  installCandidate();
  const invoke = args => f.invoke(args, env);
  // 使用当前真实业务服务写入一次无需模型的历史，验证 npm 替换后逐项保留。
  const runtime = createTaskRuntime(f.dataDir, [{ id: "local", type: "codex", nativePath: "/usr/bin/false", command: "/usr/bin/false", args: [], adapterVersion: null }],
    createExecution({ PATH: "/missing" }), createCoordinator(f.dataDir, { provider: "openai", model: "not-a-real-model" }), error => { throw error; });
  const task = runtime.definitions.create(taskSchema.parse({ requestKey: "update", name: "更新保留", prompt: "保留历史", workspace: f.root,
    nodes: [{ id: "A", executorId: "local", prompt: "保留历史" }], schedule: { type: "now" } }));
  runtime.runs.trigger(task.nextAt);
  const run = runtime.runs.list(task.id).items[0];
  runtime.supervisor.actions(run.id).stop("failed", "更新测试的终结记录");
  const savedTask = runtime.definitions.get(task.id), savedRun = runtime.runs.get(run.id);
  await runtime.close();
  const config = readFileSync(join(f.dataDir, "config.json"), "utf8"), credentials = readFileSync(join(f.dataDir, "environment.json"), "utf8");
  const packagePath = join(f.app, "package.json"), pkg = json(packagePath);
  // 只降低安装副本的版本标识以复现旧进程；更新仍由真实 npm 下载安装完整公开包。
  writeFileSync(packagePath, JSON.stringify({ ...pkg, version: "0.0.0-update-test" }));
  const initial = await start(f, t);
  for (let i = 0, before = initial.ready; i < 2; i++) {
    if (i > 0) {
      // 已发布版本可能尚无 update；停服后重新安装候选，继续验证其同版本分支。
      assert.equal(invoke(["stop"]).status, 0);
      installCandidate();
      writeFileSync(packagePath, JSON.stringify({ ...json(packagePath), version }));
      before = (await start(f, t)).ready;
    }
    const result = invoke(["update", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const updated = JSON.parse(result.stdout);
    assert.equal(updated.event, "updated");
    assert.equal(updated.previousVersion, i === 0 ? "0.0.0-update-test" : version);
    for (const key of ["installedVersion", "launcherVersion", "serviceVersion"]) assert.equal(updated[key], version);
    assert.equal(updated.restartRequired, false);
    assert.notEqual(updated.instanceId, before.instanceId);
    assert.notEqual(updated.pid, before.pid);
    assert.throws(() => process.kill(before.pid, 0), error => error.code === "ESRCH");
    assert.deepEqual(JSON.parse(invoke(["task", "show", task.id, "--json"]).stdout), savedTask);
    assert.deepEqual(JSON.parse(invoke(["run", "show", run.id, "--json"]).stdout), savedRun);
    before = updated;
  }
  await initial.closed;
  assert.equal(readFileSync(join(f.dataDir, "config.json"), "utf8"), config);
  assert.equal(readFileSync(join(f.dataDir, "environment.json"), "utf8"), credentials);
  assert.equal(invoke(["stop"]).status, 0);
  installCandidate();
  const stoppedUpdate = invoke(["update", "--json"]);
  assert.equal(stoppedUpdate.status, 0, stoppedUpdate.stderr);
  assert.equal((await controlService(f.home, "status")).serviceVersion, version, "原已停止时更新后启动");
  assert.equal(invoke(["stop"]).status, 0);
  installCandidate();
  const occupied = createServer();
  await new Promise(resolve => occupied.listen(0, "127.0.0.1", resolve));
  try {
    writeFileSync(join(f.dataDir, "config.json"), JSON.stringify({ ...JSON.parse(config), port: occupied.address().port }));
    // 保留真实 TCP listener，不阻塞本测试事件循环。
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [f.cli, "update", "--home", f.home, "--json"], { cwd: f.root, env, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "", stderr = "";
      child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
      child.once("error", reject); child.once("close", status => resolve({ status, stdout, stderr }));
    });
    failure(result, "start", "unknown");
    await assert.rejects(controlService(f.home, "status"), error => error.kind === "unreachable");
  } finally {
    await new Promise(resolve => occupied.close(resolve));
    writeFileSync(join(f.dataDir, "config.json"), config);
  }
  installCandidate();
  const db = new DatabaseSync(join(f.dataDir, "tasks.sqlite"));
  try { db.exec("DROP TABLE storage_format"); } finally { db.close(); }
  failure(invoke(["update", "--json"]), "check", "stopped");
  await assert.rejects(controlService(f.home, "status"), error => error.kind === "unreachable");
  assert.equal(JSON.parse(invoke(["migrate", "--check", "--json"]).stdout).migrationRequired, true);
});
