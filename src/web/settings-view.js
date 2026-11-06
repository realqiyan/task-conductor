import { element, group, heading, panel, badge, facts, table, block } from "./dom.js";
import { coordinatorEditor, startupEditor, configLabels, configValue } from "./settings-fields.js";
import { credentialsEditor } from "./credentials-view.js";

export async function renderSettings(root, context) {
  const { request, button, submit, confirm, notify, settingsChanged, restarted } = context;
  let state = await request("/settings"), revision = 0, saving = false;
  const savedStatus = badge(""), form = element("form", undefined, "panel"), preview = element("section", undefined, "preview");
  preview.hidden = true; preview.setAttribute("aria-live", "polite");
  const updateStatus = () => {
    savedStatus.textContent = state.pendingRestart ? "已保存 · 待重启" : "配置已生效";
    savedStatus.className = "badge " + (state.pendingRestart ? "warn" : "good");
  };
  function invalidate() { revision++; preview.hidden = true; preview.replaceChildren(); }
  async function save(path, input) {
    if (saving) throw new Error("正在保存，请稍候。");
    saving = true; root.inert = true;
    try {
      state = await request(path, { ...input, editToken: state.editToken }); invalidate(); updateStatus();
      await settingsChanged(); return state;
    } finally { saving = false; root.inert = false; }
  }
  root.append(heading("设置", "管理协调模型、密钥与服务启动配置。", savedStatus)); updateStatus();
  if (state.writeBlocked) root.append(element("p", "上次保存结果未确认。请停服核查配置文件，当前禁止保存与重启。", "notice error"));
  form.append(element("h2", "协调模型"), element("p", "负责推进任务、处理澄清与验收交付。", "hint"));
  const readModel = coordinatorEditor(form, state.saved.coordinator), readStartup = startupEditor(form, state.saved);
  for (const event of ["input", "change"]) form.addEventListener(event, invalidate);
  const validate = submit(form, "预览变更", async () => {
    const input = { editToken: state.editToken, config: { ...readStartup(), coordinator: readModel() } }, current = revision;
    const checked = await request("/settings/validate", input);
    if (revision !== current) return;
    preview.replaceChildren(element("h3", checked.changes.length ? "确认配置变更" : "没有新的配置变更")); preview.hidden = false;
    if (!checked.changes.length) { preview.append(element("p", "当前编辑与已保存配置一致。", "hint")); return; }
    preview.append(table(["配置项", "已保存", "将保存"], checked.changes.map(change => [configLabels[change.field] ?? change.field,
      element("span", configValue(change.field, change.before), "prose"), element("span", configValue(change.field, change.after), "prose")])));
    if (checked.affectedTasks.length) preview.append(group("notice warning", element("strong", "受影响任务"),
      element("p", checked.affectedTasks.map(task => task.name + " · " + task.id).join("\n"), "prose"),
      element("p", "执行端变更可能阻止这些任务继续派发，已有指派不会自动调整。")));
    preview.append(element("p", "本地校验通过。保存后须重启生效；校验不验证模型认证或实际执行。", "hint"),
      group("actions", button("确认保存", async () => {
        if (revision !== current) return;
        await save("/settings/config", { config: checked.config }); delete form.dataset.dirty; refreshCredentials();
        notify("配置已保存，重启后生效。", "success");
      }, state.writeBlocked, "primary"), button("返回编辑", () => { invalidate(); validate.focus(); })));
    preview.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
  validate.disabled = state.writeBlocked;
  form.append(group("form-footer", validate, element("span", "保存后重启生效", "hint")), preview); root.append(form);
  const refreshCredentials = credentialsEditor(root, {
    snapshot: () => state, save: input => save("/settings/credential", input), button, submit, confirm, notify,
  });
  const service = panel("服务与重启", "重启应用已保存的配置与密钥，并检查新实例是否可用。");
  service.append(facts([["当前模型", state.running.coordinator ? state.running.coordinator.model : "未配置"],
    ["当前数据目录", state.running.dataDir], ["监听端口", configValue("port", state.running.port)]]),
    block("当前运行配置", state.running, "running-settings"),
    group("form-footer", button("重启服务", async () => {
      const status = await request("/status");
      if (!await confirm({ title: "使用已保存配置重启？", message:
        "当前活动协调 " + status.activeTaskRunIds.length + " 个，ACP 会话 " + status.activeNodeRunIds.length +
        " 个。重启会关闭会话，活动执行及待回答运行可能中断。未保存编辑将丢失，旧数据不会迁移。", confirmText: "确认重启", danger: true })) return;
      notify("正在重启并检查服务，请稍候…");
      restarted(await request("/restart", {}));
    }, state.writeBlocked), element("span", "活动执行可能中断", "hint")));
  root.append(service);
}
