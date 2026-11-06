export function createApi() {
  let token = "", session = new AbortController();
  function disconnect() {
    session.abort(); session = new AbortController(); token = "";
  }
  async function request(path, body, signal) {
    const lifetime = AbortSignal.any([session.signal, ...(signal ? [signal] : [])]);
    let response;
    try {
      response = await fetch("/admin/api" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { Authorization: "Bearer " + token, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "omit", cache: "no-store", redirect: "error",
        signal: AbortSignal.any([lifetime, AbortSignal.timeout(path === "/restart" ? 60_000 : 15_000)]),
      });
    } catch {
      lifetime.throwIfAborted();
      throw new Error(body === undefined ? "无法连接服务，请检查服务状态后刷新。" :
        path === "/restart" ? "重启结果未确认，请运行 task-conductor status 核对。" : "操作结果未确认，请刷新核对后再操作。");
    }
    const result = await response.json().catch(() => ({}));
    lifetime.throwIfAborted();
    if (!response.ok) {
      const messages = {
        "Configuration changed or the edit expired; reload before saving": "配置已被修改或编辑已过期，请保留草稿后刷新。",
        "Task has uncertain external outcomes; future triggers require reconciliation": "任务存在结果不明的执行，无法恢复未来触发。",
        "Task has no future schedule": "任务已无未来触发，请刷新核对。",
        "A referenced environment value is missing; prepare credentials or native configuration first": "缺少模型密钥，请先保存对应凭据。",
        "Changing the model endpoint requires a new credential reference; save the new key first": "更换模型端点时须使用新的密钥引用，请先保存新密钥。",
        "The saved configuration still references this credential": "已保存配置仍在使用此密钥，请先修改配置。",
        "Restart could not be confirmed; inspect private logs and use CLI status before retrying": "重启结果未确认，请运行 task-conductor status 并检查服务日志。",
      };
      const error = new Error(response.status === 401 ? "管理员令牌无效，请重新连接。" :
        messages[result.error] ?? result.error ?? "请求被拒绝，请检查服务状态。状态码：" + response.status);
      error.status = response.status;
      throw error;
    }
    if (!Object.hasOwn(result, "data")) throw new Error(body === undefined ? "无法读取服务响应，请刷新重试。" : "操作结果无法读取，请刷新核对后再操作。");
    return result.data;
  }
  return {
    request, disconnect,
    async connect(value) {
      disconnect(); token = value;
      try { return await request("/status"); }
      catch (error) { disconnect(); throw error; }
    },
  };
}
