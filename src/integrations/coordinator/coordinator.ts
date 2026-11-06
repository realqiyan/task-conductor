import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import { Type } from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai/models";
import { createCoordinatorProvider } from "./provider.js";
import { createRegistry, defineExtension, defineTool, GenerationTask, Harness, hook, ROOT_CONVERSATION_ID, section, ToolTask } from "@earendil-works/pi-durable";
import type { Conversation, Cursor, EntryId, GenerationCheckpoint, Submission, ToolTaskInput } from "@earendil-works/pi-durable";
import { openCoordinatorStorage } from "./storage.js";
import { memoryUpdateParameters, TaskMemory } from "./memory.js";
import { errorText, StorageError } from "../../shared/errors.js";
import type { Config } from "../../configuration/model.js";
import type { MemorySource, TaskMessage } from "../../tasks/model.js";
import { coordinatorView, deliveryView, questionView } from "./context.js";
import type { Coordinate } from "../../tasks/ports.js";

const instructions = `你负责推进已有节点，并根据交付判断整体目标是否完成。具体工作交给节点执行端。
以 task-context 中的当前状态为准，只推进 execution 指定的 running Run。普通讨论不启动空闲工作，也不回答待决问题；补充工作须有明确请求。外部结果不明时停止，不重试或重放。
按节点要求审查输出、证据和限制；end_turn 只表示协议结束，问题、拒绝和中间结果不能作为交付。依据不足时澄清，证据冲突未解决时保留不确定性。新消息或上游变化后，审查受影响的交付。
所有节点交付有效后，判断整体目标是否满足，并调用 run_complete 明确完成。缺少用户事实时提问，确认无法完成时结束 Run。
任务记忆仅保存对后续判断有价值的信息，不授予执行权限。`;

export const deliveryAcceptParameters = Type.Object({
  nodeId: Type.String(),
  turn: Type.Integer({ minimum: 1, description: "本节点最新一轮的序号；该轮须已结束且 stopReason 为 end_turn。" }),
  result: Type.String({ minLength: 1, maxLength: 262144, description: "从该轮输出中原样摘录满足节点要求的交付内容，保留必要证据和限制。" }),
  reason: Type.String({ minLength: 1, maxLength: 4000, description: "说明所选交付内容为什么满足节点要求；若审查了新增消息，同时说明这些消息为什么不影响交付。" }),
  reviewedMessageIds: Type.Optional(Type.Array(Type.String({ format: "uuid" }), { uniqueItems: true,
    description: "仅填写本轮派发后新增、已审查且不影响交付的消息 ID，须与节点 unreviewedMessageIds 完全一致；该列表为空时省略或传 []。" })),
}, { additionalProperties: false });

export const deliveryReuseParameters = Type.Object({
  nodeId: Type.String(),
  reason: Type.String({ minLength: 1, maxLength: 4000, description: "说明原交付在当前要求、用户事实和上游交付下为什么仍然有效。" }),
}, { additionalProperties: false });

/** Durable terminates only when every tool in a round requests it. Admit decisions as singleton batches. */
export function coordinatorToolBatchError(names: readonly string[]): string | undefined {
  if (names.length > 50) return "单批最多调用 50 个工具；本批未执行";
  if (names.length > 1 && names.some(name => ["task_question_ask", "run_complete", "run_fail"].includes(name))) {
    return "本批未执行。task_question_ask、run_complete、run_fail 必须各自独占工具批次。";
  }
  return undefined;
}

/** Pi owns the inbox, model loop and compaction. The business ledger owns admission and outcomes. */
export function createCoordinator(directory: string, config: NonNullable<Config["coordinator"]>, fatal?: (error: unknown) => void): Coordinate {
  return async (taskId, input, actions, signal, reconcileOnly = false) => {
    let admitted = false, boundaryFailure: unknown;
    const block = (error: unknown) => {
      // SDK tool/model error envelopes must not hide a failed business store from its application owner.
      if (error instanceof StorageError) {
        const first = !(boundaryFailure instanceof StorageError);
        boundaryFailure = error;
        if (first) fatal?.(error);
      } else boundaryFailure ??= error;
    };
    const guard = () => {
      signal.throwIfAborted();
      if (boundaryFailure) throw boundaryFailure;
      if (!admitted) throw new Error("Previous coordinator work is being stopped before input admission");
    };
    const tool: typeof defineTool = definition => defineTool({ outputLimits: { maxBytes: 262144, maxLines: 10000 }, ...definition,
      parameters: { ...definition.parameters, additionalProperties: false }, execute: async (args, api, context) => {
      try { guard(); actions.check(); return await definition.execute(args, api, context); }
      catch (error) { if (error instanceof StorageError) block(error); throw error; }
    } });
    signal.throwIfAborted();
    const models = createModels(), provider = createCoordinatorProvider(config);
    // Durable hooks fail open. A remembered hook failure must also block the actual provider/tool boundary.
    models.setProvider({ ...provider, streamSimple(model, messages, options) {
      try { guard(); actions.requestModel(); return provider.streamSimple(model, messages, options); }
      catch (error) { block(error); throw error; }
    } });
    const context = BACKGROUND_CONTEXT, inputRunId = input.runId;
    const output = (data: unknown) => ({ output: [{ type: "text" as const, text: JSON.stringify(data) }] });
    const registry = createRegistry();
    let harness: Awaited<ReturnType<typeof Harness.open>>, conversation!: Conversation;
    const submissions = new Map<string, Submission>();
    const protectedHook = async <T>(body: () => Promise<T>): Promise<T> => {
      try { return await body(); } catch (error) { block(error); throw error; }
    };
    const submit = async (message: TaskMessage) => {
      if (submissions.has(message.id)) return;
      const submission = await conversation.submit({ type: "input", requestId: message.id, whenBusy: "steer",
        content: JSON.stringify({ messageId: message.id, taskId, runId: message.runId, kind: message.kind,
          questionId: message.questionId, content: message.content,
          reference: { type: "message", messageId: message.id } satisfies MemorySource }),
        entry: { kind: "agent-task.input", data: { messageId: message.id, runId: message.runId } } }, context);
      actions.submitted(message.id, String(submission.id)); submissions.set(message.id, submission);
    };
    const project = async () => {
      const binding = actions.binding();
      let runId = binding.runId, cursor: Cursor | undefined;
      do {
        const page = await conversation.entries({ order: "ascending", ...(binding.cursor ? { minEntryId: Number(binding.cursor) as EntryId } : {}) }, 100, cursor, context);
        for (const entry of page.items) {
          if (String(entry.id) === binding.cursor) continue;
          if (entry.kind === "agent-task.input" && entry.data && typeof entry.data === "object" && !Array.isArray(entry.data)) {
            runId = typeof entry.data["runId"] === "string" ? entry.data["runId"] : null;
          }
          // Only committed assistant text is public. Never expose thinking, prompts, tool arguments or tool results.
          const text = entry.kind === "pi.assistant" ? entry.model?.flatMap(message => message.role === "assistant" &&
            !["error", "aborted"].includes(message.stopReason)
            ? message.content.flatMap(block => block.type === "text" ? [block.text] : []) : []).join("\n") : undefined;
          actions.project(String(entry.id), runId, text);
        }
        cursor = page.next;
      } while (cursor);
    };
    const pump = async () => {
      if (signal.aborted || !admitted) return;
      await project();
      for (const message of actions.pending()) await submit(message);
    };
    registry.install(defineExtension({
      name: "task-coordinator",
      sections: [section("role", () => instructions, { tag: false }),
        section("task-memory", (input, context) => protectedHook(async () => {
          const memory = await input.read.snapshot(TaskMemory, input.conversationId, context);
          if (!memory) throw new StorageError("Task memory is missing");
          actions.validateMemory(memory.items);
          const items = memory.items.filter(item => item.scope.type === "task" || item.scope.runId === inputRunId);
          return items.length ? JSON.stringify(items) : undefined;
        }))],
      hooks: [hook(ToolTask, {
        beforeTool: async (_call, api, context) => {
          guard();
          const task = await harness.getTask(api.taskId, context);
          if (!task || task.kind !== ToolTask.definition.name) throw new Error("Coordinator tool task is missing");
          const input = task.input as ToolTaskInput;
          if (input.kind !== "model") return { block: "Coordinator tools require a direct model call" };
          const stored = await storage.entry(api.conversationId, input.assistant, context);
          if (!stored || stored.entry.kind !== "pi.assistant") throw new Error("Coordinator tool batch is missing");
          const names = stored.entry.model?.flatMap(message => message.role === "assistant"
            ? message.content.flatMap(block => block.type === "toolCall" ? [block.name] : []) : []) ?? [];
          if (!names.length) throw new Error("Coordinator tool batch is empty");
          const error = coordinatorToolBatchError(names);
          return error ? { block: error } : undefined;
        },
      }), hook(GenerationTask, {
        beforeRequest: async (request, api, context) => protectedHook(async () => {
          const memory = await api.snapshot(TaskMemory, api.conversationId, context);
          if (!memory) throw new StorageError("Task memory is missing");
          actions.validateMemory(memory.items);
          const generation = await harness.getTask(api.taskId, context);
          if (!generation || generation.state.status === "terminal") throw new Error("Generation is no longer active");
          const checkpoint = generation.state.checkpoint as GenerationCheckpoint;
          if (checkpoint.phase !== "request") throw new Error("Generation has no fixed input cutoff");
          const view = await conversation.context(context, { at: checkpoint.cutoff });
          const ids = view.entries.flatMap(entry => entry.kind === "agent-task.input" && entry.data && typeof entry.data === "object" &&
            !Array.isArray(entry.data) && typeof entry.data["messageId"] === "string" ? [entry.data["messageId"]] : []);
          actions.observe(ids);
          // 在输入观察屏障之后构建，避免把已失效的验收状态送给模型。
          return { messages: [...request.messages, { role: "system" as const, timestamp: Date.now(),
            content: "task-context：\n" + JSON.stringify(coordinatorView(actions)) }] };
        }),
        afterTools: async () => protectedHook(pump),
        onYield: async () => { await protectedHook(pump); return undefined; },
      })],
      tools: [
        tool({ name: "task_inspect", description: "补全 task-context 中被截断或缺少的依据，已有完整内容无需重读。默认返回运行概览；offset/limit 按消息分页。goal、nodeId、messageId 分别按字符读取目标、节点要求、消息全文。execution 为 null 时仅可讨论。",
          parameters: Type.Object({ runId: Type.Optional(Type.String({ format: "uuid", description: "只选择查看哪次执行；默认本次输入对应或最新 Run。" })),
            messageId: Type.Optional(Type.String({ format: "uuid", description: "读取本 Task 中已经观察的消息，不受所选 Run 限制。" })),
            nodeId: Type.Optional(Type.String({ description: "读取该节点的固定要求；运行状态见默认概览。" })), goal: Type.Optional(Type.Boolean()), offset: Type.Optional(Type.Integer({ minimum: 0 })),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 16000 })) }), replay: "safe", execute: async args => {
            return output(coordinatorView(actions, args));
          } }),
        tool({ name: "node_execute", description: "执行节点或在原 ACP 会话中澄清未验收输出；所有直接上游须有当前有效交付（succeeded）。执行端已有固定要求和交付引用；按需补充本节点缺少的背景、约束和交付标准。",
          parameters: Type.Object({ nodeId: Type.String(), message: Type.Optional(Type.String({ minLength: 1, maxLength: 64000,
              description: "本轮要做的工作及必要背景。首次执行可省略；澄清时指出待解决问题；补充时明确变更和范围。固定节点要求已提供，无须重复。" })),
            contextMessageIds: Type.Optional(Type.Array(Type.String({ format: "uuid" }), { maxItems: 20,
              description: "从 execution.contextMessages.items 选择本节点需要的 messageId；所选消息及回答的原问题会一并提供。" })) }), replay: "unsafe",
          execute: async args => {
            const node = await actions.converse(args.nodeId, args.message, args.contextMessageIds), turn = node.turns.at(-1);
            return output({ nodeId: node.definition.id, status: node.status, turn: node.turns.length,
              output: turn?.output.slice(0, 16000), outputLength: turn?.output.length, stopReason: turn?.stopReason, error: node.error });
          } }),
        tool({ name: "node_output_read", description: "按字符范围读取节点原始输出或已验收交付，包括补充工作引用的旧交付。turn 与 deliveryId 二选一。",
          parameters: Type.Object({ nodeId: Type.String(), runId: Type.Optional(Type.String({ format: "uuid", description: "只选择查看哪次执行；默认本次输入对应或最新 Run。" })), turn: Type.Optional(Type.Integer({ minimum: 1 })),
            deliveryId: Type.Optional(Type.String()), offset: Type.Integer({ minimum: 0 }), limit: Type.Integer({ minimum: 1, maximum: 16000 }) }), replay: "safe",
          execute: async args => {
            if (Boolean(args.turn) === Boolean(args.deliveryId)) throw new Error("Choose a turn or deliveryId");
            const run = actions.inspect(args.runId).run;
            const node = run?.nodes.find(node => node.definition.id === args.nodeId);
            const turn = args.turn ? node?.turns[args.turn - 1] : undefined;
            const delivery = args.deliveryId ? [...node?.deliveries ?? [], ...node?.baseline ? [node.baseline] : []].find(value => value.id === args.deliveryId) : undefined;
            const text = turn?.output ?? delivery?.text;
            if (text === undefined) throw new Error("Unknown output");
            return output({ reference: delivery ? deliveryView(delivery).reference : { type: "run", runId: run!.id } satisfies MemorySource,
              text: text.slice(args.offset, args.offset + args.limit), length: text.length,
              next: text.length > args.offset + args.limit ? args.offset + args.limit : null, stopReason: turn?.stopReason });
          } }),
        tool({ name: "node_delivery_accept", description: "验收节点最新一轮输出，将满足节点要求的原文摘录保存为新交付，保留原交付。该轮使用的上游交付须与当前一致。",
          parameters: deliveryAcceptParameters, replay: "unsafe",
          execute: async args => {
            const delivery = await actions.accept(args.nodeId, args.turn, args.result, args.reason, false, args.reviewedMessageIds);
            return output({ accepted: true, delivery: deliveryView(delivery) });
          } }),
        tool({ name: "node_delivery_reuse", description: "确认已有交付在当前事实和依赖下仍适用后复用，stale 节点恢复为 succeeded，无需执行节点。使用当前 Run 最近的已验收交付；没有时使用 baseline 中的旧交付。",
          parameters: deliveryReuseParameters, replay: "unsafe",
          execute: async args => {
            const delivery = await actions.accept(args.nodeId, 0, "", args.reason, true);
            return output({ accepted: true, delivery: deliveryView(delivery) });
          } }),
        tool({ name: "run_complete", description: "完成 execution 指定的 Run；须确认每个节点的交付仍然有效且整体目标已满足。本次回复只调用此工具。",
          parameters: Type.Object({ summary: Type.String({ minLength: 1, maxLength: 16000 }) }), replay: "unsafe",
          execute: async args => { actions.finish(args.summary); return { ...output({ completed: true }), control: { terminate: true as const } }; } }),
        tool({ name: "task_question_ask", description: "等待正在进行的节点回复结束后，向用户询问缺少的事实，并暂停 execution 指定的 Run。不能用于申请执行权限。本次回复只调用此工具。",
          parameters: Type.Object({ nodeId: Type.Optional(Type.String()),
            question: Type.String({ minLength: 1, maxLength: 4000 }), completedWork: Type.String({ minLength: 1, maxLength: 4000 }) }), replay: "unsafe",
          execute: async args => {
            const question = actions.ask({ ...args, question: args.question.trim(), completedWork: args.completedWork.trim() });
            return { ...output(questionView(question, inputRunId!)), control: { terminate: true as const } };
          } }),
        tool({ name: "run_fail", description: "将 execution 指定的 Run 结束为失败；仅缺少用户事实时应先提问。本次回复只调用此工具。",
          parameters: Type.Object({ reason: Type.String({ minLength: 1, maxLength: 4000 }) }), replay: "unsafe",
          execute: async args => { actions.stop("failed", args.reason); return { ...output({ stopped: true }), control: { terminate: true as const } }; } }),
        tool({ name: "task_memory_read", description: "读取全部任务笔记，包括当前上下文未展示的其他 Run 笔记。", parameters: Type.Object({}), replay: "safe",
          execute: async (_args, api, context) => {
            const memory = await api.snapshot(TaskMemory, api.conversationId, context);
            if (!memory) throw new StorageError("Task memory is missing");
            actions.validateMemory(memory.items); return output(memory);
          } }),
        tool({ name: "task_memory_update", description: "按 key 新增、更新或删除笔记。不复制执行流水或保存凭据。",
          parameters: memoryUpdateParameters, replay: "safe",
          execute: async (args, api, context) => {
            await api.commit(async tx => {
              const memory = await tx.doc(TaskMemory, api.conversationId);
              memory.items = actions.updateMemory(memory.items, args.items, args.removeKeys ?? []);
            }, context);
            return output({ saved: true });
          } }),
      ],
    }));
    const binding = actions.binding();
    const storage = await openCoordinatorStorage(directory, taskId, binding.conversationId !== null);
    try {
      if (binding.conversationId !== null && (binding.conversationId !== String(ROOT_CONVERSATION_ID) ||
        !await storage.conversation(ROOT_CONVERSATION_ID, context))) throw new StorageError("Bound task conversation identity is missing or mismatched");
      if (binding.cursor !== null && !await storage.entry(ROOT_CONVERSATION_ID, Number(binding.cursor) as EntryId, context)) {
        throw new StorageError("Published conversation history is missing; no replacement or replay");
      }
      harness = await Harness.open(storage, { models, registry,
        settings: { retry: { enabled: false }, stream: { maxRetries: 0, timeoutMs: 120000 } } }, context);
    } catch (error) { await storage.close(context); throw error; }
    // abort 持久终止 SDK 工作并等待回执；close 仅释放资源，不能代替 abort。
    let stopping: Promise<void> | undefined;
    const stop = () => stopping ??= (async () => {
      admitted = false;
      if (conversation) await conversation.abort(withAbortSignal(AbortSignal.timeout(10_000), context), { background: true });
    })();
    const abort = () => { void stop().catch(block); };
    try {
      signal.throwIfAborted();
      conversation = await harness.root(context, { agent: { model: { provider: config.provider, modelId: config.model } } });
      signal.addEventListener("abort", abort, { once: true });
      signal.throwIfAborted();
      if (binding.conversationId !== null && !await harness.snapshot(TaskMemory, conversation.id, context)) throw new StorageError("Bound task memory is missing; no replacement created");
      if (binding.conversationId === null) await conversation.commit(async tx => { await tx.doc(TaskMemory, conversation.id); }, context);
      actions.bind(String(conversation.id));
      if (reconcileOnly) {
        // Read-only recovery of committed public output/receipts. Never resume the old model or tools.
        await project();
        const receipt = await storage.submissionByRequest(conversation.id, input.id, context);
        if (receipt) actions.submitted(input.id, String(receipt.id));
        actions.settle(input.id, receipt?.status === "done" ? undefined : "Execution ended before this input settled; no replay.");
        return;
      }
      // Reuse the SAME durable request after a cross-database crash; never invent a replacement conversation.
      if (!await storage.submissionByRequest(conversation.id, input.id, context)) {
        await conversation.abort(context, { background: true });
        await conversation.configure({ model: { provider: config.provider, modelId: config.model } }, context);
      }
      admitted = true;
      await submit(input);
      await pump();
      const completed = new Set<string>();
      do {
        for (const [id, submission] of submissions) {
          if (completed.has(id)) continue;
          const settled = await submission.wait(withAbortSignal(signal, context));
          await project();
          actions.settle(id, settled.status === "done" ? undefined : boundaryFailure || signal.aborted
            ? errorText(boundaryFailure ?? signal.reason) : "协调输入未完成：" + settled.reason);
          completed.add(id);
          if (settled.status !== "done") throw new Error("Coordinator unanswered: " + settled.reason);
        }
        await pump();
      } while (completed.size < submissions.size);
      if (boundaryFailure) throw boundaryFailure;
    } catch (error) {
      const failure = error instanceof StorageError ? error : boundaryFailure ?? signal.reason ?? error;
      try {
        await stop();
        if (failure instanceof StorageError) throw failure;
        if (conversation) await project();
        for (const [id, submission] of submissions) {
          const receipt = await submission.status(context);
          actions.settle(id, receipt.status === "done" ? undefined : errorText(failure));
        }
      } catch (cleanupError) {
        if (failure instanceof StorageError) throw failure;
        const cleanupFailure = new StorageError("协调会话收尾失败；保留记录并停止服务，禁止重放", { cause: cleanupError });
        block(cleanupFailure);
        throw cleanupFailure;
      }
      throw failure;
    } finally {
      signal.removeEventListener("abort", abort);
      await harness.close(context);
    }
  };
}
