import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { ExecutorType } from "../executors/model.js";
import type { ExecutorRegistry } from "../executors/registry.js";
import { TaskError } from "../shared/errors.js";
import { MAX_TASKS } from "../shared/limits.js";
import { iso } from "../shared/time.js";
import type { NotificationOrigin, Task, TaskInput, TaskUpdate } from "./model.js";
import type { DefinitionStore, WorkspaceAccess } from "./ports.js";
import { validateGraph } from "./graph.js";
import { validateExecutionContext } from "./execution-context.js";
import { hasUncertainOutcome, initialTime, resumeSchedule } from "./schedule.js";
import { notificationOriginData, taskData, taskUpdateData } from "./validation.js";

/** Owns task definitions and future-trigger controls. Never writes a run. */
export class TaskDefinitions {
  private closed = false;
  constructor(private readonly store: DefinitionStore, private readonly executors: ExecutorRegistry,
    private readonly workspaces: WorkspaceAccess, private readonly coordinatorConfigured: boolean,
    private readonly resultsRoot: string) {}
  private check(): void { if (this.closed) throw new TaskError("unavailable", "Task definition service closed"); }
  create(value: TaskInput, now = Date.now(), notification: NotificationOrigin | null = null): Task {
    this.check();
    if (!this.coordinatorConfigured) throw new TaskError("precondition", "Coordinator is not configured");
    notification = notification === null ? null : notificationOriginData.parse(notification);
    const input = taskData.parse(value), all = this.store.definitions();
    if (input.workspace === undefined) throw new TaskError("validation", "workspace is required without a local MCP launch directory");
    const workspace = this.workspaces.resolve(input.workspace);
    input.workspace = workspace;
    const existing = all.find(item => item.workspace === workspace && item.input.requestKey === input.requestKey);
    if (existing) {
      // 名称与时间计划允许更新；创建重提只核对固定要求，不覆盖当前配置。
      const { name: _name, schedule: _schedule, ...fixed } = input;
      const { name: _currentName, schedule: _currentSchedule, ...currentFixed } = existing.input;
      if (!isDeepStrictEqual(currentFixed, fixed) || !isDeepStrictEqual(existing.notification, notification)) throw new TaskError("conflict", "requestKey already used with different parameters");
      return existing;
    }
    if (all.length >= MAX_TASKS) throw new TaskError("precondition", "Task definition limit reached");
    validateGraph(input.nodes);
    for (const node of input.nodes) validateExecutionContext(node, this.resultsRoot);
    const executors = this.executors.snapshot(input.nodes.map(node => node.executorId));
    const nextAt = initialTime(input.schedule, now);
    if (input.schedule.type !== "now" && nextAt < now) throw new TaskError("validation", "Schedule must start in the future");
    if (input.expiresAt && Date.parse(input.expiresAt) <= Math.max(now, nextAt)) throw new TaskError("validation", "Deadline must follow first trigger");
    const task: Task = { notification, id: randomUUID(), input, workspace,
      executors, nextAt, scheduleStatus: "active", createdAt: iso(now), conversationId: null, conversationCursor: null, conversationRunId: null };
    this.store.saveDefinition(task); return task;
  }
  get(id: string): Task { this.check(); return this.store.get(id); }
  list(after = 0, limit = 20) {
    this.check(); const all = this.store.definitions();
    return { items: all.slice(after, after + limit), next: all.length > after + limit ? after + limit : null };
  }
  update(value: TaskUpdate, now = Date.now()): Task {
    this.check();
    const { taskId, expected, name, schedule, enabled } = taskUpdateData.parse(value);
    let task = this.store.get(taskId);
    const current = { name: task.input.name, schedule: task.input.schedule, scheduleStatus: task.scheduleStatus,
      nextAt: task.nextAt === null ? null : iso(task.nextAt) };
    if (!isDeepStrictEqual(expected, current)) throw new TaskError("conflict", "任务配置或下次触发已变化，请重新读取后再更新");
    if (schedule !== undefined || enabled !== undefined) {
      if (task.nextAt === null || !["active", "paused"].includes(task.scheduleStatus)) throw new TaskError("precondition", "任务已无未来触发，不能通过更新重新启用");
      if (task.input.expiresAt && now >= Date.parse(task.input.expiresAt)) throw new TaskError("precondition", "任务已到截止时间");
      if (schedule !== undefined && !isDeepStrictEqual(schedule, task.input.schedule)) {
        const nextAt = initialTime(schedule, now);
        if (nextAt <= now) throw new TaskError("validation", "新的触发时间必须在未来");
        if (task.input.expiresAt && nextAt >= Date.parse(task.input.expiresAt)) throw new TaskError("validation", "新的触发时间必须早于任务截止时间");
        task.input.schedule = schedule; task.nextAt = nextAt;
      }
      if (enabled === false) task.scheduleStatus = "paused";
      else if (enabled === true) {
        if (this.store.rounds(taskId).some(hasUncertainOutcome)) throw new TaskError("precondition", "Task has uncertain external outcomes; future triggers require reconciliation");
        if (task.scheduleStatus === "paused") task = resumeSchedule(task, now);
      }
    }
    if (name !== undefined) task.input.name = name;
    this.store.saveDefinition(task); return task;
  }
  executorImpact(disabled: readonly ExecutorType[]) {
    this.check();
    return this.store.definitions().filter(task =>
      ((task.nextAt !== null && ["active", "paused"].includes(task.scheduleStatus)) || this.store.activeRounds(task.id).length > 0) &&
      Object.values(task.executors).some(snapshot => snapshot.type !== "custom" && disabled.includes(snapshot.type)))
      .map(task => ({ id: task.id, name: task.input.name }));
  }
  close(): void { this.closed = true; }
}
