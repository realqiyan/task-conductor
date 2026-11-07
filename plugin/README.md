# Task Conductor 宿主接入

Pi、dsh、Claude Code 与 Codex 的接入资产，不含服务运行时依赖或 npm 安装 hook。插件名为 `task-conductor`，技能名为 `using-task-conductor`，任务操作使用现有 Task Conductor MCP 工具。dsh SDK 由宿主提供，声明为 `"*"` optional peers。

## 安装接入包

服务与插件在同一仓库开发，作为两个包独立分发。插件包为 `task-conductor-plugin`，不要将服务包 `task-conductor` 当作 Pi 插件安装。

**`0.1.6` 候选版本包含新增 dsh 接入，尚未发布。** 发布前使用同一源码打包的插件及匹配服务。dsh 要求 Node.js 24.9+；最低宿主版本见 [package.json](package.json)，当前仓库开发基线为 `0.2.2-rc.1`。在源码仓库根目录打包，输出目录须已存在：

```bash
node scripts/pack-plugin.mjs /absolute/artifacts
dsh plugin --profile existing-profile add /absolute/artifacts/task-conductor-plugin-0.1.6.tgz
```

将 `existing-profile` 换成已有目标 profile，不重建或重置它；原生插件命令需要 PATH 中的 pnpm。服务的本地 tarball/源码运行步骤见[安装参考](skills/using-task-conductor/references/installation.md#未发布-dsh-接入)。从目标项目目录重开该 profile。

Pi、Claude Code/Codex 的已发布包入口为：

```bash
pi install npm:task-conductor-plugin
# Claude Code：获取 marketplace 索引，再安装 npm 插件
claude plugin marketplace add https://raw.githubusercontent.com/realqiyan/task-conductor/master/.claude-plugin/marketplace.json
claude plugin install task-conductor@task-conductor --scope user
# Codex：稀疏检出索引，再安装 npm 插件
codex plugin marketplace add realqiyan/task-conductor --sparse .agents/plugins
codex plugin add task-conductor@task-conductor
```

marketplace 固定插件版本。发布状态与验收范围见[验证说明](https://github.com/realqiyan/task-conductor/blob/master/docs/validation.md#宿主接入包)。Codex 稀疏检出仍可能下载 Git 元数据及根目录文件。

Pi 可直接安装源码的 `plugin/` 目录。Claude Code/Codex 开发者在仓库运行 `node scripts/create-plugin-marketplace.mjs`，注册输出目录，再安装 `task-conductor@task-conductor-dev`。这些本地资产须显式更新，不要同时启用开发版与正式版。

## 使用入口

- Pi：`/skill:using-task-conductor`。
- dsh：原生 `/using-task-conductor`，或通过 `skill` 工具加载 `using-task-conductor`。
- Claude Code：`/task-conductor:using-task-conductor`。
- Codex：`$using-task-conductor`，或在 `/skills` 中选择。

技能先检查已有安装，按用户请求和已有约定安装服务、运行 setup。凭据只在用户终端或私有文件中处理，不进入聊天。服务及非 dsh 使用要求 Linux/macOS、Node.js 22.19+ 和 npm；模型使用技能需要宿主自身的模型配置。

Pi 在 setup 后独立注册 MCP。Claude/Codex 插件已声明 MCP；服务未准备时连接失败是预期行为，setup 后重连即可。dsh 按每个非子代理的根会话执行检查，通过后创建该 Agent 的原生 MCP，以原生会话 cwd 启动；子代理不能借用父连接。安装或连接失败也不影响 skill 发现。在 dsh 主会话用 `/task-conductor status` 查看状态，用 `/task-conductor connect` 重新检查并连接，不另加手工 MCP 项。

内部 pi durable 协调不需要交互式 Pi CLI。要让 dsh 执行领域工作，另按[自定义 ACP](skills/using-task-conductor/references/custom-acp.md#dsh-acp-执行端)注册 `dsh --profile acp`；宿主插件不会自动注册执行端。

## Pi 与 dsh 任务通知

Pi TUI/RPC 持久会话及 dsh 根会话自动绑定项目与原会话，后台事件以原生 follow-up 跟进。首次提交在项目目录（Git 默认仓库根目录）保存 `.task-conductor/project.json`。关闭期间事件保留，恢复原会话后补读，fork 不接管父会话。

通知确认等待消息持久化，入队不算收到。dsh 使用原生 `user/message` 与 flush；模型准入失败或取消后，等待用户输入、模型选择或重连再尝试唤醒。dsh Host 会话持有轮询和租约，浏览器不承担确认。通知用于汇报，不重放任务。Claude/Codex 当前没有任务通知。

只支持本机 Task Conductor 服务。宿主启动环境中的配置如下：

- `TASK_CONDUCTOR_PREFLIGHT_COMMAND`、`TASK_CONDUCTOR_PREFLIGHT_HOME`：dsh 同时用于检查、原生 MCP 和通知桥接；Pi 用于检查与通知桥接，MCP 须另行配置为同一程序/home；Claude/Codex 仅用于检查。
- `TASK_CONDUCTOR_MCP_SERVER`：默认 `task-conductor`。Pi 用于匹配已有服务名；dsh 用于原生 MCP 名称及工具命名空间。
- `TASK_CONDUCTOR_PROJECT_ROOT`：显式选择项目身份配置目录。
- `TASK_CONDUCTOR_NOTIFICATIONS=off`：当前仅 Pi 支持，关闭通知而保留检查与 skill。

使用与设计边界见[通知说明](https://github.com/realqiyan/task-conductor/blob/master/docs/notifications.md)。

## 启动检查

检查依次调用有时长与输出限制的 `task-conductor setup --check --json` 和 `task-conductor status --json`。它只读已有配置摘要及后台版本，不直接读取凭据、不安装或修复、不启动后台或模型；dsh 在检查通过之后建立 MCP，由 MCP 按服务规则连接或启动后台。

异常通过各宿主原生提示及简短模型上下文给出技能入口。检查不持续监控，也不证明 MCP 已连接；会话内升级后须主动重连，缺失版本或查询失败保持未知。Codex hook 须先在 `/hooks` 中审查并信任。服务检查失败时，共享 skill 仍可通过宿主技能入口加载。

## 使用引导

- [安装、升级与连接](skills/using-task-conductor/references/installation.md)
- [自定义本机 ACP，包括 dsh](skills/using-task-conductor/references/custom-acp.md)
- [提交任务、查看交付和回答问题](skills/using-task-conductor/references/tasks.md)
- [故障排查](skills/using-task-conductor/references/troubleshooting.md)
- [宿主安装与移除](https://github.com/realqiyan/task-conductor/blob/master/docs/host-integrations.md)

卸载插件不停止共享服务或删除任务历史。dsh 使用安装时的 profile 执行 `dsh plugin --profile existing-profile remove task-conductor-plugin`；Pi 独立注册的 MCP 连接须另行移除。
