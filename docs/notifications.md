# 宿主通知

当前源码支持 Pi 与 dsh 的原会话自动跟进；新增 dsh 接入包含于尚未发布的 `0.1.6` 候选版本，安装见[宿主接入](host-integrations.md)。业务通知结构沿用 `0.1.0` 存储基线，不增加格式版本或转换脚本；已发布格式变化遵守[升级规则](upgrades.md)。

## 产品行为

任务创建时绑定项目与原会话。宿主插件轮询持久事件，通过原生 follow-up 在空闲时唤醒模型、忙碌时等待后续 turn，不打断当前工作。关闭期间事件保留，恢复原会话后补读。新会话、fork 和同项目其他会话不自动接管。

成功、失败、中断、超时、取消、跳过和待回答问题进入通知链路；Cron 每次 Run 分别记录。触发计划耗尽不等于执行成功。通知不改变任务的执行范围；待回答事件是发生时的快照，回复前仍须查询当前问题及期限。

当前不实现 Claude/Codex 任务通知、邮件、桌面推送、多渠道配置、纯定时提醒任务或跨会话接管。实现入口和实际验收范围见本文末尾及[验证说明](validation.md)。

## 身份

只用 `projectId + sessionId` 路由，没有第三个接收目标标识。工作目录仍是服务端执行路径，与通知项目身份分开。

项目配置为 `.task-conductor/project.json`，内容只有 `projectId`。首次提交任务时创建；已有配置优先，不因 remote 后来变化重新计算。它不是秘密，可以选择提交 Git；复制项目后若要独立身份，须显式修改配置。

- 有可用 origin：对完整分组路径和仓库名计算 SHA256，加 `git:` 前缀。例如 SSH/HTTPS 的 `team/app.git` 都取 UTF-8 字符串 `team/app`。不包含主机、认证信息或末尾 `.git`，保留大小写及嵌套分组。
- 无可用 origin：生成并保存 `uuid:` 加 UUID。跨机器使用同一无 remote 项目须同步配置。
- 不支持的 remote 格式拒绝自动初始化，可显式提供项目配置。不同主机的同名仓库故意共享标识；SHA256 不消除这类身份重合。
- 默认 Git 项目取仓库根目录，无 Git 时取宿主会话 cwd。monorepo 默认共享项目；绝对 `TASK_CONDUCTOR_PROJECT_ROOT` 可选择独立配置目录。

Pi 使用 `pi:<原生会话 ID>`，绑定写入 Pi 自定义记录。dsh 的常规会话 ID 使用 `dsh:<原生会话 ID>`；含点号等非契约字符或过长的 ID 使用 `dsh:sha256:<原生 ID 字符串的 SHA256>`，不计算文件哈希。绑定通过 `appendPluginRecord` 写入原生可忽略插件记录，并经持久化 flush 后使用。普通 resume 复用原归属；dsh 读取回执时跳过 fork 的 inherited event 前缀，不从继承历史接管父会话身份或通知。会话 ID 的唯一性由宿主保证，自定义 ID 不得在不同会话复用。

## 启用与运行边界

### Pi

安装[Pi 接入包](host-integrations.md#pi)，完成服务 setup 和独立 MCP 注册。扩展默认处理名为 `task-conductor` 的 MCP 服务，仅在 Pi TUI/RPC 持久会话启用；print、JSON 和内存会话不自动通知。

原生 `tool_call` 扩展在创建请求中覆盖可选 `notification` 字段；模型不填写它。Pi codemode 的嵌套工具调用也须经过该管线。投递使用 `sendMessage` 的 `triggerTurn: true, deliverAs: "followUp"`。

### dsh

安装[本地 dsh 接入包及对应服务](host-integrations.md#dsh)。每个非子代理的根会话检查安装后创建自己的原生 MCP 连接，以原生 session header 的 cwd 启动 stdio。子代理不能借用父会话连接。`/task-conductor status` 显示当前连接、目录和归属；setup 或故障修正后用 `/task-conductor connect` 重连。

dsh 工具参数是冻结对象。插件在 `task_create` 执行前保存并 flush 会话归属，再发布到私有临时文件；通过 `task-conductor mcp --notification-file <绝对路径>` 将该文件交给本会话的 stdio 进程。stdio 每次创建时严格读取文件，用它覆盖传入的 `notification` 后才转发 HTTP；模型参数不能替换此归属。文件缺失、无效或不可安全读取时拒绝创建，不退回无通知任务。临时文件随连接关闭清理，持久归属保存在原生会话中。

通知通过原生 `agent.followup` 投递，原生 `user/message` 带有项目、会话和事件 ID。接收者、轮询、MCP 连接和租约属于 dsh Host 的 Agent 生命周期；浏览器不承担通知所有权或持久化确认，关闭页面也不等于关闭 Host 会话。

### 共同链路

服务将归属与 Task 一起保存，重提不能换绑。未启用绑定的普通 MCP 调用仍可创建无会话通知的任务。插件通过本机 `task-conductor notifications` 桥接访问已有后台，不读取服务凭据、不自动启动或重启后台。桥接使用服务令牌，独立于管理员控制台是否启用；后端为经认证的 `POST /notifications`，没有 MCP 资源订阅或服务端推送。

默认每 5 秒检查，启动或恢复有绑定的会话时立即检查；每批最多 20 条，合并为有界摘要。完整结果仍按需通过 MCP 查询。dsh 缺少模型时保留事件；模型准入失败或取消后，不在每次轮询中重复唤醒。用户输入、选择模型或显式重连后可再次投递，已保存的消息则只补确认。

## 配置目标

| 变量 | Pi | dsh |
| --- | --- | --- |
| `TASK_CONDUCTOR_PREFLIGHT_COMMAND`、`TASK_CONDUCTOR_PREFLIGHT_HOME` | 选择启动检查及通知桥接；MCP 须独立配置为相同程序/home | 同时选择启动检查、原生 MCP 和通知桥接 |
| `TASK_CONDUCTOR_MCP_SERVER` | 匹配已有 MCP 服务名，默认 `task-conductor` | 设置原生 MCP 名称及工具命名空间，默认 `task-conductor` |
| `TASK_CONDUCTOR_NOTIFICATIONS=off` | 关闭通知与自动绑定，保留检查和 skill | 当前不支持此开关 |
| `TASK_CONDUCTOR_PROJECT_ROOT` | 选择项目身份配置目录 | 选择项目身份配置目录 |

变量从宿主启动环境读取，修改后重开宿主。当前只支持本机服务；Pi 的 MCP 与通知桥接必须指向同一安装，不能一个使用默认本机后台、另一个使用其他 home 或远程服务。dsh 由插件统一选择三个入口，无需再添加手工 MCP 连接。

## 可靠性与所有权

业务事件和渠道投递记录分开。Run 事件由 [TaskRuns](../src/tasks/runs.ts) 产生，与业务状态在同一 SQLite 事务提交；[通知服务](../src/tasks/notifications.ts)不执行模型或 ACP。读取、领取和确认不改变任务结果。

服务端以项目/会话的短期租约选出活动接收者；正常轮询续租，关闭尝试释放，崩溃后到期接续。确认检查租约、事件归属并原子提交具体事件 ID，不批量推进未展示事件的游标。

两种宿主都不把内存排队视为收件回执：

- **Pi**：`sendMessage` 没有持久化完成回执，且 `message_end` 回调早于 SDK 存储写入。插件读取 Pi 公布的 JSONL 会话格式，确认带相同归属和事件 ID 的自定义消息实际写入，并同步文件后才确认。
- **dsh**：通过原生会话持久化接口读取记录，执行 `sessions.flush`，只接收本会话已持久化的 `user/message`。inbox 排队事件不是确认依据；flush 不可用或失败时不确认。恢复后用这些原生记录去重，fork 的继承前缀不作为本会话回执。

查询或排队后退出，事件仍未确认。恢复时若原生 inbox 已持久化但尚无消息回执，插件在空闲、已选模型且租约有效时重新投递并唤醒；fork 中属于父会话的待投递通知会被移除。消息已保存但服务确认失败，恢复时只补确认。切换、重载或关闭时取消旧请求和定时器，释放连接及租约；异步结果不能跨会话使用。

“已投递”只代表消息进入目标持久会话，不代表模型处理成功或用户已读。模型可能在消息保存后失败，用户仍可查历史或主动请求汇报。网络分区、租约过期与旧进程仍存活的极端竞争不承诺 exactly-once；事件身份和会话记录用于去重。通知重试不重放任务副作用。

## 扩展边界

持久事件保存业务事实，投递记录按事件与渠道确认；当前只有 session 渠道，不预建邮件发送器、策略平台或动态插件接口。以后邮件/推送需要各自目标和投递状态，不复用会话确认冒充其他渠道成功。

MCP `notifications/resources/updated` 可作为将来的收件箱更新提示，仍复用读取和确认，不替代离线补读。宿主是否支持资源通知、是否能唤醒模型须分别验证。

集中部署前需增加认证主体与项目授权：projectId/sessionId 均非凭据，不允许仅凭 ID 读取、领取或确认。当前回环地址和单机服务令牌不构成多租户隔离；通知跨机器能力不等于执行端远程执行能力。

## 代码与验证入口

- [通知契约](../src/protocol/notification-contract.ts)、[创建绑定](../src/protocol/mcp.ts)、[本机桥接](../src/application/notification-entry.ts)。
- [共享项目身份与通知桥接](../plugin/scripts/notification-common.mjs)、[Pi 接收回执](../plugin/scripts/notifications.mjs)。
- [dsh Host 接入](../plugin/dsh.js)、[dsh 原生绑定与持久回执](../plugin/scripts/dsh-notifications.mjs)、[stdio 覆盖归属](../src/protocol/stdio.ts)、[私有文件读取入口](../src/application/mcp-entry.ts)。
- [业务/HTTP/项目身份测试](../tests/notifications.test.mjs)、[Pi SDK 用例](../tests/pi-notifications.test.mjs)、[dsh SDK 用例](../tests/dsh-integration.test.mjs)、[stdio 用例](../tests/stdio.test.mjs)。

dsh 用例使用仓库锁定的 `0.2.2-rc.1` 开发依赖，要求 Node.js 24.9+；构建后可运行 `node --test tests/dsh-integration.test.mjs`。Pi 原生用例使用已安装的包：

```bash
npm run build
TASK_CONDUCTOR_PI_SDK=/absolute/path/to/pi-coding-agent \
  node --test tests/pi-notifications.test.mjs
```

未提供该路径时，基础测试明确跳过 Pi 原生用例。测试入口不等于已完成验收；运行环境、结果、模型与 UI 缺口统一由[验证说明](validation.md)记录。
