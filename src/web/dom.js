export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
export function group(className, ...children) {
  const node = element("div", undefined, className); node.append(...children); return node;
}
export function heading(title, description, action) {
  const node = element("header", undefined, "page-heading");
  node.append(group("", element("h1", title), element("p", description, "muted")));
  if (action) node.append(action);
  return node;
}
export function panel(title, description) {
  const node = element("section", undefined, "panel");
  node.append(element("h2", title));
  if (description) node.append(element("p", description, "hint"));
  return node;
}
export function empty(title, description) {
  return group("empty-state", element("span", "◇", "empty-symbol"), element("h2", title), element("p", description, "muted"));
}
export function badge(text, tone = "neutral") { return element("span", text, "badge " + tone); }
export function stack(title, subtitle) { return group("cell-stack", title instanceof Node ? title : element("span", title), element("span", subtitle, "hint")); }
export function disclosure(title, key, ...children) {
  const node = element("details"); node.dataset.key = key;
  node.append(element("summary", title), ...children); return node;
}
export function block(title, value, key = title) {
  return disclosure(title, key, element("pre", typeof value === "string" ? value : JSON.stringify(value, null, 2)));
}
export function table(headers, rows) {
  const wrapper = element("div", undefined, "table-wrap"), node = element("table"), head = element("tr");
  wrapper.tabIndex = 0; wrapper.setAttribute("role", "region"); wrapper.setAttribute("aria-label", headers.join("、"));
  for (const label of headers) { const th = element("th", label); th.scope = "col"; head.append(th); }
  const thead = element("thead"), body = element("tbody"); thead.append(head); node.append(thead, body);
  for (const row of rows) {
    const tr = element("tr");
    for (const value of row) {
      const td = element("td"); td.append(value instanceof Node ? value : document.createTextNode(value == null ? "—" : String(value))); tr.append(td);
    }
    body.append(tr);
  }
  wrapper.append(node); return wrapper;
}
export function facts(entries) {
  const node = element("dl", undefined, "facts");
  for (const [label, value] of entries) {
    const dd = element("dd"); dd.append(value instanceof Node ? value : document.createTextNode(value == null ? "—" : String(value)));
    node.append(group("", element("dt", label), dd));
  }
  return node;
}
export function field(label, value = "", type = "text", hint) {
  const row = element("div", undefined, type === "checkbox" ? "field checkbox" : "field");
  const input = element(type === "textarea" ? "textarea" : "input"), caption = element("label", label);
  input.id = "field-" + crypto.randomUUID(); caption.htmlFor = input.id;
  if (type !== "textarea") input.type = type;
  if (type === "checkbox") input.defaultChecked = Boolean(value); else input.defaultValue = value ?? "";
  if (type !== "checkbox") { input.autocomplete = "off"; input.spellcheck = false; }
  row.append(caption, input);
  if (hint) {
    const help = element("span", hint, "hint"); help.id = input.id + "-hint";
    input.setAttribute("aria-describedby", help.id); row.append(help);
  }
  return { row, input };
}
export function select(label, choices, value = "") {
  const row = element("div", undefined, "field"), input = element("select"), caption = element("label", label);
  input.id = "field-" + crypto.randomUUID(); caption.htmlFor = input.id;
  for (const [key, text] of choices) {
    const option = element("option", text); option.value = key; option.defaultSelected = key === value; input.append(option);
  }
  row.append(caption, input); return { row, input };
}
export function time(value) {
  return value == null ? "—" : new Date(value).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
export function createControls(onError) {
  async function act(node, action) {
    if (node.disabled) return;
    node.disabled = true; node.setAttribute("aria-busy", "true");
    try { await action(); } catch (error) { if (node.isConnected) onError(error); }
    finally { node.disabled = false; node.removeAttribute("aria-busy"); }
  }
  return {
    button(text, action, disabled = false, className = "") {
      const node = element("button", text, className); node.type = "button"; node.disabled = disabled;
      node.addEventListener("click", () => { void act(node, action); }); return node;
    },
    submit(form, text, action) {
      const node = form.querySelector("button[type=submit]") ?? element("button", text, "primary"); node.type = "submit";
      form.addEventListener("submit", event => { event.preventDefault(); void act(node, action); }); return node;
    },
  };
}
export function confirmAction({ title, message, confirmText = "确认", danger = false }, signal) {
  if (signal?.aborted) return Promise.resolve(false);
  const dialog = element("dialog", undefined, "confirm-dialog"), form = element("form"); form.method = "dialog";
  const titleNode = element("h2", title), description = element("p", message, "muted");
  titleNode.id = "dialog-title"; description.id = "dialog-description";
  dialog.setAttribute("aria-labelledby", titleNode.id); dialog.setAttribute("aria-describedby", description.id);
  const cancel = element("button", "返回"), accept = element("button", confirmText, danger ? "danger" : "primary");
  cancel.value = "cancel"; cancel.autofocus = true; accept.value = "confirm";
  form.append(titleNode, description, group("actions end", cancel, accept)); dialog.append(form); document.body.append(dialog);
  return new Promise(resolve => {
    const abort = () => dialog.close("cancel");
    dialog.addEventListener("close", () => { signal?.removeEventListener("abort", abort); dialog.remove(); resolve(dialog.returnValue === "confirm"); }, { once: true });
    signal?.addEventListener("abort", abort, { once: true }); dialog.showModal();
  });
}
