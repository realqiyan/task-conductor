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

宿主安装资产位于 [plugin](../plugin/)，包含 Pi、dsh、Claude Code/Codex 原生入口、`using-task-conductor`、只读启动检查及 [Pi/dsh 会话通知](notifications.md)，不进入服务运行时依赖图。dsh SDK 是宿主提供的 optional peers，插件无运行时依赖或安装 hook；[仓库开发依赖](../package.json)锁定 dsh `0.2.2-rc.1`，运行其测试需要 Node.js 24.9+，服务和非 dsh 路径仍支持 22.19+。安装见[接入说明](host-integrations.md)。

[Pi 扩展](../plugin/pi-extension.js)与[dsh 插件](../plugin/dsh.js)都复用 CLI 检查摘要和共享 skill。dsh 的 skill provider 在检查之前注册，首轮原生 skill 目录可发现引导；异常通过原生 notice 提供上下文。每个非子代理根会话通过检查后，在自己的 Agent 作用域加载原生 MCP，固定 stdio cwd 为 session header 的 cwd；工具守卫拒绝子代理借用。`/task-conductor status` 查询状态，`connect` 重建该会话的连接；没有第二套模型循环或浏览器端连接所有者。

冻结的 dsh 工具参数不在 hook 中修改。创建前保存并 flush 原生可忽略绑定记录，发布私有临时文件；[CLI](../bin/task-conductor.mjs)和[MCP 入口](../src/application/mcp-entry.ts)将 `--notification-file` 交给 [stdio](../src/protocol/stdio.ts)，由 stdio 严格读取、覆盖归属后转发 HTTP。上游 HTTP 传输失败会关闭 stdio，让宿主原生 MCP 重连时重新解析服务地址；不会重发失败的工具调用。会话恢复、fork 继承前缀及持久化回执的规则统一见[通知设计](notifications.md#可靠性与所有权)。

[检查测试](../tests/host-preflight.test.mjs)覆盖只读摘要和故障分类；[独立包门禁](../scripts/pack-plugin.mjs)不构建或安装服务。[接入测试](../tests/host-integrations.test.mjs)、[dsh SDK 用例](../tests/dsh-integration.test.mjs)和[stdio 用例](../tests/stdio.test.mjs)是安装、会话作用域与真实工具调用的验证入口；实际结果由[验证说明](validation.md)维护。

## 依赖与一致性边界

依赖方向由[架构原则](architecture-guidelines.md#职责与依赖)定义，[依赖检查器](../scripts/check-boundaries.mjs)随 `npm run check` 执行。模块分类、允许引用及 Run 写入口检查以该脚本为准；新增文件须明确归属。

[TaskRuns](../src/tasks/runs.ts)是 Run 状态的唯一业务写入口。状态转换与提交顺序在该服务维护，事务实现在 [TaskStore](../src/tasks/storage/store.ts)。[持久记录校验](../src/tasks/storage/records.ts)严格拒绝缺失或非规范记录，不使用请求默认值修复；管理员提供的下次启动配置另用[配置请求契约](../src/protocol/settings-contract.ts)解析。

Task 输入与相关 Run 决策在业务库中提交；SDK inbox 和 Document 使用独立存储，不宣称跨库原子。会话、输入与补充交付的安全约束见[会话设计](task-conversation-plan.md)。

检查器约束源码依赖，不是权限沙箱，也不证明运行时副作用安全。真实模型和执行端的证据边界见[验证说明](validation.md)。

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

关闭接口幂等。关闭开始后拒绝新的业务操作；未验收的外部执行被中断并阻断后续自动派发。进程组回收与文件事务不能证明无孤儿进程、断电恢复或外部副作用 exactly-once。

## 集成与验收入口

- [probe-agent.mjs](../scripts/probe-agent.mjs)：只做 ACP initialize。
- [单节点用例](../tests/e2e/deepseek-acp.test.mjs)、[问题回答 DAG 用例](../tests/e2e/human-dag.test.mjs)、[持续对话、记忆与补充用例](../tests/e2e/task-conversation.test.mjs)：真实模型验收。
- [E2E harness](../tests/e2e/harness.mjs)、[Pi 启动器](../scripts/run-pi-human-e2e.mjs)：环境准备、服务生命周期和证据保存。

dsh 作为 ACP 执行端使用管理员注册的 `dsh-acp` ID，命令为规范绝对路径的 `dsh --profile acp`；不增加自动发现项或保留 `dsh` ID。它沿用 dsh 自身模型、工具、ACP profile 和后台继承的原生环境；Task Conductor 内部的 pi durable 协调者保持独立，不要求交互式 Pi CLI。操作见[自定义 ACP](../plugin/skills/using-task-conductor/references/custom-acp.md#dsh-acp-执行端)。

配置示例见 [config.example.json](../config.example.json)，命令和依赖版本见 [package.json](../package.json)。操作前置条件与已验证范围见[部署说明](deployment.md)、[验证说明](validation.md)。
