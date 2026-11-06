import { element, group, heading, panel, badge, field, facts, disclosure } from "./dom.js";

const names = { pi: "Pi Agent", codex: "Codex", claude: "Claude Code", opencode: "OpenCode" };
const states = { missing: ["未安装", "neutral"], disabled: ["已禁用", "neutral"], installing: ["准备中", "info"], ready: ["已就绪", "good"], error: ["准备失败", "bad"] };

export async function renderExecutors(root, { request, button, submit, confirm, notify, report, signal }) {
  let state = await request("/executors"), timer, version = 0;
  const host = group("executor-grid");
  async function load(path, body) {
    const current = ++version;
    if (body !== undefined) { clearTimeout(timer); root.inert = true; }
    try {
      const next = await request(path, body);
      if (current === version) { state = next; draw(); }
    } finally { if (body !== undefined) root.inert = false; }
  }
  function draw() {
    clearTimeout(timer);
    host.replaceChildren(...state.executors.map(executor => {
      const card = panel(names[executor.id] ?? executor.id), title = card.querySelector("h2");
      const mark = element("span", (names[executor.id] ?? executor.id).slice(0, 1).toUpperCase(), "executor-mark");
      mark.setAttribute("aria-hidden", "true"); title.prepend(mark);
      const label = executor.state === "missing" && executor.nativePath ? ["待准备", "warn"] : states[executor.state];
      title.after(badge(...label));
      card.append(facts([["启动路径", executor.nativePath ?? "未发现本机程序"],
        ["ACP 适配器", executor.adapterVersion ?? (executor.type === "opencode" ? "原生支持" : executor.type === "custom" ? "自定义程序" : "尚未准备")]]));
      if (executor.cwd) card.append(element("p", "启动目录：" + executor.cwd, "hint"));
      if (executor.error) card.append(element("p", executor.error, "notice error"));
      if (executor.state === "missing") card.append(element("p", "安装原生 CLI 并完成登录后，重新检测。", "hint"));
      if (executor.state === "disabled") card.append(element("p", "在设置的高级选项中启用，重启后生效。", "hint"));
      const action = executor.type === "custom" ? button("注销执行端", async () => {
        if (!await confirm({ title: "注销 " + executor.id + "？", message: "立即阻止新的派发。活动进程继续运行，已有任务与历史保留。", confirmText: "注销", danger: true })) return;
        await load("/executors/unregister", { id: executor.id }); notify("执行端已注销。", "success");
      }, false, "danger-text") : executor.type === "opencode" ? element("span", "通过原生 CLI 更新", "hint") : button("更新适配器", async () => {
        if (!await confirm({ title: "更新 " + (names[executor.id] ?? executor.id) + " 适配器？", message: "准备期间暂停向此执行端派发新工作，活动进程不受影响。", confirmText: "开始更新" })) return;
        await load("/executors/upgrade", { id: executor.id }); notify("适配器更新已开始。完成后将自动更新状态。");
      }, !executor.nativePath || ["disabled", "installing"].includes(executor.state));
      card.append(group("card-footer", action)); return card;
    }));
    if (state.executors.some(executor => executor.state === "installing")) timer = setTimeout(async () => {
      try { await load("/executors"); }
      catch (error) { if (!signal.aborted) report(error); }
    }, 2000);
  }
  signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  root.append(heading("执行端", "连接本机 Agent，查看启动依赖与准备状态。", button("重新检测", async () => {
    await load("/executors/refresh", {}); notify("检测已完成，缺少的适配器将在后台准备。");
  })), host, element("p", "就绪表示启动依赖已准备。模型认证与工具权限由执行端的原生配置管理。", "page-note"));
  draw();
  const registration = element("form"), custom = {
    id: field("执行端 ID", "", "text", "不能与已有执行端重复。"),
    command: field("可执行文件", "", "text", "本机 stdio ACP 程序的绝对路径。"),
    args: field("启动参数", "[]", "text", "JSON 字符串数组，例如 [\"--stdio\"]；不要填写凭据。"),
    cwd: field("启动目录", "", "text", "可选。留空使用任务工作目录。"),
  };
  custom.id.input.required = true; custom.command.input.required = true;
  custom.command.input.placeholder = "/absolute/path/to/executor";
  registration.append(element("p", "授权本机程序作为执行端，保存后立即生效。认证与无人值守权限请先通过原生工具配置。", "hint"),
    group("form-grid", ...Object.values(custom).map(item => item.row)));
  registration.append(submit(registration, "注册执行端", async () => {
    let args;
    try { args = JSON.parse(custom.args.input.value); } catch { throw new Error("启动参数须为 JSON 字符串数组。"); }
    if (!Array.isArray(args) || args.some(item => typeof item !== "string")) throw new Error("启动参数须为 JSON 字符串数组。");
    const input = { id: custom.id.input.value.trim(), command: custom.command.input.value.trim(), args,
      ...(custom.cwd.input.value.trim() ? { cwd: custom.cwd.input.value.trim() } : {}) };
    if (!await confirm({ title: "注册 " + input.id + "？", message: "允许服务在后续任务中启动此本机程序。注册不验证 ACP 协议、模型认证或工具权限。", confirmText: "确认注册" })) return;
    registration.inert = true;
    try {
      await load("/executors/register", input); registration.reset(); delete registration.dataset.dirty;
      notify("执行端已注册并生效。", "success");
    } finally { registration.inert = false; }
  }));
  const register = disclosure("注册自定义执行端", "register-executor", registration); register.className = "panel";
  root.append(register);
}
