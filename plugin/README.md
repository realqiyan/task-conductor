# Task Conductor 宿主接入

为 Pi、dsh、Claude Code 和 Codex 提供 `using-task-conductor` 技能、启动检查及 MCP 接入。服务包 `task-conductor` 与插件包 `task-conductor-plugin` 分别安装。

## 安装接入包

服务及非 dsh 接入要求 Linux/macOS、Node.js 22.19+ 与 npm。dsh 要求 Node.js 24.9+，插件安装命令还需要 pnpm；最低宿主版本见 [package.json](package.json)。

Pi、Claude Code 和 Codex 的安装入口：

```bash
pi install npm:task-conductor-plugin

claude plugin marketplace add https://raw.githubusercontent.com/realqiyan/task-conductor/master/.claude-plugin/marketplace.json
claude plugin install task-conductor@task-conductor --scope user

codex plugin marketplace add realqiyan/task-conductor --sparse .agents/plugins
codex plugin add task-conductor@task-conductor
```

dsh 使用本地插件 tarball。在源码仓库根目录打包，输出目录须已存在；将 `existing-profile` 换成已有目标 profile：

```bash
node scripts/pack-plugin.mjs /absolute/artifacts
dsh plugin --profile existing-profile add /absolute/artifacts/task-conductor-plugin-0.1.9.tgz
```

从目标项目目录重开 profile。服务本地构建、源码插件安装及开发 marketplace 见[宿主接入说明](https://github.com/realqiyan/task-conductor/blob/master/docs/host-integrations.md#未发布资产的本地验收)。

## 使用入口

| 宿主 | 调用技能 |
| --- | --- |
| Pi | `/skill:using-task-conductor` |
| dsh | `/using-task-conductor` 或原生 `skill` 工具 |
| Claude Code | `/task-conductor:using-task-conductor` |
| Codex | `$using-task-conductor` 或 `/skills` |

技能沿用已有安装与配置约定，指导 setup 和连接。凭据在用户终端或私有文件中处理。Pi 在 setup 后注册 MCP；Claude/Codex 使用插件声明的连接；dsh 为根会话建立 MCP，使用 `/task-conductor status` 查看、`/task-conductor connect` 重连。服务尚未准备时仍可调用技能。

启动检查读取初始化状态和后台版本，异常时提供技能入口。Codex 的 hook 需先在 `/hooks` 中审查并信任。自定义程序、home 及各宿主连接步骤见[安装与连接](skills/using-task-conductor/references/installation.md)。

## 任务与通知

Pi TUI/RPC 持久会话和 dsh 根会话自动接收任务通知，忙碌时排队，关闭后恢复原会话可补读。首次提交在项目目录保存 `.task-conductor/project.json`，fork 使用独立归属。Claude/Codex 当前使用 MCP 主动查询进度。

通知配置见[安装参考](skills/using-task-conductor/references/installation.md#pi-与-dsh-通知设置)，投递机制见[通知说明](https://github.com/realqiyan/task-conductor/blob/master/docs/notifications.md)。

## 使用引导

- [安装、升级与连接](skills/using-task-conductor/references/installation.md)
- [自定义本机 ACP，包括 dsh](skills/using-task-conductor/references/custom-acp.md)
- [提交任务、查看交付和回答问题](skills/using-task-conductor/references/tasks.md)
- [故障排查](skills/using-task-conductor/references/troubleshooting.md)
- [更新与移除接入包](https://github.com/realqiyan/task-conductor/blob/master/docs/host-integrations.md#更新与移除)

卸载插件后，共享服务和已提交任务继续运行，历史数据保留。后台管理使用 setup 时的同一 home。
