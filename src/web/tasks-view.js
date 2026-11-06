import { element, group, heading, panel, empty, badge, stack, table, facts, block, disclosure, time } from "./dom.js";

const statuses = {
  active: ["已启用", "good"], paused: ["已暂停", "warn"], completed: ["触发结束", "neutral"], expired: ["已到期", "neutral"],
  cancelled: ["已取消", "neutral"], running: ["运行中", "info"], succeeded: ["已完成", "good"], failed: ["失败", "bad"],
  interrupted: ["已中断", "bad"], skipped: ["已跳过", "neutral"], timed_out: ["已超时", "bad"], waiting_input: ["待回答", "warn"],
  pending: ["待执行", "neutral"], awaiting_review: ["待验收", "warn"], stale: ["待复核", "warn"], blocked: ["已阻塞", "bad"],
};
const status = value => badge(...(statuses[value] ?? [value, "neutral"]));
function schedule(value) {
  if (value.type === "now") return stack("立即执行", "单次");
  if (value.type === "once") return stack("定时执行", time(value.at));
  return stack("周期执行", value.expression + " · " + value.timezone);
}
function nextTrigger(task) {
  if (task.scheduleStatus === "paused") return stack("已暂停", task.nextAt === null ? "无未来触发" : "原计划 " + time(task.nextAt));
  return task.nextAt === null ? element("span", "无后续计划", "muted") : time(task.nextAt);
}
function paging(root, page, state, link) {
  if (!state.after && page.next === null) return;
  root.append(group("pagination", element("span", "第 " + (Math.floor((state.after ?? 0) / 20) + 1) + " 页 · 本页 " + page.items.length + " 条", "hint"),
    group("actions", state.after ? link("上一页", { ...state, after: Math.max(0, state.after - 20) }, "button") : element("span", "上一页", "button disabled"),
      page.next === null ? element("span", "下一页", "button disabled") : link("下一页", { ...state, after: page.next }, "button"))));
}
export async function renderTasks(root, state, context) {
  if (state.kind === "task") return renderTask(root, state, context);
  if (state.kind === "run") return renderRun(root, state, context);
  const page = await context.request("/tasks?after=" + state.after);
  root.append(heading("任务", "查看执行进度、交付与触发计划。"));
  const list = panel("任务列表");
  if (!page.items.length) list.append(empty(state.after ? "本页没有任务" : "还没有任务", "在已连接的 MCP 客户端中创建任务，提交后会出现在这里。"));
  else list.append(table(["任务名称", "触发计划", "计划状态", "下次触发"], page.items.map(task => [
    stack(context.link(task.name, { kind: "task", id: task.id, after: 0, listAfter: state.after }), task.id),
    schedule(task.schedule), status(task.scheduleStatus), nextTrigger(task),
  ])));
  paging(list, page, state, context.link); root.append(list,
    element("p", "计划状态仅表示未来触发，执行结果请查看运行历史。空闲时每 10 秒更新。", "page-note"));
}
async function renderTask(root, state, { request, link, button, confirm, notify, navigate }) {
  const [task, page] = await Promise.all([
    request("/tasks/" + encodeURIComponent(state.id)),
    request("/runs?taskId=" + encodeURIComponent(state.id) + "&after=" + state.after),
  ]);
  root.append(link("← 任务列表", { kind: "tasks", after: state.listAfter ?? 0 }, "back-link"),
    heading(task.input.name, "查看整体目标、节点计划与历次运行。", status(task.scheduleStatus)));
  const overview = panel("整体目标"); overview.append(element("p", task.input.prompt, "prose"));
  const plan = panel("触发计划");
  plan.append(facts([["执行方式", schedule(task.input.schedule)], ["下次触发", nextTrigger(task)], ["工作目录", task.workspace]]));
  if (task.nextAt !== null && ["active", "paused"].includes(task.scheduleStatus)) {
    const control = (action, label) => button(label, async () => {
      const message = action === "cancel" ? "取消后无法恢复未来触发。当前运行会继续，历史记录将保留。" :
        action === "resume" ? "恢复后按计划触发，不补跑已错过的时间。" : "暂停后不再开始新的计划运行，当前运行会继续。";
      if (!await confirm({ title: label + "？", message, confirmText: label, danger: action === "cancel" })) return;
      await request("/task-schedule-control", { taskId: task.id, action });
      notify("触发计划已更新。", "success"); await navigate(state, true);
    }, false, action === "cancel" ? "danger-text" : "");
    plan.append(group("actions", task.scheduleStatus === "active" ? control("pause", "暂停触发") : control("resume", "恢复触发"), control("cancel", "取消未来触发")));
  }
  root.append(group("detail-grid", overview, plan));
  const nodes = panel("节点计划", "执行端与依赖在任务创建时固定。只有已验收交付才能解锁下游节点。");
  nodes.append(table(["节点", "执行端", "前置节点"], task.input.nodes.map(node => [node.id, node.executorId, node.dependsOn.join("、") || "无"])),
    block("任务与执行端详情", { id: task.id, ...task.input, workspace: task.workspace, executors: task.executors }, "task-metadata"));
  const history = panel("运行历史");
  if (!page.items.length) history.append(empty("尚未开始运行", "任务触发后，可在这里查看进度与结果。"));
  else history.append(table(["运行", "运行状态", "已验收节点", "开始 / 结束", "异常"], page.items.map(run => [
    link(run.id, { kind: "run", id: run.id, taskAfter: state.after, listAfter: state.listAfter ?? 0 }), status(run.status),
    run.accepted + " / " + run.total, stack(time(run.createdAt), run.finishedAt ? time(run.finishedAt) : "尚未结束"), run.error,
  ])));
  paging(history, page, state, link); root.append(nodes, history);
}
async function renderRun(root, state, { request, link }) {
  const run = await request("/runs/" + encodeURIComponent(state.id));
  root.append(link("← 返回任务", { kind: "task", id: run.taskId, after: state.taskAfter ?? 0, listAfter: state.listAfter ?? 0 }, "back-link"),
    heading("运行详情", run.id, status(run.status)));
  const accepted = run.nodes.filter(node => node.status === "succeeded").length;
  const overview = panel("运行概况");
  overview.append(facts([["开始时间", time(run.createdAt)], ["结束时间", run.finishedAt ? time(run.finishedAt) : "尚未结束"], ["已验收节点", accepted + " / " + run.nodes.length]]));
  if (run.summary) overview.append(element("p", run.summary, "prose"));
  if (run.error) overview.append(group("notice error", element("strong", "运行异常"), element("p", run.error, "prose")));
  root.append(overview);
  const nodes = panel("节点进度", "已验收的交付与原始回合记录分开展示。");
  if (!run.nodes.length) nodes.append(empty("暂无节点记录", "运行尚未进入节点执行阶段。"));
  for (const node of run.nodes) {
    const details = disclosure("", node.id), summary = details.querySelector("summary");
    details.className = "node-detail";
    summary.append(group("node-title", element("strong", node.definition.id), element("span", node.definition.executorId, "hint")), status(node.status));
    details.append(facts([["开始时间", time(node.startedAt)], ["前置节点", node.definition.dependsOn.join("、") || "无"]]));
    if (node.error) details.append(element("p", node.error, "notice error"));
    if (node.result !== null) details.append(element("h3", "已验收交付"), element("pre", node.result, "delivery"), block("验收理由", node.acceptance, node.id + "-acceptance"));
    else details.append(element("p", "尚无已验收交付。", "hint"));
    details.append(block("节点与会话详情", { definition: node.definition, workspace: node.workspace, inputFiles: node.inputFiles,
      deliveryId: node.deliveryId, deliveries: node.deliveries, baseline: node.baseline, resultFile: node.resultFile, sessionId: node.sessionId }, node.id + "-metadata"));
    if (node.turns.length) details.append(disclosure("原始回合 · " + node.turns.length, node.id + "-turns",
      ...node.turns.map((turn, index) => block("回合 " + (index + 1), turn, node.id + "-turn-" + index))));
    nodes.append(details);
  }
  root.append(nodes);
  if (run.questions.length) {
    const questions = panel("问题与回复", "请在发起任务的 MCP 客户端中回答问题。");
    for (const question of run.questions) {
      const expired = Math.min(Date.parse(question.expiresAt), question.sessionExpiresAt ? Date.parse(question.sessionExpiresAt) : Infinity) <= Date.now();
      const label = question.reply ? badge("已回复", "good") : expired ? badge("已过期") : run.status !== "waiting_input" ? badge("未回复") : badge("待回答", "warn");
      const card = element("article", undefined, "question");
      card.append(label, element("h3", question.question), element("p", "节点：" + (question.nodeId ?? "整体任务") + " · 回答期限：" + time(question.expiresAt), "hint"));
      if (question.reply) card.append(element("p", question.reply.answer, "prose"));
      card.append(block("问题详情", { id: question.id, completedWork: question.completedWork, sessionExpiresAt: question.sessionExpiresAt }, question.id));
      questions.append(card);
    }
    root.append(questions);
  }
}
