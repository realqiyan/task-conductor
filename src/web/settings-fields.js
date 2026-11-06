import { element, group, field, select, disclosure } from "./dom.js";

const providers = [["", "暂不配置"], ["openai", "OpenAI"], ["anthropic", "Anthropic"], ["deepseek", "DeepSeek"], ["openai-compatible", "OpenAI 兼容接口"]];
const credentialKeys = { openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY", deepseek: "DEEPSEEK_API_KEY" };
export function coordinatorEditor(host, config) {
  const provider = select("模型提供方", providers, config?.provider ?? ""), model = field("模型 ID", config?.model);
  model.input.placeholder = "例如 deepseek-flash";
  const custom = {
    baseUrl: field("接口地址", config?.baseUrl, "url", "不含凭据、查询参数或片段。"),
    apiKeyEnv: field("密钥引用", config?.apiKeyEnv ?? "COORDINATOR_API_KEY"),
    api: select("接口协议", [["openai-completions", "Chat Completions"], ["openai-responses", "Responses"]], config?.api ?? "openai-completions"),
    contextWindow: field("上下文窗口", config?.contextWindow, "number"),
    maxTokens: field("最大输出 token", config?.maxTokens, "number"),
    reasoning: field("支持推理", config?.reasoning, "checkbox"),
  };
  for (const key of ["contextWindow", "maxTokens"]) { custom[key].input.min = "1"; custom[key].input.step = "1"; }
  custom.baseUrl.input.placeholder = "https://api.example.com/v1";
  const compatible = element("fieldset"), hint = element("p", "", "hint");
  compatible.append(element("legend", "接口能力"), group("form-grid", ...Object.values(custom).map(item => item.row)));
  function update() {
    compatible.hidden = provider.input.value !== "openai-compatible"; compatible.disabled = compatible.hidden;
    model.row.hidden = !provider.input.value; model.input.disabled = model.row.hidden; model.input.required = !model.row.hidden;
    for (const key of ["baseUrl", "apiKeyEnv", "contextWindow", "maxTokens"]) custom[key].input.required = !compatible.hidden;
    hint.textContent = !provider.input.value ? "未配置模型时，服务仅提供管理功能。" :
      "密钥引用：" + (credentialKeys[provider.input.value] ?? custom.apiKeyEnv.input.value) + "。请先在模型密钥中保存对应凭据。";
  }
  provider.input.addEventListener("change", update); custom.apiKeyEnv.input.addEventListener("input", update); update();
  host.append(group("form-grid", provider.row, model.row), hint, compatible);
  return () => {
    if (!provider.input.value) return undefined;
    return { provider: provider.input.value, model: model.input.value.trim(), ...(provider.input.value === "openai-compatible" ? {
      baseUrl: custom.baseUrl.input.value.trim(), apiKeyEnv: custom.apiKeyEnv.input.value.trim(), api: custom.api.input.value,
      contextWindow: custom.contextWindow.input.valueAsNumber, maxTokens: custom.maxTokens.input.valueAsNumber, reasoning: custom.reasoning.input.checked,
    } : {}) };
  };
}
export function startupEditor(host, config) {
  const dataDir = field("数据目录", config.dataDir, "text", "使用绝对路径；切换目录不搬迁或删除旧历史。"),
    port = field("监听端口", config.port, "number", "0 表示自动分配。"),
    tokenEnv = field("MCP 令牌变量名", config.tokenEnv, "text", "修改名称会保留令牌值。");
  dataDir.input.required = true; tokenEnv.input.required = true;
  port.input.required = true; port.input.min = "0"; port.input.max = "65535"; port.input.step = "1";
  const enabled = ["pi", "codex", "claude", "opencode"].map(type => ({ type, ...field(type, !config.disabledExecutors.includes(type), "checkbox") }));
  const options = element("fieldset");
  options.append(element("legend", "启用内置执行端"), group("checkbox-group", ...enabled.map(item => item.row)), element("p", "重启后生效，已有任务不会自动改派。", "hint"));
  host.append(disclosure("高级设置", "advanced-settings", group("form-grid", dataDir.row, port.row, tokenEnv.row), options));
  return () => ({ dataDir: dataDir.input.value.trim(), port: port.input.valueAsNumber, tokenEnv: tokenEnv.input.value.trim(),
    disabledExecutors: enabled.filter(item => !item.input.checked).map(item => item.type) });
}
export const configLabels = { coordinator: "协调模型", dataDir: "数据目录", port: "监听端口", tokenEnv: "MCP 令牌变量名", disabledExecutors: "禁用执行端" };
export function configValue(key, value) {
  if (value == null) return "未配置";
  if (key === "disabledExecutors") return value.length ? value.join("、") : "无";
  if (key === "port") return value === 0 ? "自动分配" : String(value);
  if (key === "coordinator") return [providers.find(([id]) => id === value.provider)?.[1] ?? value.provider, value.model,
    ...(value.provider === "openai-compatible" ? [value.baseUrl, "凭据：" + value.apiKeyEnv, "协议：" + value.api,
      "上下文：" + value.contextWindow + " · 输出：" + value.maxTokens + " · 推理：" + (value.reasoning ? "支持" : "不支持")] : [])].join("\n");
  return String(value);
}
