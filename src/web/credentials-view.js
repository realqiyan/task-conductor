import { element, group, badge, field, table, disclosure } from "./dom.js";

export function credentialsEditor(host, { snapshot, save, button, submit, confirm, notify }) {
  const list = element("div"), form = element("form");
  const key = field("密钥变量名", "", "text", "新名称须以 _KEY、_TOKEN、_SECRET 或 _PASSWORD 结尾。"), value = field("密钥值", "", "password", "原值不回显，未提交时保留原值。");
  key.input.required = true; value.input.required = true; value.input.maxLength = 16384;
  key.input.placeholder = "例如 OPENAI_API_KEY";
  const saveButton = submit(form, "保存密钥", async () => {
    const input = { key: key.input.value.trim(), action: "replace", value: value.input.value };
    value.input.value = "";
    await save(input); delete form.dataset.dirty; draw(); notify("密钥已保存，重启后生效。", "success");
  });
  form.append(group("form-grid", key.row, value.row), saveButton);
  function draw() {
    const state = snapshot(); saveButton.disabled = state.writeBlocked;
    list.replaceChildren(table(["变量名", "已保存", "当前进程", "操作"], state.credentials.map(credential => [
      element("code", credential.key), badge(credential.saved ? "已设置" : "未设置", credential.saved ? "good" : "neutral"),
      credential.pendingRestart ? badge("待重启", "warn") : credential.running ? "已设置" : "未设置",
      group("actions", button(credential.saved ? "替换" : "设置", () => {
        key.input.value = credential.key; value.input.focus(); form.dataset.dirty = "true";
      }, state.writeBlocked, "quiet"), credential.referenced ? element("span", "使用中", "hint") : button("删除", async () => {
        if (!await confirm({ title: "删除此密钥？", message: credential.key + " 的已保存值将被删除。当前进程保留原值，直到重启。", confirmText: "删除", danger: true })) return;
        await save({ key: credential.key, action: "delete" }); draw(); notify("密钥已删除，重启后生效。", "success");
      }, !credential.saved || state.writeBlocked, "danger-text")),
    ])));
  }
  const details = disclosure("模型密钥", "credentials", element("p", "先保存密钥，再保存引用它的模型配置。服务与管理员令牌不在这里修改。", "hint"), list, form);
  details.className = "panel"; host.append(details); draw();
  return draw;
}
