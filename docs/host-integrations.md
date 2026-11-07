# Pi、dsh、Claude Code 与 Codex 接入包

**先安装接入包，再由 `using-task-conductor` 引导安装、初始化和使用服务。** 插件名为 `task-conductor`。skill 只指导使用现有 CLI/MCP，不增加任务 API、执行器或业务规则。

入口：[共享包](../plugin/)、[使用引导](../plugin/skills/using-task-conductor/SKILL.md)、[Claude marketplace](../.claude-plugin/marketplace.json)、[Codex marketplace](../.agents/plugins/marketplace.json)。

服务及非 dsh 接入支持 Linux/macOS、Node.js 22.19+ 与 npm；dsh 接入需要 **Node.js 24.9+**，原生插件命令还需要 PATH 中的 pnpm。Pi 需要 1.4.0+ 的原生 MCP；Claude Code 需要插件支持；Codex CLI 需要 `plugin marketplace add` 和 `plugin add`。dsh 的最低版本见 [engines.dsh](../plugin/package.json)，仓库开发依赖固定为 `0.2.2-rc.1`。实际验收范围见[验证说明](validation.md#宿主接入包)，不承诺其他客户端形态可用。

## 一个仓库、两个 npm 包

服务与插件在同一仓库开发，分别打包。服务包 `task-conductor` 提供 CLI 和运行依赖；插件包 `task-conductor-plugin` 仅包含宿主接入资产，没有服务运行时依赖或 npm 安装 hook。dsh SDK 声明为宿主提供的 `"*"` optional peers，不随插件安装另一份运行时。**不要用 `pi install npm:task-conductor` 安装插件。** 服务发行包不携带插件副本。

源码 marketplace 固定选择插件包版本，不跟随 npm latest。未发布源码使用[本地插件 tarball](#未发布资产的本地验收)及同一源码构建的服务。已发布资产的证据见[验证说明](validation.md#宿主接入包)。

### Pi

```bash
pi install npm:task-conductor-plugin
```

需要项目作用域时附加 `--local`。启动 Pi（已有会话先 `/reload`），调用 `/skill:using-task-conductor`。插件安装 skill、启动检查和 Pi 会话通知扩展；setup 完成后，按用户选择的作用域用原生 `pi mcp add` 注册连接，保留已有同名配置。

### dsh

将下例 `existing-profile` 换成用户已有的目标 profile，tarball 使用本地打包输出的绝对路径；不重建或重置 profile：

```bash
dsh plugin --profile existing-profile add /absolute/path/to/task-conductor-plugin-0.1.8.tgz
```

从目标项目目录启动该 profile。调用原生 `/using-task-conductor`，或由 `skill` 工具加载 `using-task-conductor`。服务缺失、setup 未完成或 MCP 连接失败时，skill 仍可发现。

插件对每个非子代理的根会话执行启动检查；通过后，在该 Agent 的作用域内创建原生 MCP stdio 连接。MCP 进程的 cwd 固定为原生会话 header 的 cwd，不使用浏览器、插件缓存或其他会话的目录。子代理不能借用父会话的 MCP 连接、目录或通知身份。在主会话使用：

```text
/task-conductor status
/task-conductor connect
```

`status` 查看连接、目录和通知归属；`connect` 重新检查并重建当前会话的连接，适用于 setup 完成、执行端注册或故障修正之后。不需要另加手工 MCP 项。缺少协调模型时可以连接查询，提交可执行任务仍需完成协调配置。通知轮询与连接由 dsh Host 会话持有，浏览器只使用原生展示，不持有收件租约或确认职责。

### Claude Code

通过清单 URL 获取索引，不克隆服务仓库：

```bash
claude plugin marketplace add https://raw.githubusercontent.com/realqiyan/task-conductor/master/.claude-plugin/marketplace.json
claude plugin install task-conductor@task-conductor --scope user
```

marketplace 的 npm 来源让宿主下载插件包。需要项目级声明时选择 `--scope project`。新会话调用 `/task-conductor:using-task-conductor`。插件已声明 MCP，不要重复 `claude mcp add`。

### Codex CLI

稀疏检出同仓的索引，然后从 npm 安装插件：

```bash
codex plugin marketplace add realqiyan/task-conductor --sparse .agents/plugins
codex plugin add task-conductor@task-conductor
```

稀疏检出避免展开整个服务源码树，但不承诺完全不下载 Git 元数据或根目录文件。也可使用本地 marketplace 索引目录，无需 Git 克隆。新会话调用 `$using-task-conductor`，或在 `/skills` 选择它。原生 onboarding 指向同一 skill；检查提醒需要先在 `/hooks` 中审查信任。

### 服务与项目边界

Claude/Codex 都由宿主通过 npm 获取插件，不是运行 `npm install -g` 后就自动注册。服务未安装或 setup 未完成时 MCP 失败是预期行为，skill 仍可使用；初始化后重开会话或在宿主 MCP 界面重连。`codex mcp list` 的静态配置不是连接成功证据。

插件调用独立服务 `task-conductor mcp`，不运行插件缓存里的服务源码。多个 workspace 的插件可共用后台；项目或 profile 作用域只控制宿主配置，不隔离服务数据。需要独立后台时显式配置不同 `--home`。安装接入资产不需要服务凭据；让模型执行 skill 需要宿主自身的模型认证。

Task Conductor 内部仍使用 pi durable 协调任务，**不要求安装交互式 Pi CLI**。dsh 作为 MCP 宿主与作为 ACP 执行端是两个入口：后者使用[自定义 ACP 注册](../plugin/skills/using-task-conductor/references/custom-acp.md#dsh-acp-执行端)，不会因安装插件自动注册。

## 未发布资产的本地验收

只安装插件资产不需要服务的 npm ci、build、link 或 setup。在仓库根目录执行需要的命令：

```bash
TASK_CONDUCTOR_SOURCE="$(pwd -P)"
pi install "$TASK_CONDUCTOR_SOURCE/plugin"

# dsh：输出目录须已存在，按输出的绝对 tarball 路径安装
node scripts/pack-plugin.mjs /absolute/artifacts
dsh plugin --profile existing-profile add /absolute/artifacts/task-conductor-plugin-0.1.8.tgz

# Claude/Codex：生成只含插件及本地索引的独立临时快照
MARKETPLACE="$(node scripts/create-plugin-marketplace.mjs)"
claude plugin marketplace add "$MARKETPLACE"
claude plugin install task-conductor@task-conductor-dev --scope user
codex plugin marketplace add "$MARKETPLACE"
codex plugin add task-conductor@task-conductor-dev
```

本地 marketplace 名为 `task-conductor-dev`；生成器不安装依赖或修改宿主配置。保留快照目录直到移除注册，修改源码后重新生成并更新注册。dsh 源码改动也须重新打包安装；已有进程重开 profile 后使用新资产。不要同时启用正式与开发插件，以免重复连接。根目录的正式 marketplace 指向 npm，不会加载尚未发布的 `plugin/` 改动。

dsh 的通知绑定还需要同一源码中的服务 stdio 支持。按[源码服务安装](deployment.md#源码与未发布接入)构建并安装服务 tarball，或设置 `TASK_CONDUCTOR_PREFLIGHT_COMMAND` 指向已构建源码的绝对 `bin/task-conductor.mjs`。只换插件而保留旧服务不能获得这一能力；同版本开发包也需完整停服、替换并重连，操作见[升级说明](upgrades.md)。

## Pi 与 dsh 任务通知

两种宿主均将后台事件送回原持久会话，忙碌时排队跟进。首次提交保存项目身份文件；关闭后恢复原会话可补读，不广播给同项目其他会话，fork 不接管原会话通知。身份、宿主差异、服务目标配置及持久化确认见[通知说明](notifications.md)。Claude/Codex 当前只有启动检查。

## 启动提醒与检查边界

Pi 在会话启动时显示通知并加入简短模型上下文；Claude Code/Codex 的同步 `SessionStart` hook 返回 `systemMessage` 和模型上下文。dsh 在根会话创建或恢复时检查，异常通过原生日志和会话 notice 给出 skill 入口。检查本身不调用模型或执行安装；dsh 检查通过后才建立 MCP，连接可按服务既有规则启动后台及准备执行端。

检查复用 `task-conductor setup --check --json`，不解析私有配置。配置有效后，限时调用 `task-conductor status --json`，查询已有后台并比较安装、launcher 和服务版本。两步共享时限且输出受限，不写配置或锁、不修复、不启动后台或模型。缺失、初始化不完整、配置异常、版本不一致和检查失败分别处理；无法启动命令也可能是 PATH 或 Node 问题。

启动检查不是持续监控或 MCP 连接验证。同版本覆盖安装不能靠版本号识别；当前会话内升级后仍须重连并核查运行版本。后台停止不等于未初始化，连接错误仍须查看宿主状态。对不支持只读检查的旧服务只报告失败，不回退到可能写锁的检查路径。

默认使用宿主 PATH 的 `task-conductor` 和默认 home。自定义时在启动宿主的环境设置：

```bash
export TASK_CONDUCTOR_PREFLIGHT_COMMAND=/absolute/bin/task-conductor
export TASK_CONDUCTOR_PREFLIGHT_HOME=/absolute/private/task-conductor
```

- **dsh**：这两个变量同时选择启动检查、原生 MCP 和通知桥接的程序/home。`TASK_CONDUCTOR_MCP_SERVER` 选择原生 MCP 名称及工具命名空间，默认 `task-conductor`。修改启动环境后重开 profile。
- **Pi**：这两个变量选择检查和通知桥接目标；MCP 仍须独立配置为同一程序/home。`TASK_CONDUCTOR_MCP_SERVER` 用于匹配已有 MCP 服务名。
- **Claude/Codex**：这两个变量只选择检查目标，不修改插件声明或手工 MCP 连接。

Codex 的 hook 须先在 `/hooks` 中审查并信任；Pi/Claude 也沿用各自原生扩展/hook 设置。禁用检查或 Node 无法启动时不能保证出现提示。Pi 的通知开关及其适用范围见[通知配置](notifications.md#配置目标)。实现入口：[preflight](../plugin/scripts/preflight.mjs)、[Pi 扩展](../plugin/pi-extension.js)、[dsh 插件](../plugin/dsh.js)、[hook](../plugin/scripts/session-start.mjs)。

## 引导如何安装与使用服务

skill 先检查已有命令、Node/npm、安装目录和连接配置，沿用用户已给出的安装与配置约定。服务缺失时通过宿主 shell 安装指定来源；已发布服务使用 `npm install -g task-conductor`，源码版本使用上述本地构建来源。PATH 问题不需要第二份安装；权限不足时给出用户终端操作，不使用 sudo 或扩大宿主权限。

交互式 `task-conductor setup` 在用户终端收集隐藏凭据；非交互初始化使用选定参数和私有凭据文件，不把秘密放入会话或命令参数。完整规则见[部署说明](deployment.md)。包内参考文件可在插件缓存或独立安装后直接使用：

- [安装与连接](../plugin/skills/using-task-conductor/references/installation.md)：setup、原生 MCP、自定义 home、升级和重连。
- [自定义 ACP](../plugin/skills/using-task-conductor/references/custom-acp.md)：管理员注册本机 stdio 执行端，包括 `dsh --profile acp`。
- [日常使用](../plugin/skills/using-task-conductor/references/tasks.md)：固定 DAG、运行与交付、事实问题及任务控制。
- [排障](../plugin/skills/using-task-conductor/references/troubleshooting.md)：安装、连接、通知和执行故障。

连接核查使用实际宿主命名空间调用 `executor_list({})`、`task_list({})`，不为安装检查创建任务。Pi 默认通过原生 codemode/tool search 发现工具；dsh 使用原生 MCP 工具。任务目录来自显式 `workspace` 或正确的 stdio cwd，不使用插件缓存。Claude/Codex 自定义连接须先禁用随包 MCP，避免两条有效连接。

## 更新与移除

接入包与服务使用同一项目版本，分别安装。正式 marketplace 固定插件版本，更新时刷新索引并使用宿主插件更新入口；未发布资产重新生成本地包。插件更新不升级服务、不执行 setup 或迁移数据。使用对应 profile/package/marketplace 更新后重开宿主。

- Pi 本地安装：`pi remove "$TASK_CONDUCTOR_SOURCE/plugin"`；npm 安装：`pi remove npm:task-conductor-plugin`。另用 `pi mcp remove task-conductor` 移除独立注册的连接。
- dsh：`dsh plugin --profile existing-profile remove task-conductor-plugin`，使用安装时的同一 profile。
- Claude Code：`claude plugin uninstall task-conductor@task-conductor`。
- Codex：`codex plugin remove task-conductor@task-conductor`。
- Claude/Codex 本地开发插件标识为 `task-conductor@task-conductor-dev`；另行移除不再使用的 marketplace 和手工 MCP 连接。

若误把服务包通过 `pi install` 注册为插件，只移除该 Pi 声明。宿主退出或卸载插件不停止已提交任务，也不删除服务、历史、工作空间或原生配置。后台管理使用同一 `--home` 的 `task-conductor status`、`stop`，先核查活动工作。

## 原生机制依据

- Pi：[packages](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/packages.md)、[MCP](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/mcp.md)。
- dsh：[CLI 与 profile](https://www.npmjs.com/package/@deepseek-ai/dsh)、[插件清单与宿主 peers](../plugin/package.json)；开发依赖及锁定版本见 [package.json](../package.json)。
- Claude Code：[marketplace](https://code.claude.com/docs/en/plugin-marketplaces)、[插件清单](https://code.claude.com/docs/en/plugins-reference)。
- Codex：[插件包与 marketplace](https://developers.openai.com/plugins/build/plugins)。使用已核验 CLI 支持的 `.codex-plugin/plugin.json`，不依赖 Claude 清单回退。
