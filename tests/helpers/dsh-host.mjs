import { Context } from "@deepseek-ai/cordis";
import Typert from "@deepseek-ai/dsh-typert-registry";
import SessionProjection from "@deepseek-ai/dsh-session-projection";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import Tools from "@deepseek-ai/dsh-tools";
import * as Executor from "@deepseek-ai/dsh-tool-executor-native";
import Llm from "@deepseek-ai/dsh-llm";
import Sessions from "@deepseek-ai/dsh-session";
import Agents from "@deepseek-ai/dsh-agent";
import AgentLoop from "@deepseek-ai/dsh-agent-loop";
import * as Persistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import Commands from "@deepseek-ai/dsh-commands";
import Fs from "@deepseek-ai/dsh-fs-local";
import Skills from "@deepseek-ai/dsh-skill";
import WorkingDirectory from "@deepseek-ai/dsh-working-directory";
import Approval from "@deepseek-ai/dsh-user-approval";

/** 原生 Host、持久化和工具执行器；不装模型 adapter，不使用个人配置。 */
export async function dshHost(directory, { persistence = true } = {}) {
  const ctx = new Context();
  try {
    for (const plugin of [Typert, SessionProjection, SystemPrompt, Tools, Llm, Sessions, Agents, Commands]) await ctx.plugin(plugin);
    await ctx.plugin(Executor);
    await ctx.plugin(Fs, { cwd: directory });
    await ctx.plugin(Skills);
    await ctx.plugin(WorkingDirectory, { defaultDirectory: directory });
    await ctx.plugin(Approval, { policy: "never" });
    if (persistence) await ctx.plugin(Persistence, { root: directory });
    const owner = await ctx.plugin({ name: "task-conductor-test-owner",
      inject: ["agents", "sessions", ...(persistence ? ["sessionPersistence"] : []), "commands", "tools", "systemPrompt", "llm", "sessionProjections", "fs", "skills", "workingDirectory", "approval", "typert"],
      async apply(scope) { await scope.plugin(AgentLoop, { agents: [] }); },
    });
    return { ctx: owner.ctx, async close() { await owner.dispose(); await ctx.fiber.dispose(); } };
  } catch (error) { await ctx.fiber.dispose(); throw error; }
}
