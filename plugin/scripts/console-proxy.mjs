import { execFile } from "node:child_process";
import { Readable } from "node:stream";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Browser-facing route owned by this bundle. Keep it disjoint from the Host API. */
export const CONSOLE_API_PATH = "/task-conductor/api";
const SESSION_PATH = CONSOLE_API_PATH + "/session";
const ADMIN_PATH = "/admin/api";
const TOKEN_RECORD = "task-conductor/admin-token";
const MAX_REQUEST_BYTES = 512 * 1024;
const STATUS_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 65_000;
const DISCOVERY_TTL_MS = 10_000;

class ConsoleProxyError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}

/** The console URL is a local administrator address minted by the running service. */
export function consoleOrigin(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new ConsoleProxyError("Task Conductor 返回的控制台地址无效。", 502); }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.search || url.hash ||
    (url.pathname !== "/admin/" && url.pathname !== "/admin")) {
    throw new ConsoleProxyError("Task Conductor 返回的控制台地址不是本机管理地址。", 502);
  }
  return url.origin;
}

function targetPath(raw) {
  let url;
  try { url = new URL(raw ?? "/", "http://localhost"); }
  catch { throw new ConsoleProxyError("管理请求地址无效。", 400); }
  if (!url.pathname.startsWith(CONSOLE_API_PATH + "/")) throw new ConsoleProxyError("管理接口不存在。", 404);
  const suffix = url.pathname.slice(CONSOLE_API_PATH.length);
  if (!/^\/[A-Za-z0-9_\-/]*$/.test(suffix) || suffix.includes("//") ||
    suffix.split("/").slice(1).some(segment => segment === "" || segment === "." || segment === "..")) {
    throw new ConsoleProxyError("管理请求路径无效。", 400);
  }
  if (url.search.length > 2_048) throw new ConsoleProxyError("管理请求参数过长。", 414);
  return ADMIN_PATH + suffix + url.search;
}

function send(res, status, body, headers = {}) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size <= MAX_REQUEST_BYTES) chunks.push(chunk);
    });
    req.once("end", () => size > MAX_REQUEST_BYTES
      ? reject(new ConsoleProxyError("管理请求体过大。", 413)) : resolve(Buffer.concat(chunks)));
    req.once("error", reject);
    req.once("aborted", () => reject(new ConsoleProxyError("管理请求已中断。", 400)));
  });
}

/** Read the optional remembered administrator token; the value never reaches the browser. */
async function savedToken(ctx) {
  const credentials = ctx.get?.("credentials");
  if (!credentials?.readRecord) return undefined;
  try {
    const record = await credentials.readRecord(TOKEN_RECORD);
    return record?.kind === "api-key" && typeof record.key === "string" && /^[!-~]{16,512}$/.test(record.key)
      ? record.key : undefined;
  } catch { return undefined; }
}

async function rememberToken(ctx, token) {
  const credentials = ctx.get?.("credentials");
  if (!credentials?.modifyRecord) throw new ConsoleProxyError("dsh 凭据服务不可用，无法保存管理员令牌。");
  await credentials.modifyRecord(TOKEN_RECORD, async () => ({ kind: "api-key", key: token }));
}

async function forgetToken(ctx) {
  const credentials = ctx.get?.("credentials");
  if (credentials?.deleteRecord) await credentials.deleteRecord(TOKEN_RECORD);
}

/**
 * Serve the Task Conductor administrator API through the Harness origin.
 * The browser sends the administrator token per request, or the proxy reads the
 * token the user chose to remember from the Harness credential store. Discovery
 * only reads the public status address reported by the local launcher.
 */
export function registerConsoleProxy(ctx, options = {}) {
  const command = typeof options.command === "string" && options.command
    ? options.command : process.env.TASK_CONDUCTOR_PREFLIGHT_COMMAND ?? "task-conductor";
  const home = typeof options.home === "string" && options.home
    ? options.home : process.env.TASK_CONDUCTOR_PREFLIGHT_HOME;
  let cached;
  let discovery;

  async function discover(force = false) {
    if (!force && cached && cached.expires > Date.now()) return cached.origin;
    discovery ??= (async () => {
      const args = ["status", "--json"];
      if (home) args.push("--home", home);
      let stdout;
      try {
        ({ stdout } = await run(command, args, { cwd: process.cwd(), timeout: STATUS_TIMEOUT_MS,
          maxBuffer: 64 * 1024, encoding: "utf8", windowsHide: true }));
      } catch (error) {
        if (typeof error?.stdout === "string" && error.stdout) stdout = error.stdout;
        else if (error?.code === "ENOENT") throw new ConsoleProxyError("无法启动 task-conductor 命令；请确认插件宿主 PATH 中的命令可用。");
        else if (error?.killed || error?.signal === "SIGTERM") throw new ConsoleProxyError("读取 Task Conductor 状态超时，请稍后重试。");
        else throw new ConsoleProxyError("读取 Task Conductor 状态失败，请确认服务与配置后重试。");
      }
      let report;
      try { report = JSON.parse(stdout); }
      catch { throw new ConsoleProxyError("Task Conductor 状态输出无法读取。", 502); }
      if (!report || typeof report !== "object" || Array.isArray(report)) throw new ConsoleProxyError("Task Conductor 状态输出无效。", 502);
      if (typeof report.consoleUrl !== "string") {
        if (report.event === "unreachable") throw new ConsoleProxyError("Task Conductor 服务未运行。启动服务后重试。");
        if (report.adminEnabled === false || report.consoleUrl === null) throw new ConsoleProxyError("管理员 API 未启用。请在停服后配置管理员令牌，再启动服务。");
        throw new ConsoleProxyError("无法确认 Task Conductor 控制台地址。请用 task-conductor status 核查。", 502);
      }
      const origin = consoleOrigin(report.consoleUrl);
      cached = { origin, expires: Date.now() + DISCOVERY_TTL_MS };
      return origin;
    })().finally(() => { discovery = undefined; });
    return discovery;
  }

  async function forward(req, res, path) {
    const header = req.headers.authorization;
    const supplied = typeof header === "string" && /^Bearer [!-~]{16,512}$/.test(header) ? header : undefined;
    const remembered = supplied === undefined ? await savedToken(ctx) : undefined;
    const authorization = supplied ?? (remembered === undefined ? undefined : "Bearer " + remembered);
    if (authorization === undefined) {
      send(res, 401, { error: "请先输入管理员令牌。" }, { "WWW-Authenticate": "Bearer" });
      return;
    }
    if (req.method !== "GET" && req.method !== "POST") {
      send(res, 405, { error: "管理接口只接受 GET 或 POST。" }, { Allow: "GET, POST" });
      return;
    }
    let body;
    if (req.method === "POST") {
      if (String(req.headers["content-type"]).split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
        send(res, 415, { error: "管理请求须为 JSON。" });
        return;
      }
      try { body = await readBody(req); }
      catch (error) { send(res, error.status ?? 400, { error: error.message ?? "管理请求无法读取。" }); return; }
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    res.once("close", abort);
    const timeout = setTimeout(abort, REQUEST_TIMEOUT_MS);
    try {
      const origin = await discover();
      const response = await fetch(origin + path, {
        method: req.method,
        headers: { Authorization: authorization, Origin: origin,
          ...(req.method === "POST" ? { "Content-Type": "application/json" } : {}) },
        body: req.method === "POST" ? body : undefined,
        redirect: "error", cache: "no-store", signal: controller.signal,
      });
      if (remembered !== undefined && response.status === 401) {
        await forgetToken(ctx).catch(() => {});
      }
      res.writeHead(response.status, {
        "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      if (response.body) Readable.fromWeb(response.body).pipe(res);
      else res.end();
    } catch (error) {
      cached = undefined;
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) { res.destroy(); return; }
      if (controller.signal.aborted && !res.destroyed) {
        send(res, 504, { error: "Task Conductor 管理请求超时，请稍后重试。" });
      } else {
        send(res, 503, { error: "无法连接 Task Conductor 服务，请确认服务正在运行后重试。" });
      }
    } finally {
      clearTimeout(timeout);
      res.off("close", abort);
    }
  }

  async function session(req, res) {
    if (req.method === "GET") {
      send(res, 200, { data: { saved: Boolean(await savedToken(ctx)) } });
      return;
    }
    if (req.method === "DELETE") {
      try { await forgetToken(ctx); send(res, 200, { data: { saved: false } }); }
      catch { send(res, 503, { error: "无法清除已保存的管理员令牌。" }); }
      return;
    }
    if (req.method !== "POST") {
      send(res, 405, { error: "会话接口只接受 GET、POST 或 DELETE。" }, { Allow: "GET, POST, DELETE" });
      return;
    }
    if (String(req.headers["content-type"]).split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
      send(res, 415, { error: "管理员令牌请求须为 JSON。" });
      return;
    }
    let body;
    try { body = JSON.parse((await readBody(req)).toString("utf8")); }
    catch { send(res, 400, { error: "管理员令牌请求无法读取。" }); return; }
    const token = body?.token;
    if (typeof token !== "string" || !/^[!-~]{16,512}$/.test(token)) {
      send(res, 400, { error: "管理员令牌格式无效。" });
      return;
    }
    try { await rememberToken(ctx, token); send(res, 200, { data: { saved: true } }); }
    catch { send(res, 503, { error: "无法保存管理员令牌；请检查 dsh 凭据服务。" }); }
  }

  return ctx.effect(() => {
    const disposeSession = ctx.webServer.register({ kind: "exact", path: SESSION_PATH, async handler(req, res) {
      const rejection = ctx.connection.requestRejection(req);
      if (rejection) { send(res, rejection, { error: rejection === 401 ? "dsh 会话未认证。" : "请求来源不被信任。" }); return; }
      await session(req, res);
    } });
    const disposeApi = ctx.webServer.register({
      kind: "prefix",
      path: CONSOLE_API_PATH,
      async handler(req, res) {
        // The Harness owns browser authentication; the administrator token stays separate.
        const rejection = ctx.connection.requestRejection(req);
        if (rejection) { send(res, rejection, { error: rejection === 401 ? "dsh 会话未认证。" : "请求来源不被信任。" }); return; }
        let path;
        try { path = targetPath(req.url); }
        catch (error) { send(res, error.status ?? 400, { error: error.message }); return; }
        await forward(req, res, path);
      },
    });
    return () => { disposeApi(); disposeSession(); };
  }, "task-conductor: administrator proxy");
}
