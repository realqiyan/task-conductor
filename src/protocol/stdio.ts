import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { version } from "../infrastructure/version.js";
import type { NotificationOrigin } from "../tasks/model.js";
import { serverInstructions } from "./mcp-contract.js";

const toolNames = new Set(["service_status", "executor_list", "task_create", "task_list", "task_get", "task_schedule_control",
  "task_run_list", "task_run_get", "task_question_answer", "task_message_send", "task_message_list", "task_run_cancel"]);

/** A fixed Task Conductor adapter; task creation receives the startup directory and optional host notification binding. */
export async function serveStdio(options: { url: string; token: string; workspace: string; readNotification?: () => NotificationOrigin }): Promise<void> {
  const url = new URL(options.url);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/mcp" || url.username || url.password || url.search || url.hash) {
    throw new Error("Invalid local MCP address");
  }
  const client = new Client({ name: "task-conductor-stdio", version });
  const server = new Server({ name: "task-conductor", version }, { capabilities: { tools: {} }, instructions: serverInstructions });
  let close: Promise<void> | undefined, finish!: () => void;
  const finished = new Promise<void>(resolve => { finish = resolve; });
  const shutdown = (): Promise<void> => close ??= Promise.resolve().then(async () => {
    try { await server.close(); } finally { try { await client.close(); } finally { finish(); } }
  });
  const stop = () => { void shutdown().catch(() => {}); };
  server.onclose = stop;
  client.onclose = stop;
  client.onerror = stop;
  server.onerror = stop;
  process.stdin.once("end", stop); process.stdin.once("close", stop);
  process.stdout.once("error", stop);
  process.once("SIGINT", stop); process.once("SIGTERM", stop); process.once("SIGHUP", stop);
  server.setRequestHandler(ListToolsRequestSchema, async request => {
    const result = await client.listTools(request.params);
    return { ...result, tools: result.tools.filter(tool => toolNames.has(tool.name)) };
  });
  server.setRequestHandler(CallToolRequestSchema, request => {
    if (!toolNames.has(request.params.name)) throw new McpError(ErrorCode.MethodNotFound, "Unknown Task Conductor tool");
    let input = request.params.arguments ?? {};
    if (request.params.name === "task_create") {
      if (options.readNotification) {
        try { input = { ...input, notification: options.readNotification() }; }
        catch {
          const value = { ok: false, code: "precondition", error: "通知绑定不可用；请检查宿主会话绑定文件后再创建任务。" };
          return { content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value, isError: true };
        }
      }
      if (input.workspace === undefined) input = { ...input, workspace: options.workspace };
    }
    return client.callTool({ ...request.params, arguments: input });
  });
  try {
    await client.connect(new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { Authorization: "Bearer " + options.token }, redirect: "error" },
    }));
    if (!close) await server.connect(new StdioServerTransport());
    await finished;
  } finally {
    await shutdown();
    process.stdin.off("end", stop); process.stdin.off("close", stop);
    process.stdout.off("error", stop);
    process.off("SIGINT", stop); process.off("SIGTERM", stop); process.off("SIGHUP", stop);
  }
}
