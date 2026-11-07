import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { startE2e, verifyDelivery } from "./harness.mjs";

// 缺失字段仅在执行端读取输入后发现；回复为声明的测试输入，模型和 ACP 均真实运行。
test("执行端发现缺失数量后提问，回答续接同一 ACP 会话并形成交付", { timeout: 300000 }, async t => {
  const e2e = await startE2e(t);
  const marker = `CLARIFY-${randomBytes(8).toString("hex")}`, quantity = 4;
  const path = join(e2e.dir, "workspace", "record.json"), original = JSON.stringify({ marker, quantity: null });
  await writeFile(path, original, { mode: 0o600, flag: "wx" });
  const task = await e2e.create({ inputWaitSeconds: 300,
    prompt: "通过 record 节点先读取本地记录，判断需要补齐的信息。节点报告缺失后向用户提问；收到回答后在原节点会话继续处理，核对并验收最终记录。保留原文件，只读处理，不执行其他外部操作。",
    nodes: [{ id: "record", executorId: e2e.executor.id, maxRunSeconds: 180,
      prompt: `使用 read 读取 ${path}。保留其中的 marker，用明确提供的数值补齐 quantity；quantity 为 null 且没有补充值时，向协调者请求所缺数量，不猜测。数量明确后只返回包含 marker、quantity 的 JSON 对象，不加围栏或说明。只读该文件，不写入、不使用 shell 或网络工具。` }],
  });
  const waiting = await e2e.waitFor("waiting_input");
  await e2e.save("waiting-run.json", waiting);
  const before = waiting.nodes[0];
  assert.deepEqual(before.definition, task.input.nodes[0]);
  assert.equal(before.status, "awaiting_review");
  assert.ok(before.sessionId && before.turns.length > 0, "提问前必须实际读取输入并建立 ACP 会话");
  assert.equal(before.result, null);
  assert.deepEqual(before.deliveries, []);
  assert.ok(before.turns.at(-1).output.trim(), "执行端应报告缺失信息");
  assert.equal(waiting.questions.length, 1);
  const question = waiting.questions[0];
  assert.equal(question.nodeId, "record");
  assert.equal(question.reply, null);
  assert.ok(question.sessionExpiresAt && Date.parse(question.sessionExpiresAt) > Date.now(), "等待期间保留原 ACP 会话");
  const receipt = await e2e.call("task_question_answer", { taskId: task.taskId, questionId: question.questionId,
    requestKey: "missing-quantity", answer: `本次记录的数量为 ${quantity}。` });
  assert.equal(receipt.runId, waiting.runId);
  e2e.log("human_reply_submitted", { runId: waiting.runId, questionId: question.questionId, quantity, source: "declared-test-fixture" });
  const run = await e2e.waitFor("succeeded");
  await e2e.save("run.json", run);
  assert.equal(run.runId, waiting.runId);
  assert.equal(run.nodes.length, 1);
  const after = run.nodes[0];
  assert.equal(after.nodeRunId, before.nodeRunId);
  assert.deepEqual(after.definition, before.definition);
  assert.equal(after.sessionId, before.sessionId);
  assert.ok(after.turns.length > before.turns.length, "回答后必须产生新的 ACP turn");
  assert.deepEqual(after.turns.slice(0, before.turns.length), before.turns, "已有 turn 保持原记录");
  assert.ok(after.turns.every(turn => turn.sessionId === before.sessionId), "续接沿用原 ACP 会话");
  await verifyDelivery(after);
  assert.deepEqual(JSON.parse(after.result), { marker, quantity });
  assert.equal(await readFile(path, "utf8"), original);
  assert.equal(run.questions.length, 1);
  assert.equal(run.questions[0].reply.answer, receipt.content);
  e2e.log("verification_passed", { taskId: task.taskId, runId: run.runId, sessionId: after.sessionId,
    turns: after.turns.length, modelCalls: run.modelCalls });
  t.diagnostic(`已验证 Run ${run.runId}：执行端发现缺失数量，回答后续接 ACP 会话 ${after.sessionId}，原输入不变`);
});
