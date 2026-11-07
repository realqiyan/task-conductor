import { createHash, randomUUID } from "node:crypto";
import { writeFileSync, renameSync, rmSync } from "node:fs";
import { appendPluginRecord, pluginRecordOf } from "@deepseek-ai/dsh-session";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { notificationType, notificationMessage, projectIdentity, serviceRequest } from "./notification-common.mjs";

const originRecord = "plugin:task-conductor/notification-origin";
const projectPattern = /^(git:[0-9a-f]{64}|uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const sameOrigin = (a, b) => a?.projectId === b?.projectId && a?.sessionId === b?.sessionId;

export function dshSessionId(nativeId) {
  // 只散列身份字符串；不读取或校验文件哈希。命名空间避免与普通原生 ID 混淆。
  return /^[a-zA-Z0-9_-]{1,190}$/.test(nativeId) ? "dsh:" + nativeId
    : "dsh:sha256:" + createHash("sha256").update(nativeId, "utf8").digest("hex");
}

export function dshNotification(origin, events) {
  const message = notificationMessage(origin, events);
  return createUserMessage({ content: [{ type: "text", text: message.content }],
    source: { kind: notificationType, form: "notice", summary: "Task Conductor 后台事件", ...message.details } });
}

function messageIds(message, origin) {
  const source = message.source;
  return source.kind === notificationType && sameOrigin(source.origin, origin) && Array.isArray(source.eventIds)
    ? source.eventIds.filter(id => typeof id === "string") : [];
}

/** 通过原生持久化接口增量读取；只接收 flush 开始前已提交的本会话事件。 */
export class DshDeliveryReceipts {
  offset = 0;
  ids = new Set();
  constructor(agent) { this.agent = agent; }
  refresh() {
    this.pending = (this.pending ?? Promise.resolve()).catch(() => {}).then(() => this.read());
    return this.pending;
  }
  async read() {
    const { session, ctx } = this.agent;
    const end = session.seq;
    if (!await ctx.sessions.flush(session)) throw new Error("dsh 会话没有持久化屏障");
    const handle = await ctx.sessionPersistence.open(session.id, "read");
    try {
      if (handle.header.id !== session.id || handle.header.cwd !== session.header.cwd) throw new Error("dsh 会话身份不一致");
      while (this.offset < end) {
        const { events } = await handle.read(this.offset, Math.min(512, end - this.offset));
        if (!events.length) throw new Error("dsh 会话持久化记录不完整");
        for (const event of events) {
          if (event.seq >= handle.inheritedEventCount) {
            const record = pluginRecordOf(event);
            if (record?.type === originRecord) {
              const origin = record.data;
              if (!origin || Object.keys(origin).length !== 2 || !projectPattern.test(origin.projectId) || origin.sessionId !== dshSessionId(session.id)) {
                throw new Error("dsh 通知归属记录无效");
              }
              if (this.origin && !sameOrigin(this.origin, origin)) throw new Error("dsh 通知归属记录冲突");
              this.origin = origin;
            }
            if (event.type === "user/message" && this.origin) {
              for (const id of messageIds(event.data, this.origin)) this.ids.add(id);
            }
          }
          this.offset = event.seq + 1;
        }
      }
      return this.ids;
    } finally { await handle.close(); }
  }
}

/** Host 会话拥有轮询、临时绑定和租约；排队不作为收件回执。 */
export class DshNotifications {
  owner = randomUUID();
  controller = new AbortController();
  attempted = new Set();
  constructor(ctx, agent, file, env) {
    this.ctx = ctx; this.agent = agent; this.file = file; this.env = env;
    this.cwd = agent.session.header.cwd;
    this.receipts = new DshDeliveryReceipts(agent);
  }
  check() { this.controller.signal.throwIfAborted(); }
  async start() {
    await this.receipts.refresh(); this.check();
    this.origin = this.receipts.origin;
    if (this.origin) this.publish();
    this.ctx.on("session/event", (session, event) => {
      if (session !== this.agent.session || this.controller.signal.aborted) return;
      if (event.type === "model/selection" || (event.type === "agent/inbox/spliced" &&
          event.data.inserted.some(message => message.source.kind === "user"))) this.attempted.clear();
      if (event.type === "user/message" || event.type === "turn/end" || event.type === "model/selection") this.schedule();
    });
    this.schedule();
  }
  publish() {
    this.check();
    const temporary = this.file + ".new";
    try {
      writeFileSync(temporary, JSON.stringify(this.origin) + "\n", { flag: "wx", mode: 0o600 });
      renameSync(temporary, this.file);
    } finally { rmSync(temporary, { force: true }); }
  }
  bind(signal) {
    this.check(); signal.throwIfAborted();
    this.binding ??= (async () => {
      await this.receipts.refresh(); this.check(); signal.throwIfAborted();
      if (!this.receipts.origin) {
        const projectId = await projectIdentity(this.cwd, { signal: AbortSignal.any([signal, this.controller.signal]), env: this.env });
        this.check(); signal.throwIfAborted();
        appendPluginRecord(this.agent.session, originRecord, { projectId, sessionId: dshSessionId(this.agent.id) });
        await this.receipts.refresh(); this.check(); signal.throwIfAborted();
      }
      this.origin = this.receipts.origin;
      this.publish(); this.schedule();
    })().catch(error => { this.binding = undefined; throw error; });
    return this.binding.then(() => { this.check(); signal.throwIfAborted(); });
  }
  warn() {
    if (this.controller.signal.aborted || this.warned) return;
    this.warned = true;
    this.ctx.logger.warn("Task Conductor 通知暂不可用；未确认事件保留。请检查服务、项目通知配置和 dsh 会话持久化。");
  }
  async tick() {
    if (!this.origin || this.controller.signal.aborted) return;
    try {
      const options = { cwd: this.cwd, env: this.env, signal: this.controller.signal };
      const result = await serviceRequest({ action: "poll", origin: this.origin, owner: this.owner }, options);
      this.check();
      this.leased = result.acquired;
      if (!result.acquired) { this.warn(); return; }
      const saved = await this.receipts.refresh(); this.check();
      const ack = result.items.filter(event => saved.has(event.eventId)).map(event => event.eventId);
      if (ack.length) await serviceRequest({ action: "ack", origin: this.origin, owner: this.owner, eventIds: ack }, options);
      this.check();
      for (const id of ack) this.attempted.delete(id);
      // 恢复的 inbox 不会自行唤醒。仅在空闲且租约有效时重新投递本插件的未收件消息。
      if (this.agent.status === "idle" && this.agent.model.current() && Date.now() < result.leaseUntil - 2000) {
        const waiting = new Set(result.items.filter(event => !saved.has(event.eventId) && !this.attempted.has(event.eventId)).map(event => event.eventId));
        for (const message of [...this.agent.inbox.nextTurn, ...this.agent.inbox.nextStep]) {
          if (messageIds(message, this.origin).some(id => waiting.has(id))) this.agent.inbox.remove(message.id);
        }
      }
      const queued = new Set([...this.agent.inbox.nextTurn, ...this.agent.inbox.nextStep].flatMap(message => messageIds(message, this.origin)));
      const pending = result.items.filter(event => !saved.has(event.eventId) && !queued.has(event.eventId) && !this.attempted.has(event.eventId));
      if (pending.length && this.agent.model.current() && Date.now() < result.leaseUntil - 2000) {
        // 失败的模型准入或取消不会形成自动唤醒循环；用户输入、选模型或显式连接后可补投。
        for (const event of pending) this.attempted.add(event.eventId);
        this.agent.followup(dshNotification(this.origin, pending));
        await this.receipts.refresh(); this.check();
      }
      this.warned = false;
    } catch { this.warn(); }
  }
  schedule(delay = 0) {
    if (!this.origin || this.controller.signal.aborted || this.timer || this.pending) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.pending = this.tick().finally(() => { this.pending = undefined; this.schedule(5000); });
    }, delay);
    this.timer.unref();
  }
  close() {
    return this.closing ??= (async () => {
      this.controller.abort(); clearTimeout(this.timer);
      await this.pending; await this.binding?.catch(() => {});
      if (this.origin && this.leased) {
        try { await serviceRequest({ action: "release", origin: this.origin, owner: this.owner }, { cwd: this.cwd, env: this.env }); }
        catch { this.ctx.logger.warn("Task Conductor 通知租约未能释放，将等待租约到期；未确认事件保留。"); }
      }
    })();
  }
}
