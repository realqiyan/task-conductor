# 代码导航

本文指向职责入口、依赖边界和资源所有者，不复述字段、默认值或状态枚举。目标见[总体方案](design-proposal.md)，设计要求见[架构原则](architecture-guidelines.md)。

## 模块与公开能力

按业务能力组织 `tasks`、`executors`、`configuration` 和 `results`。各模块用普通数据模型表达内部数据，服务通过构造参数接收依赖。没有服务定位器或统一转发门面。协议入口只获得[公开业务能力](../src/protocol/services.ts)。

| 责任 | 实现入口 | 基础验证 |
| --- | --- | --- |
| 任务定义、执行端快照、未来触发控制 | [TaskDefinitions](../src/tasks/definitions.ts)、[图校验](../src/tasks/graph.ts)、[时间规则](../src/tasks/schedule.ts)、[Cron 解析](../src/tasks/cron.ts) | [tasks.test.mjs](../tests/tasks.test.mjs)、[schedule.test.mjs](../tests/schedule.test.mjs) |
| Run 与节点状态的业务修改入口、派发与提交顺序 | [TaskRuns](../src/tasks/runs.ts)、[数据模型](../src/tasks/model.ts)、[窄能力契约](../src/tasks/ports.ts) | [tasks.test.mjs](../tests/tasks.test.mjs)、[task-storage.test.mjs](../tests/task-storage.test.mjs) |
| Run 通知事件、会话领取与确认 | [通知服务](../src/tasks/notifications.ts)、[通知契约](../src/protocol/notification-contract.ts)、[共用桥接](../plugin/scripts/notification-common.mjs)、[Pi 接收](../plugin/scripts/notifications.mjs)、[dsh 接收](../plugin/scripts/dsh-notifications.mjs) | [通知测试](../tests/notifications.test.mjs)、[Pi SDK](../tests/pi-notifications.test.mjs)、[dsh SDK](../tests/dsh-integration.test.mjs) |
| 可靠输入、Task 会话绑定、公开消息与回执 | [TaskConversations](../src/tasks/conversations.ts) | [task-conversations.test.mjs](../tests/task-conversations.test.mjs) |
| 时钟、Task 单所有者监督、取消与收尾 | [TaskSupervisor](../src/tasks/supervisor.ts)、[NodeSessions](../src/tasks/sessions.ts) | [tasks.test.mjs](../tests/tasks.test.mjs)、[restart.test.mjs](../tests/restart.test.mjs) |
| 人工事实等待与回复 | [纯状态规则](../src/tasks/human-input.ts)、[TaskRuns](../src/tasks/runs.ts) | [human-input.test.mjs](../tests/human-input.test.mjs) |
| 本机执行端目录、管理员注册、准入比较、凭据隔离 | [ExecutorRegistry](../src/executors/registry.ts)、[注册存储](../src/executors/files.ts)、[发现与安装](../src/integrations/acp/discovery.ts)、[环境过滤](../src/executors/environment.ts)、[审批策略](../src/executors/permissions.ts) | [executors.test.mjs](../tests/executors.test.mjs)、[policy.test.mjs](../tests/policy.test.mjs)、[config-preflight.test.mjs](../tests/config-preflight.test.mjs) |
| 配置与凭据编辑、发布顺序、影响预览 | [Settings](../src/configuration/settings.ts)、[配置规则](../src/configuration/policy.ts)、[预览组合](../src/configuration/management.ts) | [settings.test.mjs](../tests/settings.test.mjs)、[web.test.mjs](../tests/web.test.mjs) |
| 请求规范化、内部数据与严格记录校验 | [任务请求](../src/protocol/task-contract.ts)、[配置请求](../src/protocol/settings-contract.ts)、[内部数据校验](../src/tasks/validation.ts)、[持久记录](../src/tasks/storage/records.ts) | [task-storage.test.mjs](../tests/task-storage.test.mjs) |
| 持久读写与事务 | [TaskStore](../src/tasks/storage/store.ts)、[配置文件](../src/configuration/files.ts)、[私有文件操作](../src/infrastructure/private-files.ts) | [task-storage.test.mjs](../tests/task-storage.test.mjs)、[settings.test.mjs](../tests/settings.test.mjs) |
| 结果文件授权与文件持久化 | [Results](../src/results/service.ts)、[文件能力](../src/results/ports.ts)、[文件实现](../src/results/files.ts) | [results.test.mjs](../tests/results.test.mjs) |
| ACP、worker 与进程协议 | [ACP 连接](../src/integrations/acp/connection.ts)、[worker 监督](../src/integrations/acp/execution.ts)、[worker 入口](../src/integrations/acp/worker.ts)、[命令映射](../src/integrations/acp/runtime.ts) | [execution.test.mjs](../tests/execution.test.mjs)、[tasks.test.mjs](../tests/tasks.test.mjs) |
| durable 工具、模型、任务记忆与会话存储 | [协调适配](../src/integrations/coordinator/coordinator.ts)、[账本视图](../src/integrations/coordinator/context.ts)、[Document](../src/integrations/coordinator/memory.ts)、[provider](../src/integrations/coordinator/provider.ts)、[存储](../src/integrations/coordinator/storage.ts) | [coordinator-provider.test.mjs](../tests/coordinator-provider.test.mjs)、[durable.test.mjs](../tests/durable.test.mjs) |
| MCP、HTTP 与 Web | [MCP 工具](../src/protocol/mcp.ts)、[输出契约](../src/protocol/mcp-contract.ts)、[stdio 接入](../src/protocol/stdio.ts)、[HTTP 服务](../src/protocol/http/server.ts)、[Web 路由](../src/protocol/http/web.ts)、[页面](../src/web/) | [service.test.mjs](../tests/service.test.mjs)、[web.test.mjs](../tests/web.test.mjs) |
| CLI 与本机控制协议 | [CLI](../src/protocol/cli/commands.ts)、[管理客户端](../src/protocol/cli/admin-client.ts)、[启动器客户端](../src/integrations/local-service/control.ts) | [web.test.mjs](../tests/web.test.mjs)、[restart.test.mjs](../tests/restart.test.mjs) |
| 装配、启动、关闭与重启 | [main](../src/application/main.ts)、[MCP 入口](../src/application/mcp-entry.ts)、[共用后台启动](../src/application/background.ts)、[业务运行实例](../src/application/task-runtime.ts)、[launcher](../src/application/launcher.ts)、[启动准备](../src/application/startup.ts) | [stdio.test.mjs](../tests/stdio.test.mjs)、[restart.test.mjs](../tests/restart.test.mjs)、[service.test.mjs](../tests/service.test.mjs) |
| 离线数据升级 | [迁移入口](../scripts/migrate.mjs)、[格式校验](../src/tasks/storage/store.ts)、[SDK 存储校验](../src/integrations/coordinator/storage.ts) | [migration.test.mjs](../tests/migration.test.mjs)、[升级说明](upgrades.md) |
| 安装、更新与发布 | [命令入口](../bin/task-conductor.mjs)、[setup](../scripts/setup.mjs)、[包更新](../scripts/update.mjs)、[安装库](../scripts/install-lib.mjs)、[包门禁](../scripts/pack-release.mjs)、[发布准入](../scripts/check-release.mjs)、[工作流](../.github/workflows/) | [install.test.mjs](../tests/install.test.mjs)、[setup.test.mjs](../tests/setup.test.mjs)、[update.test.mjs](../tests/update.test.mjs)、[release.test.mjs](../tests/release.test.mjs)、[升级说明](upgrades.md)、[发布说明](release.md) |

宿主接入位于 [plugin](../plugin/)，作为独立包分发；dsh SDK 由宿主提供。安装见[宿主接入](host-integrations.md)，通知归属与回执设计见[通知说明](notifications.md#可靠性与所有权)。

[Pi 扩展](../plugin/pi-extension.js)与[dsh 插件](../plugin/dsh.js)复用 CLI 检查摘要和共享技能。dsh 先注册技能，再按根会话建立原生 MCP；stdio cwd 固定为 session header 的 cwd，子代理调用由工具守卫拒绝。HTTP 传输失败时 [stdio](../src/protocol/stdio.ts)关闭连接，宿主重连后重新解析地址，失败调用由调用方核查。dsh Web 控制台由[宿主代理](../plugin/scripts/console-proxy.mjs)转发现有管理员 API，[客户端页面](../plugin/client.js)注册为侧栏面板与主面板槽条目；代理不读取或保存管理员令牌。

宿主验证入口为[启动检查](../tests/host-preflight.test.mjs)、[安装接入](../tests/host-integrations.test.mjs)、[dsh SDK](../tests/dsh-integration.test.mjs)和[插件包门禁](../scripts/pack-plugin.mjs)。

## 模型可见上下文

修改模型可见内容或其加载方式时遵循[模型指令编写原则](model-instruction-guidelines.md)。MCP 宿主、内部协调者和 ACP 节点使用各自的模型上下文；检查首轮与续接时，从接收者的实际组装入口追踪内容。

| 接收者与内容 | 入口 |
| --- | --- |
| MCP 宿主：服务引导、工具及字段说明 | [服务引导与输出契约](../src/protocol/mcp-contract.ts)、[工具注册](../src/protocol/mcp.ts)、[任务输入契约](../src/protocol/task-contract.ts)；HTTP 与 [stdio](../src/protocol/stdio.ts)共用服务引导 |
| 宿主：技能发现、按需参考资料与启动异常提示 | [共享技能](../plugin/skills/using-task-conductor/SKILL.md)、[启动检查与提示](../plugin/scripts/preflight.mjs)、[Pi](../plugin/pi-extension.js)、[dsh](../plugin/dsh.js)、[Claude/Codex hook](../plugin/scripts/session-start.mjs) |
| Pi/dsh 宿主：后台事件与后续操作提示 | [共用通知内容](../plugin/scripts/notification-common.mjs)、[Pi 投递](../plugin/scripts/notifications.mjs)、[dsh 投递](../plugin/scripts/dsh-notifications.mjs) |
| 协调者：角色、工具、当前任务状态与记忆 | [角色、工具与 SDK hooks](../src/integrations/coordinator/coordinator.ts)、[有界账本视图](../src/integrations/coordinator/context.ts)、[Document 与更新契约](../src/integrations/coordinator/memory.ts) |
| ACP 执行端：节点要求、本轮背景和交付引用 | [派发组装](../src/tasks/execution-context.ts)、[派发调用](../src/tasks/supervisor.ts)、[ACP prompt](../src/integrations/acp/connection.ts)；原生提示、工具与配置由执行端管理 |

协调状态、选定事实、记忆范围及节点首次和续接上下文的设计见[会话设计](task-conversation-plan.md)。宿主的技能发现和启动引导见[宿主接入](host-integrations.md)，事件进入原会话的时机及去重见[通知设计](notifications.md)。协调历史与压缩沿用 durable SDK；本项目没有另设摘要模型循环。

## 依赖与一致性边界

依赖方向由[架构原则](architecture-guidelines.md#职责与依赖)定义，[依赖检查器](../scripts/check-boundaries.mjs)随 `npm run check` 执行。模块分类、允许引用及 Run 写入口检查以该脚本为准；新增文件须明确归属。

[TaskRuns](../src/tasks/runs.ts)是 Run 状态的唯一业务写入口。状态转换与提交顺序在该服务维护，事务实现在 [TaskStore](../src/tasks/storage/store.ts)。[持久记录校验](../src/tasks/storage/records.ts)严格拒绝缺失或非规范记录，不使用请求默认值修复；管理员提供的下次启动配置另用[配置请求契约](../src/protocol/settings-contract.ts)解析。

Task 输入与相关 Run 决策在业务库中提交；SDK inbox 和 Document 使用独立存储，不宣称跨库原子。会话、输入与补充交付的安全约束见[会话设计](task-conversation-plan.md)。

## Web 模块

控制台使用原生 ES modules，不引入前端运行时或全局状态容器。依赖方向为应用装配 → 页面 → 展示组件；API 客户端只由应用装配持有，页面之间不互相引用。

| 职责 | 入口 |
| --- | --- |
| 连接、路由、提示、页面生命周期与状态轮询 | [app.js](../src/web/app.js) |
| 内存令牌、HTTP 请求、取消与错误转换 | [api.js](../src/web/api.js) |
| 任务浏览、执行端管理、设置编辑及各自状态 | [tasks-view.js](../src/web/tasks-view.js)、[executors-view.js](../src/web/executors-view.js)、[settings-view.js](../src/web/settings-view.js) |
| 通用 DOM 组件、配置字段、密钥编辑 | [dom.js](../src/web/dom.js)、[settings-fields.js](../src/web/settings-fields.js)、[credentials-view.js](../src/web/credentials-view.js) |

应用向页面显式传入请求、导航、反馈与取消信号；页面离开时取消请求和定时器，过期响应不替换当前页面。设置页统一持有编辑版本，子组件通过回调保存；预览在编辑或凭据保存后失效。业务规则仍由共享管理服务执行，前端不复制授权或调度决定。上述模块分层与循环由依赖检查器约束。

## 资源所有权

| 资源 | 创建与关闭责任 |
| --- | --- |
| 数据目录排他锁 | 应用入口取得，在业务与网络资源收尾后释放 |
| 业务 SQLite 与业务服务 | `createTaskRuntime` 创建；先停止准入和 Run 写入，保留输入回执服务供协调所有者收尾，最后关闭存储 |
| 协调调用、时钟与取消信号 | `TaskSupervisor` 创建并等待其结束；`TaskRuns` 不持有进程或 SDK 对象 |
| 节点会话句柄、超时与等待期间的会话 | `NodeSessions` 持有；关闭调用共用同一个完成结果 |
| 适配器安装进程与安装锁 | `ExecutorRegistry` 管理安装准入与取消，`LocalExecutors` 持有进程和锁；发布后保留旧组件，关闭时等待安装退出 |
| stdio 接入与共享后台 | `mcp-entry` 连接或启动独立 launcher；stdio 关闭只释放本连接，后台由显式 stop 或服务管理器关闭 |
| dsh 根会话 MCP、通知轮询、租约和临时绑定文件 | Host 的 Agent 作用域持有；重连先释放旧连接，关闭取消请求、尝试释放租约并删除临时文件，原生会话保留归属与消息回执；浏览器不持有这些资源 |
| worker 与 ACP 进程组 | ACP 接入创建与回收；监督器只持有窄会话能力 |
| durable storage 与 Harness | 按 Task 寻址，每次唤醒打开同一会话；正常决定等待 SDK 回执，系统停止先 abort 收尾再 close。打开失败关闭存储，成功后由 Harness 关闭其存储 |
| HTTP listener 与 MCP transport/server | `HttpServer` 持有；请求断开只释放请求资源，应用关闭停止新请求并收尾 |
| 配置和结果文件描述符 | 文件适配器在单次操作内打开，并在 `finally` 中关闭 |

关闭接口幂等。关闭开始后拒绝新的业务操作；未验收的外部执行被中断并阻断后续自动派发。

## 集成与验收入口

本地检查按 [AGENTS.md](../AGENTS.md#风格与命令)执行。macOS 临时目录过长导致 Unix socket 路径超限时，使用 `TMPDIR=/private/tmp npm test`。原生 Pi 测试的 SDK 配置见[通知说明](notifications.md#代码与验证入口)。

- [probe-agent.mjs](../scripts/probe-agent.mjs)：只做 ACP initialize。
- [单节点](../tests/e2e/deepseek-acp.test.mjs)、[问题回答 DAG](../tests/e2e/human-dag.test.mjs)、[同会话澄清](../tests/e2e/acp-clarification.test.mjs)、[持续对话与补充](../tests/e2e/task-conversation.test.mjs)：真实模型用例。
- [E2E harness](../tests/e2e/harness.mjs)、[Pi 启动器](../scripts/run-pi-human-e2e.mjs)：测试环境、服务生命周期和结果输出。

真实模型测试仅在获准环境运行，会产生模型费用。安全注入测试用 `DEEPSEEK_API_KEY` 后，可用 `npm run test:e2e:human -- --suite single` 执行隔离 Pi 用例，其他用例和参数见启动器。它创建独立原生配置并只启用 read；强杀后须核查临时认证清理。其他获准执行端通过 `TASK_CONDUCTOR_E2E_EXECUTOR` 选择，并自行准备原生配置后运行 `npm run test:e2e`。

dsh 通过[自定义 ACP](../plugin/skills/using-task-conductor/references/custom-acp.md#dsh-acp-执行端)注册，使用其原生模型与工具配置。

配置示例见 [config.example.json](../config.example.json)，命令和依赖版本见 [package.json](../package.json)，操作前提见[部署说明](deployment.md)。
