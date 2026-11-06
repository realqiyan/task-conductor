import { existsSync } from "node:fs";
import { join } from "node:path";
import { configSchema } from "../configuration/contract.js";
import { readEnvironment, startupPaths } from "../configuration/files.js";
import { readPrivateText } from "../infrastructure/private-files.js";
import { serveStdio } from "../protocol/stdio.js";
import { connectBackground } from "./background.js";

/** The stdio connection owns neither the shared launcher nor persisted work. */
export async function runMcp(home: string): Promise<void> {
  const workspace = process.cwd();
  if (!existsSync(join(home, "launch.json"))) throw new Error("Task Conductor is not initialized; run task-conductor setup first");
  startupPaths(home);
  const ready = await connectBackground(home);
  const paths = startupPaths(home);
  let config: ReturnType<typeof configSchema.parse>;
  try { config = configSchema.parse(JSON.parse(readPrivateText(paths.configPath))); }
  catch { throw new Error("Cannot read service configuration; inspect the private startup files"); }
  const token = readEnvironment(paths.environmentPath)[config.tokenEnv];
  if (!token) throw new Error("Service credential is unavailable; inspect the private startup files");
  await serveStdio({ url: ready.url, token, workspace });
}
