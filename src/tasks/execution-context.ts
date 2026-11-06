import { TaskError } from "../shared/errors.js";
import { OUTPUT_LIMIT } from "../shared/limits.js";
import type { NodeDefinition } from "./model.js";

/** 按结果文件布局预留直接上游和旧交付；摘录按 JSON 最大转义长度计算。 */
export function validateExecutionContext(node: NodeDefinition, resultsRoot: string): void {
  const uuid = "00000000-0000-4000-8000-000000000000";
  const resultFile = (nodeId: string) => `${resultsRoot}/${uuid}/${nodeId}.${uuid}.txt`;
  try {
    executionContext(node, {
      kind: "supplement",
      upstream: node.dependsOn.map(nodeId => ({ nodeId, resultFile: resultFile(nodeId) })),
      previousDelivery: { resultFile: resultFile(node.id), excerpt: "\u0001".repeat(500), length: OUTPUT_LIMIT },
    });
  } catch (error) {
    if (!(error instanceof TaskError)) throw error;
    throw new TaskError("validation", "节点要求与必要交付引用组成的上下文超过 128000 字符，任务未创建");
  }
}

/** 新会话提供完整节点要求；同会话续接只提供本轮要求和当前依据。 */
export function executionContext(node: NodeDefinition, context?: {
  continuing?: boolean;
  kind?: "execute" | "clarify" | "supplement";
  message?: string;
  userMessages?: { content: string; createdAt: string; question?: string }[];
  upstream?: { nodeId: string; resultFile: string }[];
  previousDelivery?: { resultFile: string; excerpt: string; length: number };
}): string {
  const parts: string[] = [];
  if (!context?.continuing) parts.push(
    "完成当前节点要求并向协调者交付；缺少必要信息或权限时说明阻碍。",
    "节点要求：\n" + node.prompt,
  );
  const kind = context?.kind ?? "execute";
  if (kind === "supplement") parts.push("已有交付供参考，本次仅执行补充要求，不重复已完成的外部操作。");
  if (context?.upstream?.length || context?.previousDelivery) parts.push("交付全文可按需读取 resultFile。");
  parts.push("执行上下文：\n" + JSON.stringify({
    request: { kind, ...(context?.message ? { message: context.message } : {}) },
    ...(context?.userMessages?.length ? { userMessages: context.userMessages } : {}),
    ...(context?.upstream?.length ? { upstream: context.upstream } : {}),
    ...(context?.previousDelivery ? { previousDelivery: context.previousDelivery } : {}),
  }));
  const text = parts.join("\n\n");
  if (text.length > 128000) {
    throw new TaskError("precondition", "节点上下文超过 128000 字符，本次未派发；可减少选定消息或精简本轮要求");
  }
  return text;
}
