# Task Conductor

[English](README.md) | 简体中文

独立的智能任务服务：**MCP 管理任务，pi durable 推进调用方定义的 DAG，ACP 执行端完成领域工作**。调用方确定节点和执行端，协调者通过持续会话澄清需求、审查交付并判断整体目标是否完成。

当前处于调研阶段，不宣称生产可用，不用于无人值守交易。

## 从哪里开始

| 目的 | 入口 |
| --- | --- |
| 安装、配置、运行 | [部署说明](docs/deployment.md) |
| 服务包更新、数据检查与离线迁移 | [升级说明](docs/upgrades.md) |
| Pi、dsh、Claude Code、Codex 接入包与 using-task-conductor 使用引导 | [宿主接入](docs/host-integrations.md) |
| 本机控制台、配置保存与 Web/CLI 重启 | [控制台说明](docs/web-console.md) |
| 命令行配置、凭据和任务管理 | [CLI 说明](docs/cli.md) |
| 理解产品目标和架构选择 | [总体方案](docs/design-proposal.md) |
| Pi/dsh 原会话自动通知、身份与可靠补读 | [通知设计与使用](docs/notifications.md) |
| Task 持续对话、Document 记忆与补充交付 | [会话设计](docs/task-conversation-plan.md) |
| 查询项目术语 | [词汇表](CONTEXT.md) |
| 查找实现与对应测试 | [代码导航](docs/technical-design.md) |
| 编写提示、工具说明、技能及调整上下文加载 | [模型指令编写原则](docs/model-instruction-guidelines.md) |
| npm 候选验收、GitHub Actions 与受控发布 | [发布说明](docs/release.md) |
| 修改项目 | [开发指南](AGENTS.md)、[架构原则](docs/architecture-guidelines.md) |

默认仓库首页为英文，本页提供中文说明。详细文档、CLI 输出和内置使用引导目前以中文为主。文档保留用途、操作和约束；字段、默认值、状态转换及内部流程以代码为准。

## 使用入口

Linux/macOS，服务及非 dsh 接入要求 Node.js **22.19+**，dsh 要求 **24.9+**。已发布 npm 安装包自带运行产物。

```bash
npm install -g task-conductor
task-conductor setup
# 在 MCP 宿主中配置 command: task-conductor，args: [mcp]
# 连接后可查询后台状态：
task-conductor status
# 应用已保存配置并确认新实例可用：
task-conductor restart
```

setup 确认本机配置；MCP 连接自动启动或复用独立后台，宿主退出后后台继续运行。首次使用须安装至少一种原生执行 CLI，或[注册自定义本机 stdio ACP](docs/cli.md#自定义本机-acp-接入)，并准备其原生认证。Pi、dsh、Claude Code 和 Codex 可先安装[接入包](docs/host-integrations.md)，通过 `using-task-conductor` 完成服务安装、setup 和 MCP 操作。

各宿主的安装和连接命令见[宿主接入](docs/host-integrations.md)；Pi 与 dsh 还支持原会话任务通知。执行端准备和后台管理见[部署说明](docs/deployment.md)。

采用 `mcpServers` 格式的宿主可添加以下配置；文件位置和外层结构由宿主决定：

```json
{
  "mcpServers": {
    "task-conductor": {
      "command": "task-conductor",
      "args": ["mcp"]
    }
  }
}
```

宿主找不到命令时使用绝对路径；自定义安装目录时使用 `["mcp", "--home", "/absolute/private/task-conductor"]`。无需预先执行 `start`。本机 Web 控制台位于 `status` 返回地址的 `/admin/`，使用独立管理员令牌。

任务由 `task_create` 提交固定 DAG，每个节点选择已就绪执行端。每个 Task 保留一条协调会话，Run 单独记录执行；普通消息不启动空闲 ACP 工作，也不代替明确的问题回答。对话与补充执行入口见[会话设计](docs/task-conversation-plan.md#使用与实现入口)。显式工作目录优先，否则 stdio 入口补入自己的启动目录；直接 HTTP 调用必须提供目录。具体契约见 [task-contract.ts](src/protocol/task-contract.ts)，管理工具见 [mcp.ts](src/protocol/mcp.ts)。

## CLI 命令索引

完整命令与参数使用 `task-conductor --help`、`task-conductor <命令> --help` 查询，不在文档中维护副本。

- 安装与运行：`setup`、`mcp`、`start`、`stop`、`restart`、`status`，见[部署说明](docs/deployment.md)；服务包更新使用 `update`，数据迁移使用 `migrate`，见[升级说明](docs/upgrades.md)。
- 配置与凭据：`config`、`executor`、`coordinator`、`credential`；任务与运行：`task`、`run`，见 [CLI 说明](docs/cli.md)。

## 运行与安全边界

- 已验收交付解锁依赖，整体完成由协调者明确判断。支持立即、定时及 Cron 任务，单节点与多节点共用 API。
- 普通讨论不授权额外工作；补充执行必须有明确意图，已验收交付与终结 Run 不可变。
- 外部工作中断或结果不明时阻止新派发，不自动重试、重放副作用或切换执行端。
- 使用前配置执行端原生认证和无人值守权限；服务拒绝额外 ACP 审批请求。本机 OS 用户属于信任范围，日志和 Agent 输出按敏感数据保护。
- `task-conductor stop` 停止后台及活动执行；重启关闭 ACP 会话，可能中断待回答 Run，操作前核查活动工作。
- 服务更新的前置检查、备份、宿主重连和旧版入口统一见[升级说明](docs/upgrades.md)。`update` 不更新插件或执行端，不自动迁移数据；`restart` 仅重启服务子进程以应用配置。

## 开发

开发与 dsh 集成测试使用 Node.js **24.9+**，依赖版本见 [package.json](package.json)。

```bash
npm ci --ignore-scripts
npm run check
npm test
git diff --check
```

基础测试使用真实本机文件、SQLite、进程和 SDK。真实模型测试的运行前提与入口见[开发说明](docs/technical-design.md#集成与验收入口)。

## 许可证

[MIT](LICENSE)，Copyright (c) 2026 realqiyan。依赖及执行端仍遵循各自许可证。
