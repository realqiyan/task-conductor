import { z } from "zod";
import { absolutePath, identifier, text, timestamp } from "../shared/validation.js";
import { parseCron } from "./cron.js";

export const cronScheduleData = z.object({
  type: z.literal("cron"), expression: text(200), timezone: text(100),
}).strict().superRefine((schedule, ctx) => {
  try { parseCron(schedule, Date.UTC(2000, 0, 1)).next(); }
  catch { ctx.addIssue({ code: "custom", message: "Invalid five-field Cron expression or timezone" }); }
});

export const scheduleData = z.discriminatedUnion("type", [
  z.object({ type: z.literal("now") }).strict(),
  z.object({ type: z.literal("once"), at: timestamp }).strict(),
  cronScheduleData,
]);
export const notificationOriginData = z.object({
  projectId: z.string().regex(/^(git:[0-9a-f]{64}|uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/),
  sessionId: z.string().min(1).max(200).regex(/^[a-zA-Z0-9:_-]+$/),
}).strict();
export const taskStatusSchema = z.enum(["active", "paused", "cancelled", "completed", "expired"]);
export const runStatusSchema = z.enum(["running", "succeeded", "failed", "interrupted", "skipped", "cancelled", "timed_out", "waiting_input"]);
export const nodeStatusSchema = z.enum(["pending", "running", "awaiting_review", "succeeded", "stale", "blocked", "interrupted"]);
export const nodeData = z.object({
  id: identifier, prompt: text(64_000), executorId: identifier,
  dependsOn: z.array(identifier).max(20), maxRunSeconds: z.number().int().min(1).max(3600),
}).strict();
export const questionData = z.object({ nodeId: identifier.optional(), question: text(4000), completedWork: text(4000) }).strict();
export const replyData = z.object({
  taskId: z.string().uuid(), questionId: z.string().uuid(), requestKey: identifier, answer: text(16000),
}).strict();
/** Valid internal data. No request defaults, coercion or normalization at this boundary. */
export const taskData = z.object({
  requestKey: identifier, name: text(200), prompt: text(64_000), nodes: z.array(nodeData).min(1).max(20),
  workspace: absolutePath.optional(), schedule: scheduleData, expiresAt: timestamp.optional(),
  maxRunSeconds: z.number().int().min(1).max(86_400), maxModelCalls: z.number().int().min(1).max(200),
  maxNodeTurns: z.number().int().min(1).max(10), inputWaitSeconds: z.number().int().min(1).max(604800),
}).strict();
export const taskUpdateData = z.object({
  taskId: z.string().uuid(),
  expected: z.object({ name: text(200), schedule: scheduleData, scheduleStatus: taskStatusSchema, nextAt: timestamp.nullable() }).strict(),
  name: text(200).optional(),
  schedule: z.discriminatedUnion("type", [z.object({ type: z.literal("once"), at: timestamp }).strict(), cronScheduleData]).optional(),
  enabled: z.boolean().optional(),
}).strict().refine(input => input.name !== undefined || input.schedule !== undefined || input.enabled !== undefined, "至少提供一个需要更新的字段");
export const messageData = z.object({
  taskId: z.string().uuid(), requestKey: identifier, message: text(16000),
  runId: z.string().uuid().optional(), execute: z.boolean().optional(),
}).strict().refine(input => !input.execute || input.runId !== undefined, "Supplementary execution requires a runId");
export const memorySourceData = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task"), taskId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("run"), runId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("message"), messageId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("question"), runId: z.string().uuid(), questionId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("delivery"), runId: z.string().uuid(), nodeId: identifier, deliveryId: z.string().uuid() }).strict(),
]);
export const memoryItemData = z.object({
  key: identifier, kind: z.enum(["fact", "decision", "caution", "lesson", "question"]), text: text(2000),
  sources: z.array(memorySourceData).min(1).max(10).describe("支持该笔记的来源；使用输入或工具返回的 reference。"),
  scope: z.discriminatedUnion("type", [z.object({ type: z.literal("task") }).strict(),
    z.object({ type: z.literal("run"), runId: z.string().uuid() }).strict()])
    .describe("run：本次执行专属事实、结果或假设。task：来源明确支持的持续要求、偏好或经验；历史笔记注明所属 Run，不作为默认值。按内容确定适用范围，范围不明时保留条件。"),
  basis: z.enum(["reported", "inferred"])
    .describe("reported：复述来源；inferred：协调者推断。保留不确定性，不能据此声称已独立验证或获得用户确认。"),
}).strict();
