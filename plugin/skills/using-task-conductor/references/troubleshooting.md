# 先核查，再修改

沿用用户的任务和已有约定处理故障，先查询已有状态，保留历史与工作目录。

- **命令缺失**：检查宿主 PATH 和已知 npm prefix，优先使用已有绝对路径。确实未安装时按[安装说明](installation.md)执行相应来源的安装。
- **升级后仍运行旧版或版本未知**：使用相同命令路径和 `--home` 查询 `task-conductor status`，核对安装、launcher 与服务版本；MCP `service_status` 查看后台 `serviceVersion`。重连会复用已有后台，`restart` 不更新 launcher。按[升级流程](installation.md#升级已有服务)核查活动工作、停服备份并完整重连；同版本开发快照也需此步骤。
- **数据库缺表或格式不受支持**：保留数据，用相同 `--home` 执行 `task-conductor migrate --check`。按[升级流程](installation.md#升级已有服务)处理支持的离线转换；中断迁移先核查备份，再通过 `migrate --resume --yes` 显式续接，不手工补表或删除历史。
- **初始化不完整或 home 不正确**：核对 setup 使用的 home；中断初始化按 CLI 的 resume 入口续接，不读取私有凭据到聊天或重置数据。
- **连接缺失或重复**：Pi 使用原生注册，Claude/Codex 通常用随包入口。dsh 使用每个根会话自己的原生 MCP，不再手工添加；用 `/task-conductor status` 核查，setup 或故障修正后执行 `/task-conductor connect`。自定义 home 见[安装说明](installation.md#启动检查与目标)。
- **dsh 只有 skill、没有 MCP 工具**：查看主会话连接状态和启动提示。缺少服务、配置异常或无法确认后台版本时插件保留 skill；修正后重连。核对 Node.js 24.9+、目标 profile 与配套插件/服务版本；源码安装使用同一构建来源。
- **dsh 子代理调用被拒**：连接归属于根会话，子代理不能使用父连接、目录或通知身份；由主会话执行 Task Conductor 操作。
- **通知未出现**：先通过 MCP 查询原 Task/Run。核对原会话、项目配置、目标程序/home；fork 或新会话不接管。Pi 的检查/通知目标须与独立 MCP 一致；dsh 的三个入口共用启动环境。dsh 中检查模型选择，用户输入、模型选择或 `/task-conductor connect` 后可再次补投；保留历史，按持久消息核查投递状态。`TASK_CONDUCTOR_NOTIFICATIONS=off` 仅适用于 Pi。
- **dsh 创建时通知绑定失败**：检查项目配置可写、原生会话持久化可用，再重连；插件管理临时绑定文件，不手工填写 `notification` 或创建替代文件绕过失败。
- **没有执行端或适配器仍在准备**：能连接时用 `executor_list`，否则用 CLI 管理入口。区分缺失、禁用、安装中和准备失败，按执行端原生方式修正。
- **自定义 ACP 注册问题，包括 dsh**：读取[注册说明](custom-acp.md)，检查 CLI 支持、home、规范路径和原生环境。dsh 使用 `dsh-acp`、`dsh --profile acp`，不自动发现；注册即时生效，先前 MCP 失败时重连，无需重启后台。
- **已连接但任务被拒**：检查 `service_status` 及错误中的协调配置、执行端状态，不发任务探测认证。dsh 自身模型配置与 Task Conductor 协调配置分别管理。
- **任务失败、响应丢失或结果不明**：查询已有 Task/Run，不静默重提、更换 requestKey 或执行端。控制范围见[任务使用](tasks.md)。

宿主断开或卸载插件不停止持久任务。后台命令使用同一个 `--home`，stop/restart 前核查活动及待回答 Run；重启可能中断 ACP 会话。
