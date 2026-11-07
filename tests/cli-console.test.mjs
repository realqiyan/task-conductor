import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

function fixture(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "task-conductor-console-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "home"), dataDir = join(root, "selected-data");
  for (const path of [home, dataDir]) mkdirSync(path, { mode: 0o700 });
  const environmentPath = join(dataDir, "environment.json");
  const adminToken = randomBytes(32).toString("hex"), serviceToken = randomBytes(32).toString("hex"), modelKey = randomBytes(32).toString("hex");
  const environment = { TASK_CONDUCTOR_ADMIN_TOKEN: adminToken, TASK_CONDUCTOR_TOKEN: serviceToken, OPENAI_API_KEY: modelKey };
  writeFileSync(join(home, "launch.json"), JSON.stringify({ dataDir }), { mode: 0o600 });
  writeFileSync(environmentPath, JSON.stringify(environment), { mode: 0o600 });
  const invoke = (...args) => spawnSync(process.execPath, [resolve("bin/task-conductor.mjs"), "console", ...args, "--home", home], {
    env: { ...process.env, TASK_CONDUCTOR_ADMIN_TOKEN: "inherited-token-must-not-be-used" },
    encoding: "utf8", timeout: 5000,
  });
  return { home, dataDir, environmentPath, environment, adminToken, serviceToken, modelKey, invoke };
}

test("console token reads only the selected private administrator token without starting or changing the service", t => {
  const f = fixture(t), before = readFileSync(f.environmentPath, "utf8");
  const plain = f.invoke("token");
  assert.equal(plain.status, 0, plain.stderr);
  assert.equal(plain.stdout, f.adminToken + "\n");
  assert.equal(plain.stderr, "");
  const json = f.invoke("token", "--json");
  assert.equal(json.status, 0, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout), { token: f.adminToken });
  assert.equal(json.stderr, "");
  for (const secret of [f.serviceToken, f.modelKey]) {
    assert(!(plain.stdout + json.stdout).includes(secret), "only the administrator token may be displayed");
  }
  assert.equal(readFileSync(f.environmentPath, "utf8"), before);
  assert.deepEqual(readdirSync(f.home), ["launch.json"]);
  assert.deepEqual(readdirSync(f.dataDir), ["environment.json"]);
});

test("console token rejects missing credentials, unsafe files and invalid arguments without exposing secrets", t => {
  const f = fixture(t);
  const rejects = (...args) => {
    const result = f.invoke(...args);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    for (const secret of Object.values(f.environment)) assert(!result.stderr.includes(secret));
  };
  rejects("token", "--yes");
  rejects("token", "extra");
  rejects("unknown");
  chmodSync(f.environmentPath, 0o644);
  rejects("token");
  chmodSync(f.environmentPath, 0o600);
  const target = join(f.dataDir, "original.json");
  writeFileSync(target, JSON.stringify(f.environment), { mode: 0o600 });
  unlinkSync(f.environmentPath);
  symlinkSync(target, f.environmentPath);
  rejects("token");
  unlinkSync(f.environmentPath);
  const { TASK_CONDUCTOR_ADMIN_TOKEN: _removed, ...withoutAdmin } = f.environment;
  writeFileSync(f.environmentPath, JSON.stringify(withoutAdmin), { mode: 0o600 });
  rejects("token");
  writeFileSync(f.environmentPath, '{"secret":"' + f.modelKey, { mode: 0o600 });
  rejects("token", "--json");
});
