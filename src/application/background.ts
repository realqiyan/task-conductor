import { spawn } from "node:child_process";
import { closeSync, constants, fstatSync, openSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";
import { controlService, ControlError } from "../integrations/local-service/control.js";
import type { Ready } from "../integrations/local-service/control.js";

async function startBackground(home: string): Promise<void> {
  const fd = openSync(join(home, "launcher.log"), constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid!() || (stat.mode & 0o077)) throw new Error("Expected a private launcher log");
    const child = spawn(process.execPath, [fileURLToPath(new URL("../../scripts/service-runner.mjs", import.meta.url)), home], {
      cwd: home, env: { ...process.env }, detached: true, stdio: ["ignore", fd, fd],
    });
    await new Promise<void>((resolve, reject) => {
      child.once("error", () => reject(new Error("Cannot start background service; inspect the private launcher log")));
      child.once("spawn", () => { child.unref(); resolve(); });
    });
  } finally { closeSync(fd); }
}

/** MCP 接入与包更新共用后台启动及认证就绪检查。 */
export async function connectBackground(home: string): Promise<Ready> {
  const deadline = Date.now() + 40_000;
  let mayStart = true;
  while (Date.now() < deadline) {
    try { return await controlService(home, "status", 2000); }
    catch (error) {
      if (!(error instanceof ControlError) || error.kind === "invalid") throw error;
      if (error.kind === "unreachable" && mayStart) {
        mayStart = false;
        await startBackground(home);
      } else mayStart = false;
    }
    // 并发接入可同时启动，由已有 launcher 锁确定唯一所有者。
    await setTimeout(200);
  }
  throw new Error("Background service did not become ready; inspect the private launcher log and use task-conductor status. No restart was attempted");
}
