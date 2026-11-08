# 安装与运行

支持 Linux 和 macOS。服务及非 dsh 接入要求 Node.js **22.19+** 与 npm，dsh 要求 **24.9+**。已发布包包含运行产物，源码使用见[本地构建](#源码与未发布接入)。

## 安装与初始化

```bash
npm install -g task-conductor
task-conductor setup
```

使用当前用户可写的 npm prefix。向导确认安装目录、数据目录、端口、独立的服务与管理员令牌，以及协调模型和凭据。密钥输入不回显；取消确认不写配置。未配置协调模型时可管理服务，提交可执行任务前须完成配置。

无终端环境使用明确参数和私有凭据文件，例如文件已包含协调员密钥时：

```bash
task-conductor setup --home /absolute/private/task-conductor \
  --data-dir /absolute/private/task-conductor/data --port 8765 \
  --provider deepseek --model deepseek-flash \
  --credentials-file /absolute/private/coordinator.json \
  --generate-tokens --yes
```

此例生成独立服务与管理员令牌。使用已有令牌时由同一私有文件提供，省略 `--generate-tokens`。密钥值不放入命令参数；选项见 `task-conductor setup --help`，凭据文件约束见 [environment.ts](../src/configuration/environment.ts)。

安装目录和数据目录须属于当前用户，使用规范绝对路径及私有权限。自定义 `--home` 后，后续 CLI 和 MCP 始终使用同一路径。执行端 CLI 安装与原生登录另行完成。

## 源码与未发布接入

在仓库根目录使用 Node.js 24.9+ 构建服务，输出目录须已存在：

```bash
npm ci --ignore-scripts
npm pack --pack-destination /absolute/artifacts
npm install -g /absolute/artifacts/task-conductor-0.2.0.tgz
```

`npm pack` 会构建服务。首次安装后运行 setup；替换已有安装先按[升级流程](upgrades.md)停服备份，再在同一 prefix 安装并重连。

也可执行 `npm run build` 后直接使用 `bin/task-conductor.mjs`。插件使用同一源码[打包并安装](host-integrations.md#未发布资产的本地验收)；通过 `TASK_CONDUCTOR_PREFLIGHT_COMMAND` 指定已构建入口的绝对路径，`TASK_CONDUCTOR_PREFLIGHT_HOME` 指定 setup 的 home。各宿主配置作用域见[接入说明](host-integrations.md#启动提醒与检查边界)。

## MCP 接入与工作目录

Pi、dsh、Claude Code 和 Codex 可使用[接入包](host-integrations.md)及共享技能完成连接。其他宿主或手工配置可采用以下入口；配置位置和外层结构由宿主决定：

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

自定义安装目录时，参数改为 `["mcp", "--home", "/absolute/private/task-conductor"]`；宿主找不到命令时使用绝对路径。stdio 自动连接或启动同一 home 的共用后台，从私有文件读取服务 token，无需预先执行 `start` 或复制 token 到 MCP 配置。

创建任务时可显式提供已有绝对 `workspace`；省略时使用本次 stdio 进程的启动目录。请从目标项目目录启动宿主，或明确传入目录。直接 HTTP 调用须携带服务 token 并指定 workspace。

工作目录在任务创建时固定，后续周期运行沿用。需要换目录时暂停旧任务的未来触发，再创建新任务。创建请求按最终目录和 `requestKey` 去重；契约见 [task-contract.ts](../src/protocol/task-contract.ts)，原因见[目录来源](adr/0002-mcp-workspace-source.md)和[请求去重](adr/0001-task-request-scope.md)。

## 执行端发现与准备

MCP 初始化时，后台从自身 PATH 检测 pi、codex、claude 和 opencode，并为缺少适配器的执行端安装最新版；已有适配器复用，OpenCode 使用原生 ACP。没有内置 CLI 或就绪的自定义执行端时，先通过 CLI/Web 准备执行端，再重连 MCP。

安装与认证使用执行端官方工具：[Pi](https://github.com/earendil-works/pi/tree/v1.3.0/packages/coding-agent/docs)、[Codex](https://github.com/openai/codex)、[Claude Code](https://code.claude.com/docs/en/overview)、[OpenCode](https://opencode.ai/docs/)。dsh 等本机 stdio ACP 通过[自定义注册](cli.md#自定义本机-acp-接入)即时接入；dsh 使用 `dsh-acp` ID 和 `dsh --profile acp`，完整示例见[操作说明](../plugin/skills/using-task-conductor/references/custom-acp.md#dsh-acp-执行端)。

用 MCP `executor_list`、`task-conductor executor list` 或 Web 查看准备结果，任务只选择就绪执行端。适配器安装在 home 的私有 `adapters/` 中；失败后修正原因，再显式刷新或升级：

```bash
task-conductor executor refresh
task-conductor executor upgrade codex --yes
```

升级期间暂停向该执行端派发新工作，活动进程继续运行；安装成功前保留旧适配器。OpenCode 通过原生 CLI 渠道更新。

后台环境来自启动它的进程。新 CLI 位于已有 PATH 时刷新即可；PATH 或原生配置环境改变时，核查活动工作后停止后台，再从目标环境启动。原生登录须与后台使用同一 OS 用户及 HOME/配置目录。

就绪表示启动依赖已准备。使用前须完成执行端原生认证和无人值守授权；额外 ACP 审批请求会被拒绝。执行端继承过滤后的用户原生环境，服务令牌和协调凭据会被排除，因此执行端凭据应放在其原生配置中。该部署以同一 OS 用户为信任范围，日志和 Agent 输出按敏感数据保护。

## 后台、前台与健康检查

```bash
task-conductor status
task-conductor restart
task-conductor stop
# 前台运行：
task-conductor start
```

MCP 宿主退出后，共享后台继续调度任务。`stop` 关闭后台和活动执行；`start` 在前台运行，Ctrl-C 关闭它。系统关机、用户进程被清理或后台故障后需重新启动，本项目未配置开机自启。重新启动时，已中断或结果不明的执行保持阻断，须先核查外部结果。

`restart` 应用已保存配置，新实例通过认证健康检查后返回地址。重启会关闭 ACP 会话，可能中断待回答 Run，操作前请核查活动工作。请求超时先用 `status` 查询当前实例；端口变化以返回地址为准。

服务包更新使用 `task-conductor update`，见[升级说明](upgrades.md)。`status` 显示安装、launcher 和服务版本及是否需要重启；MCP `service_status` 显示后台版本。

后台不可用时，查看 home 的 `launcher.log` 和当前 dataDir 的 `service.log`。修正配置后显式重启；启动器已退出时重新连接 MCP 或运行 `start`。

## 数据目录与管理

当前 dataDir 保存配置、私有环境、自定义 ACP 注册、任务与协调会话、结果和服务日志。home 保存定位文件、初始化记录、适配器及启动器资源。npm 包目录、任务工作目录和执行端原生配置分别管理。

Web 位于 `status` 返回地址的 `/admin/`，连接与配置保存见[控制台说明](web-console.md)，命令行操作见 [CLI](cli.md)。

切换 dataDir 后，下次启动使用目标目录；旧任务、会话、结果、注册和日志留在原目录。目标已有不同启动文件时须停服核对并显式准备，服务会拒绝覆盖。

`task-conductor setup --check --json` 只读检查初始化状态，自定义安装附加相同 `--home`。重复 setup 保留已有配置；初始化中断使用 `setup --resume` 续接。缺少凭据或所有权不明时先核查。数据格式不受支持或损坏时保留原数据，按[离线迁移](upgrades.md#离线数据迁移)处理。
