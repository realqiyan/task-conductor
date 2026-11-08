# 宿主通知

Pi 与 dsh 支持把任务事件送回原持久会话，安装见[宿主接入](host-integrations.md)。本文说明使用方式及投递设计。

## 产品行为

任务创建时绑定项目与原会话。成功、失败、中断、超时、取消、跳过和待回答问题产生通知；Cron 的每次 Run 分别记录。宿主空闲时自动跟进，忙碌时排队。关闭期间事件保留，恢复原会话后补读；新会话与 fork 使用各自归属。

回复通知中的问题前，查询当前问题及期限。通知中的“已投递”表示消息已保存到目标会话；模型处理状态和用户阅读状态需分别查看。完整任务结果通过 MCP 查询。

当前支持本机服务的会话通知。Claude/Codex、邮件、桌面推送、多渠道配置和纯提醒任务暂未实现。

## 身份

通知按 `projectId + sessionId` 路由。首次提交任务时创建 `.task-conductor/project.json` 保存项目身份，已有配置持续复用。默认配置目录为 Git 仓库根目录，无 Git 时使用会话 cwd；monorepo 默认共享项目身份。

有可用 origin 时按分组路径和仓库名生成标识，不同主机上的同名仓库会共享身份；无 origin 时生成 UUID。不支持的 remote 格式须显式配置。复制项目后需要独立身份时修改该配置；无 remote 项目跨机器共用时同步配置。标识规则见[共享身份实现](../plugin/scripts/notification-common.mjs)。

会话身份由宿主原生 ID 生成并保存在会话中，resume 复用，fork 新建。dsh 的继承历史不接管父会话归属。模型省略创建参数中的 `notification`，由接入层填写；任务创建后保持原绑定。

## 启用与运行边界

### Pi

安装[Pi 接入包](host-integrations.md#pi)，完成 setup 并注册 MCP。自动通知适用于 TUI/RPC 持久会话；print、JSON 和内存会话使用 MCP 主动查询结果。

### dsh

安装[dsh 接入包](host-integrations.md#dsh)，从目标项目启动已有 profile。根会话持有 MCP 与通知接收，子代理由主会话提交任务。使用 `/task-conductor status` 查看状态，setup 或故障修正后用 `/task-conductor connect` 重连。

缺少模型时事件保留。模型准入失败或取消后，用户输入、选择模型或显式重连可再次触发投递。通知由 Host 会话处理，关闭浏览器页面后仍可继续。

### 共同链路

插件轮询持久事件，通过本机 `task-conductor notifications` 访问已有后台，合并成摘要并交给宿主原生 follow-up。后台停止期间事件保留，查询通知不会启动后台。未绑定会话的普通 MCP 任务使用主动查询。

## 配置目标

| 变量 | Pi | dsh |
| --- | --- | --- |
| `TASK_CONDUCTOR_PREFLIGHT_COMMAND`、`TASK_CONDUCTOR_PREFLIGHT_HOME` | 选择检查与通知桥接；MCP 须独立指向相同程序/home | 同时选择检查、MCP 和通知桥接 |
| `TASK_CONDUCTOR_MCP_SERVER` | 匹配已有 MCP 服务名，默认 `task-conductor` | 设置 MCP 名称及工具命名空间，默认 `task-conductor` |
| `TASK_CONDUCTOR_NOTIFICATIONS=off` | 关闭通知与自动绑定，保留检查和技能 | 暂不支持 |
| `TASK_CONDUCTOR_PROJECT_ROOT` | 以绝对路径选择项目身份配置目录 | 同左 |

变量从宿主启动环境读取，修改后重开宿主。Pi 的 MCP 与通知桥接须指向同一本机安装；dsh 由插件统一配置。

## 可靠性与所有权

Run 事件与业务状态在同一 SQLite 事务提交，渠道投递另行记录。服务以项目/会话租约选出接收者，确认时检查租约和事件归属；读取与确认只更新投递状态。

两种宿主均以持久消息作为回执：Pi 检查并同步原生 JSONL 中的通知消息；dsh 通过原生会话接口读取 `user/message` 并执行 flush。排队后退出的事件保留待投递状态；消息已保存而服务确认失败时，恢复后补确认。fork 的继承消息不作为本会话回执。

dsh 在创建任务前持久化归属，通过私有绑定文件交给 stdio；stdio 每次创建时读取并覆盖通知字段。绑定不可安全读取时拒绝创建。文件、轮询、连接与租约由 Host 会话持有，关闭时释放；持久归属留在原生会话。

事件 ID 和会话记录用于恢复去重。网络分区、租约过期与旧进程存活的竞争仍可能造成重复投递；通知重试只处理消息，不重放任务。

## 扩展边界

新增渠道需独立的目标与投递状态。集中部署还需认证主体及项目授权，projectId/sessionId 是路由标识。当前单机令牌以同一 OS 用户为信任范围。

## 代码与验证入口

- [通知服务](../src/tasks/notifications.ts)、[协议契约](../src/protocol/notification-contract.ts)、[本机桥接](../src/application/notification-entry.ts)。
- [共享身份与桥接](../plugin/scripts/notification-common.mjs)、[Pi 回执](../plugin/scripts/notifications.mjs)、[dsh 绑定与回执](../plugin/scripts/dsh-notifications.mjs)、[stdio 归属覆盖](../src/protocol/stdio.ts)。
- [业务测试](../tests/notifications.test.mjs)、[Pi SDK](../tests/pi-notifications.test.mjs)、[dsh SDK](../tests/dsh-integration.test.mjs)、[stdio](../tests/stdio.test.mjs)。

dsh 用例使用仓库锁定的开发依赖，要求 Node.js 24.9+。Pi 原生用例使用已安装的 SDK：

```bash
npm run build
TASK_CONDUCTOR_PI_SDK=/absolute/path/to/pi-coding-agent \
  node --test tests/pi-notifications.test.mjs
```

未提供 SDK 路径时跳过 Pi 原生用例。
