# 安装与连接 Task Conductor

## 检查与安装

按用户请求和已有约定推进安装、配置及重连；仅在缺少目标位置、配置范围或必要参数时询问。

1. 检查宿主、OS、Node/npm、已有命令和配置。服务及非 dsh 接入要求 Linux/macOS、Node.js 22.19+；dsh 要求 24.9+。使用 `node --version`、`npm --version`、`command -v task-conductor`，已找到时查询 `task-conductor --version`。
2. 核对已有自定义 `--home` 和 MCP 连接。命令不在 PATH 时检查已知安装与 `npm prefix -g`，优先使用已有绝对路径，不另装一份修复 PATH。
3. 服务缺失时，用宿主 shell 执行用户选定来源的安装。已发布版本使用 `npm install -g task-conductor`；源码版本使用下一节的本地构建。检查安装退出码和服务版本。
4. 沿用宿主原生权限。权限或网络不足时报告失败，给出同一命令供用户终端执行，不自动 sudo、更改 prefix 或放宽策略。

## 本地构建

插件与服务使用同一源码或配套本地 tarball。收到已构建的包时安装其绝对路径；从源码准备时，在仓库根目录使用 Node.js 24.9+，dsh 原生插件命令需要 PATH 中的 pnpm，输出目录须已存在：

```bash
npm ci --ignore-scripts
npm pack --pack-destination /absolute/artifacts
node scripts/pack-plugin.mjs /absolute/artifacts
npm install -g /absolute/artifacts/task-conductor-0.2.0.tgz
dsh plugin --profile existing-profile add /absolute/artifacts/task-conductor-plugin-0.2.0.tgz
```

`npm pack` 会构建服务。将 `existing-profile` 换成已有目标 profile；保留其原配置。已有服务替换先按下一节停服备份。

也可执行 `npm run build` 后直接用源码中的 `bin/task-conductor.mjs`，将其绝对路径放入 `TASK_CONDUCTOR_PREFLIGHT_COMMAND`。该变量接受可执行文件路径，不是 `node ...` 命令字符串；`TASK_CONDUCTOR_PREFLIGHT_HOME` 使用同一个 setup home。修改环境或重装插件后重开目标 profile。

服务与插件分别安装。内部 pi durable 协调不要求交互式 Pi CLI；dsh 如需作为执行端，按[自定义 ACP](custom-acp.md#dsh-acp-执行端)注册。

## 升级已有服务

已发布服务的升级按[服务与数据升级](https://github.com/realqiyan/task-conductor/blob/master/docs/upgrades.md)执行。沿用用户的升级约定，核对命令路径、npm 全局 prefix 和 `--home`；先查 `task-conductor --help` 是否支持 `update`。

支持时使用 `task-conductor update`，自定义安装附加原有 `--home`，无需额外确认或 `--yes`。执行前核查活动及待回答 Run、停服备份 home 和 dataDir，并保持宿主断开；同版本也完整重启，后台原已停止时更新后仍会启动。命令只更新服务，不更新插件或执行端。

尚无 `update` 命令的旧版，或替换为本地 tarball，走 `stop` → 同一 prefix 的 npm 安装 → 数据检查 → 重连。旧版细节见[升级入口](https://github.com/realqiyan/task-conductor/blob/master/docs/upgrades.md#旧版升级入口)。

更新后按[注册或重连](#注册或重连)刷新宿主 stdio 进程，保留原注册；核对运行版本和只读 MCP 调用。失败时保留原数据并报告失败阶段，不自动迁移、回滚或重放工作。

## 使用现有 CLI 初始化

在用户终端运行 `task-conductor setup`；自定义安装使用 `task-conductor setup --home /absolute/private/task-conductor`。向导收集目录、端口、独立服务/管理员令牌及协调 provider/model。凭据不进入聊天或命令参数，不读取私有环境文件到模型上下文，也不把宿主模型登录当作协调凭据。

非交互 setup 先读 `task-conductor setup --help`，使用用户选定参数和准备好的私有凭据文件。保留已有配置，中断初始化通过 CLI 的 `--resume` 显式续接，不删除历史。未配置协调者时可以管理，但不能接收可执行任务。

后台须发现原生 pi、codex、claude、opencode 中的一种，或已有[自定义就绪 ACP 执行端](custom-acp.md)，例如 `dsh-acp`。各执行端使用自身原生认证和工具配置；MCP 初始化会为内置执行端准备缺失的 ACP 适配器。

## 启动检查与目标

插件只读检查初始化状态和已有后台版本。安装或升级后，按下面步骤重连并核查工具。

自定义命令/home 在宿主启动环境设置：

```bash
export TASK_CONDUCTOR_PREFLIGHT_COMMAND=/absolute/bin/task-conductor
export TASK_CONDUCTOR_PREFLIGHT_HOME=/absolute/private/task-conductor
```

- dsh：两者共同选择启动检查、原生 MCP 和通知桥接。`TASK_CONDUCTOR_MCP_SERVER` 设置原生 MCP 名称及工具命名空间，默认 `task-conductor`；不再添加独立手工连接。
- Pi：两者用于检查和通知桥接，MCP 仍须单独配置为相同程序/home；`TASK_CONDUCTOR_MCP_SERVER` 匹配已有服务名。
- Claude/Codex：两者只选检查目标，MCP 另按下文配置。

修改启动环境后重开宿主。Codex hook 需要用户在 `/hooks` 审查并信任。skill 可独立加载。

## 注册或重连

使用 setup 对应的 OS 用户、原生环境与 home。stdio 自行读取服务凭据，不把令牌或端口复制到宿主配置。保留无关设置和已有连接，只保留一条有效 Task Conductor 接入。

### dsh 原生接入

从目标项目目录启动已安装插件的 profile。根会话检查通过后创建 MCP，默认 workspace 使用该会话启动目录；子代理由主会话提交任务。服务未准备时仍可调用 `/using-task-conductor` 或用 `skill` 加载引导。

```text
/task-conductor status
/task-conductor connect
```

用 `status` 核对状态与工作目录，setup、执行端注册或故障修正后用 `connect` 重连。连接由插件管理。

### Pi 1.4.0+ 原生 MCP

在目标项目目录执行：

```bash
pi mcp add --local task-conductor -- task-conductor mcp
pi mcp list
```

自定义安装改用：

```bash
pi mcp add --local task-conductor -- /absolute/bin/task-conductor mcp --home /absolute/private/task-conductor
```

默认 `--local` 写入 `.pi/mcp.json`；用户选择用户范围时省略。add 会替换同名项，因此先核对已有配置。使用 `/reload` 或新会话重载。若其他扩展替代了原生 MCP，沿用用户选择的接入，不重复注册。

### Pi 与 dsh 通知设置

Pi 通知适用于 TUI/RPC 持久会话，print、JSON 和内存会话不启用。dsh 通知属于原生根会话。首次创建任务保存项目身份文件，归属由接入层填写；模型省略 `notification`。默认 Git 项目使用仓库根目录，无 Git 使用会话 cwd；`TASK_CONDUCTOR_PROJECT_ROOT` 可指定绝对配置目录。

事件回到原会话，忙碌时排队；恢复原会话可补读，fork 不接管。dsh 模型准入失败或取消后，待用户输入、模型选择或 `/task-conductor connect` 再尝试唤醒；未确认事件保留。只支持本机服务，程序/home 对应关系见上文。`TASK_CONDUCTOR_NOTIFICATIONS=off` 当前仅 Pi 支持，dsh 不使用该开关。

### Claude Code 与 Codex 插件

插件已声明 `task-conductor mcp`，默认安装不要再手工添加。setup 后新开会话；Claude Code 也可在 `/mcp` 重连。自定义 home 或程序路径时保留技能，先禁用随包 MCP 再手工注册，不修改更新管理的插件缓存。

Claude Code 在 `/mcp` 禁用插件的 Task Conductor 服务后执行：

```bash
claude mcp add --transport stdio --scope user task-conductor -- /absolute/bin/task-conductor mcp --home /absolute/private/task-conductor
```

Codex 合并以下表，保留其他配置，再注册连接：

```toml
[plugins."task-conductor@task-conductor".mcp_servers.task-conductor]
enabled = false
```

```bash
codex mcp add task-conductor -- /absolute/bin/task-conductor mcp --home /absolute/private/task-conductor
```

重开会话，核对目标连接。GUI 宿主也须能找到 Node 和原生执行 CLI。

## 连接核查

确认实际连接并列出工具，再通过实际命名空间调用 `executor_list({})`、`task_list({})`。Pi 默认使用原生工具搜索/codemode；dsh 使用原生 MCP 工具。安装核查使用上述只读调用；创建任务前完成执行端原生认证与权限配置。

后续 CLI 使用相同 `--home`。宿主退出不停止共享后台，`stop`/`restart` 会影响活动工作，操作前核查相关 Run。
