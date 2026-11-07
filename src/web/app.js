import { createApi } from "./api.js";
import { element, group, empty, createControls, confirmAction } from "./dom.js";
import { renderTasks } from "./tasks-view.js";
import { renderExecutors } from "./executors-view.js";
import { renderSettings } from "./settings-view.js";

const api = createApi();
const main = document.querySelector("#view"), login = document.querySelector("#login"), token = document.querySelector("#token");
const navigation = document.querySelector("#navigation"), status = document.querySelector("#service-status");
const session = { connected: false, view: readRoute(), current: null, pending: null, sequence: 0, loading: false };
const titles = { tasks: "任务", task: "任务详情", run: "运行详情", executors: "执行端", settings: "设置" };

function readRoute(hash = location.hash) {
  const [kind, query] = hash.slice(1).split("?"), params = new URLSearchParams(query);
  if (!["tasks", "task", "run", "executors", "settings"].includes(kind)) return { kind: "tasks", after: 0 };
  if (["task", "run"].includes(kind) && !params.get("id")) return { kind: "tasks", after: 0 };
  const state = { kind, after: 0 };
  for (const key of ["id", "after", "listAfter", "taskAfter"]) {
    if (params.has(key)) state[key] = key === "id" ? params.get(key) : Math.max(0, Number.parseInt(params.get(key), 10) || 0);
  }
  return state;
}
function routeUrl(state) {
  const params = new URLSearchParams(Object.entries(state).filter(([key, value]) => key !== "kind" && value !== undefined));
  return "#" + state.kind + (params.size ? "?" + params : "");
}
function link(text, next, className = "text-link") {
  const node = element("a", text, className); node.href = routeUrl(next); node.dataset.route = next.kind; return node;
}
function notify(text = "", tone = "info") {
  const host = document.querySelector("#notice");
  document.querySelector("#notice-text").textContent = text;
  host.className = "notice " + tone; host.hidden = !text; host.setAttribute("role", tone === "error" ? "alert" : "status");
}
function report(error) {
  if (error.name === "AbortError") return;
  if (error.status === 401) logout();
  notify(error.message ?? "操作失败，请重试。", "error");
}
const controls = createControls(report);
const hasDraft = () => Boolean(main.querySelector('form[data-dirty="true"]'));
const interacting = () => main.contains(document.activeElement) || Boolean(document.querySelector("dialog[open], [aria-busy=true]")) ||
  Boolean(window.getSelection()?.toString());
function health(value) {
  const ready = value.running && value.storageHealthy;
  status.textContent = ready ? "服务运行中" : "服务不可用"; status.className = "badge " + (ready ? "good" : "bad");
  document.querySelector("#active-runs").textContent = value.activeTaskRunIds.length;
  document.querySelector("#active-sessions").textContent = value.activeNodeRunIds.length;
  document.querySelector("#pending").hidden = !value.settings.pendingRestart;
  if (value.settings.writeBlocked) notify("配置保存已冻结，请停服核查配置文件。", "error");
}
async function refreshHealth() {
  try { health(await api.request("/status")); }
  catch (error) {
    if (error.name !== "AbortError" && session.connected) { status.textContent = "连接中断"; status.className = "badge bad"; report(error); }
  }
}
function restarted(value) {
  logout(); notify("重启成功。请在服务地址重新连接。", "success");
  const url = new URL(value.consoleUrl);
  if (url.protocol === "http:" && url.hostname === "127.0.0.1") {
    const node = element("a", "打开控制台 · " + url.host, "text-link"); node.href = url.href;
    document.querySelector("#reconnect").append(node);
  }
}
async function render(background = false) {
  const sequence = ++session.sequence, target = { ...session.view }, root = element("section", undefined, "page");
  session.pending?.abort();
  const lifetime = new AbortController(); session.pending = lifetime;
  session.loading = true;
  if (!background) { main.setAttribute("aria-busy", "true"); main.inert = true; document.querySelector("#updated").textContent = "正在加载…"; }
  const context = {
    ...controls, link, canLeave, signal: lifetime.signal,
    report: error => { if (!lifetime.signal.aborted) report(error); },
    request: (path, body) => api.request(path, body, lifetime.signal),
    notify: (text, tone) => { if (!lifetime.signal.aborted) notify(text, tone); },
    confirm: options => confirmAction(options, lifetime.signal),
    navigate: (next, force) => lifetime.signal.aborted ? undefined : go(next, force),
    settingsChanged: refreshHealth, restarted,
  };
  try {
    if (target.kind === "settings") await renderSettings(root, context);
    else if (target.kind === "executors") await renderExecutors(root, context);
    else await renderTasks(root, target, context);
    if (sequence !== session.sequence || !session.connected || (background && (hasDraft() || interacting()))) { lifetime.abort(); return; }
    if (background || routeUrl(target) === main.dataset.route) {
      const open = new Set([...main.querySelectorAll("details[open]")].map(node => node.dataset.key));
      for (const node of root.querySelectorAll("details")) node.open = open.has(node.dataset.key);
    }
    for (const event of ["input", "change"]) root.addEventListener(event, event => {
      const form = event.target.closest("form"); if (form) form.dataset.dirty = "true";
    });
    session.current?.abort(); session.current = lifetime;
    main.replaceChildren(root); main.dataset.route = routeUrl(target);
    document.querySelector("#location").textContent = titles[target.kind];
    document.title = titles[target.kind] + " · Task Conductor";
    for (const item of navigation.querySelectorAll("a")) {
      const active = item.dataset.route === (["task", "run"].includes(target.kind) ? "tasks" : target.kind);
      if (active) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
    }
    document.querySelector("#updated").textContent = "更新于 " + new Date().toLocaleTimeString("zh-CN", { hour12: false });
    if (!background) { main.inert = false; main.focus({ preventScroll: true }); }
  } catch (error) {
    lifetime.abort();
    if (sequence !== session.sequence || !session.connected || error.name === "AbortError") return;
    if (!background) {
      session.current?.abort();
      main.replaceChildren(group("panel", empty("页面加载失败", "请检查服务连接后重试。"), controls.button("重新加载", () => render(), false, "primary")));
      document.querySelector("#updated").textContent = "加载失败";
    }
    report(error);
  } finally {
    if (sequence === session.sequence) { session.loading = false; session.pending = null; main.inert = false; main.removeAttribute("aria-busy"); }
  }
}
async function canLeave() {
  return !hasDraft() || await confirmAction({ title: "放弃未保存的编辑？", message: "离开或刷新后，未保存的内容将丢失。", confirmText: "放弃编辑", danger: true }, session.current?.signal);
}
async function go(next, force = false, history = true) {
  if (!session.connected || (!force && !await canLeave())) return false;
  const changed = routeUrl(next) !== routeUrl(session.view);
  if (changed) notify();
  session.view = next;
  if (history && location.hash !== routeUrl(next)) window.history.pushState(null, "", routeUrl(next));
  await render();
  if (changed) window.scrollTo({ top: 0 });
  return true;
}
function logout() {
  session.connected = false; session.sequence++; session.current?.abort(); session.pending?.abort(); api.disconnect();
  session.loading = false; main.inert = false; main.removeAttribute("aria-busy"); main.replaceChildren(); main.hidden = true;
  token.value = ""; status.textContent = "尚未连接"; status.className = "badge neutral";
  for (const id of ["navigation", "toolbar", "runtime"]) document.getElementById(id).hidden = true;
  document.querySelector("#welcome").hidden = false; document.querySelector("#reconnect").replaceChildren();
  document.querySelector("#location").textContent = "本机控制台"; document.title = "Task Conductor · 控制台";
}
controls.submit(login, "连接", async () => {
  const value = token.value; token.value = "";
  const result = await api.connect(value); session.connected = true;
  for (const id of ["navigation", "toolbar", "runtime", "view"]) document.getElementById(id).hidden = false;
  document.querySelector("#welcome").hidden = true; notify(); health(result);
  await go(readRoute(), true, false);
});
document.addEventListener("click", event => {
  const anchor = event.target.closest("a[data-route]");
  if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); void go(readRoute(new URL(anchor.href).hash));
});
window.addEventListener("popstate", async () => {
  if (session.connected && !await go(readRoute(), false, false)) window.history.pushState(null, "", routeUrl(session.view));
});
document.querySelector("#refresh").addEventListener("click", async () => { if (await go(session.view)) await refreshHealth(); });
document.querySelector("#logout").addEventListener("click", async () => { if (await canLeave()) { logout(); notify("已退出，管理员令牌已清除。"); token.focus(); } });
document.querySelector("#dismiss").addEventListener("click", () => notify());
document.querySelector(".skip-link").addEventListener("click", event => { event.preventDefault(); (main.hidden ? token : main).focus(); });
window.addEventListener("beforeunload", event => { if (hasDraft()) { event.preventDefault(); event.returnValue = ""; } });
window.addEventListener("pagehide", logout);
setInterval(async () => {
  if (!session.connected || document.hidden || session.loading || document.querySelector("dialog[open]")) return;
  const sequence = session.sequence;
  await refreshHealth();
  if (session.connected && sequence === session.sequence && !hasDraft() && !interacting() && ["tasks", "task", "run"].includes(session.view.kind)) await render(true);
}, 10_000);
