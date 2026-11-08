# Pi、dsh、Claude Code 与 Codex 接入包

先安装接入包，再调用 `using-task-conductor` 安装、初始化和使用服务。服务包为 `task-conductor`，插件包为 `task-conductor-plugin`，两者分别安装。

Linux/macOS 的服务及非 dsh 接入要求 Node.js 22.19+ 与 npm；dsh 要求 Node.js 24.9+，插件安装命令还需要 PATH 中的 pnpm。Pi 需要 1.4.0+ 的原生 MCP；Claude Code 和 Codex CLI 需要插件支持。dsh 最低版本见 [package.json](../plugin/package.json)。

## 安装

### Pi

```bash
pi install npm:task-conductor-plugin
```

项目作用域附加 `--local`。启动 Pi，已有会话先 `/reload`，再调用 `/skill:using-task-conductor`。setup 后按选定作用域使用原生 `pi mcp add` 注册连接；已有同名配置先核对。

### dsh

将 `existing-profile` 替换为已有目标 profile，tarball 使用[本地打包](#未发布资产的本地验收)的输出路径：

```bash
dsh plugin --profile existing-profile add /absolute/path/to/task-conductor-plugin-0.1.9.tgz
```

从目标项目目录启动该 profile，调用 `/using-task-conductor` 或用原生 `skill` 工具加载引导。插件为每个根会话建立 MCP，任务默认目录取自该会话的启动目录；子代理须由主会话提交任务。服务尚未准备时仍可使用技能。

```text
/task-conductor status
/task-conductor connect
```

`status` 查看连接、目录和通知归属；setup、执行端注册或故障修正后用 `connect` 重连。无需另加手工 MCP 项。

### Claude Code

```bash
claude plugin marketplace add https://raw.githubusercontent.com/realqiyan/task-conductor/master/.claude-plugin/marketplace.json
claude plugin install task-conductor@task-conductor --scope user
```

需要项目声明时用 `--scope project`。新会话调用 `/task-conductor:using-task-conductor`。插件已声明 MCP，setup 后重连即可。

### Codex CLI

```bash
codex plugin marketplace add realqiyan/task-conductor --sparse .agents/plugins
codex plugin add task-conductor@task-conductor
```

新会话调用 `$using-task-conductor` 或在 `/skills` 中选择。启动检查 hook 需要先在 `/hooks` 中审查并信任。

### 服务与项目边界

多个项目或 profile 可共用后台；需要独立服务数据时使用不同 `--home`。安装接入包后，技能会沿用已有命令、配置和用户约定完成服务 setup；凭据通过用户终端或私有文件提供。详细操作见包内[安装与连接](../plugin/skills/using-task-conductor/references/installation.md)。

dsh 作为执行端时须另行[注册 `dsh --profile acp`](../plugin/skills/using-task-conductor/references/custom-acp.md#dsh-acp-执行端)。协调模型独立配置，内部 pi durable 无需交互式 Pi CLI。

## 未发布资产的本地验收

在仓库根目录选择对应宿主的命令。dsh 输出目录须已存在：

```bash
TASK_CONDUCTOR_SOURCE="$(pwd -P)"
pi install "$TASK_CONDUCTOR_SOURCE/plugin"

node scripts/pack-plugin.mjs /absolute/artifacts
dsh plugin --profile existing-profile add /absolute/artifacts/task-conductor-plugin-0.1.9.tgz

MARKETPLACE="$(node scripts/create-plugin-marketplace.mjs)"
claude plugin marketplace add "$MARKETPLACE"
claude plugin install task-conductor@task-conductor-dev --scope user
codex plugin marketplace add "$MARKETPLACE"
codex plugin add task-conductor@task-conductor-dev
```

本地 marketplace 使用独立快照；保留输出目录直到移除注册，源码变化后重新生成并更新。dsh 重新打包安装后重开 profile。正式与开发插件只启用一份；正式 marketplace 固定指向 npm 包版本。

服务使用同一源码构建的 tarball 或已构建的源码入口，见[源码服务安装](deployment.md#源码与未发布接入)。替换已有服务时按[升级流程](upgrades.md)停服、备份并重连。

## Pi 与 dsh 任务通知

两种宿主将后台事件送回原持久会话，忙碌时排队，关闭后恢复原会话可补读。首次提交保存项目身份；fork 和新会话使用各自归属。Claude/Codex 当前只提供启动检查。配置与投递语义见[通知说明](notifications.md)。

## 启动提醒与检查边界

启动检查读取初始化状态和已有后台版本，异常时给出技能入口。它本身只读；dsh 检查通过后的 MCP 连接可启动后台和准备执行端。会话内安装或升级后，按[连接核查](../plugin/skills/using-task-conductor/references/installation.md#连接核查)重连并调用只读工具。

默认使用宿主 PATH 中的 `task-conductor` 和默认 home。自定义时设置宿主启动环境：

```bash
export TASK_CONDUCTOR_PREFLIGHT_COMMAND=/absolute/bin/task-conductor
export TASK_CONDUCTOR_PREFLIGHT_HOME=/absolute/private/task-conductor
```

| 宿主 | 两个变量的作用 |
| --- | --- |
| dsh | 同时选择检查、原生 MCP 和通知桥接；修改后重开 profile |
| Pi | 选择检查与通知桥接；MCP 须单独指向同一程序/home |
| Claude/Codex | 选择检查目标；自定义 MCP 按包内[连接说明](../plugin/skills/using-task-conductor/references/installation.md#claude-code-与-codex-插件)配置 |

MCP 名称及通知开关见[通知配置](notifications.md#配置目标)。检查实现与宿主接入入口见[代码导航](technical-design.md)。

## 使用引导

- [安装与连接](../plugin/skills/using-task-conductor/references/installation.md)：setup、原生 MCP、自定义 home、升级和重连。
- [自定义 ACP](../plugin/skills/using-task-conductor/references/custom-acp.md)：管理员注册本机 stdio 执行端，包括 dsh。
- [日常使用](../plugin/skills/using-task-conductor/references/tasks.md)：固定 DAG、运行、交付、问题回答及任务控制。
- [排障](../plugin/skills/using-task-conductor/references/troubleshooting.md)：安装、连接、通知和执行故障。

## 更新与移除

服务与插件使用同一项目版本，分别更新。正式 marketplace 更新时刷新索引，再使用宿主插件更新入口；本地资产重新生成并安装。更新插件后重开宿主，服务升级见[升级说明](upgrades.md)。

| 宿主 | 移除命令 |
| --- | --- |
| Pi npm 安装 | `pi remove npm:task-conductor-plugin` |
| Pi 源码安装 | `pi remove "$TASK_CONDUCTOR_SOURCE/plugin"` |
| dsh | `dsh plugin --profile existing-profile remove task-conductor-plugin` |
| Claude Code | `claude plugin uninstall task-conductor@task-conductor` |
| Codex | `codex plugin remove task-conductor@task-conductor` |

dsh 使用安装时的 profile；Claude/Codex 开发插件名为 `task-conductor@task-conductor-dev`。Pi 独立注册的连接用 `pi mcp remove task-conductor` 移除；其他手工连接和闲置 marketplace 也分别移除。

卸载插件后，共享后台和已提交任务继续运行，服务数据保留。需要停服时使用同一 `--home` 的 `task-conductor status`、`stop`，先核查活动工作。

## 原生机制依据

- Pi：[packages](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/packages.md)、[MCP](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/mcp.md)。
- dsh：[CLI 与 profile](https://www.npmjs.com/package/@deepseek-ai/dsh)、[插件清单](../plugin/package.json)。
- Claude Code：[marketplace](https://code.claude.com/docs/en/plugin-marketplaces)、[插件清单](https://code.claude.com/docs/en/plugins-reference)。
- Codex：[插件与 marketplace](https://developers.openai.com/plugins/build/plugins)。
