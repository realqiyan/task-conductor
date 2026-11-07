# 接入自定义本机 ACP 执行端

使用管理员 CLI 注册用户选定的本机程序。MCP 只能查询并选择就绪 ID，不能注册命令、凭据或端点；Web 复用同一管理服务。沿用用户的注册请求和已有约定，不重复要求批准已确定的操作。

## 准备

1. 核对本机 stdio ACP 可执行文件和非敏感参数。服务为每个节点会话启动并持有该进程；这里不接入 HTTP/WebSocket 地址或已运行的远程服务。
2. 查看 `task-conductor executor --help` 是否提供 register/unregister；旧服务缺少命令时按[升级说明](installation.md#升级已有服务)处理。
3. 用同一 `--home` 的 `task-conductor status` 核查后台。注册要求后台运行且有管理员访问；未运行时在另一终端或宿主后台进程设施运行 `task-conductor start`，无需先安装内置执行端。
4. 按执行端原生方式准备模型、认证和无人值守工具配置。凭据不放在聊天、启动参数或服务私有环境文件中；额外 ACP 权限审批会被服务拒绝。

程序须通过 stdin/stdout 使用 ACP、诊断写 stderr，并支持 initialize/session/prompt 流程。不假设服务提供客户端终端或交互登录。

## 注册

准备不含秘密的私有 JSON 文件，例如：

```json
{
  "id": "my-acp",
  "command": "/absolute/canonical/path/to/my-acp",
  "args": ["--stdio"],
  "cwd": "/absolute/canonical/path/to/agent-runtime"
}
```

command 使用已有可执行文件的规范绝对路径；解析符号链接不运行该程序。args 采用程序实际支持的参数，不需要 `--stdio` 时使用 `[]`。cwd 可省略，默认任务工作目录；显式值须为已有规范绝对目录，只改变进程启动目录，ACP `session/new` 仍使用任务 workspace。相对脚本或配置参数会受 cwd 影响，必要时用绝对路径。注册不进行 shell 展开，不覆盖内置 ID 或已有注册。

```bash
task-conductor executor register --file /absolute/private/my-acp.json --yes
task-conductor executor show my-acp
```

自定义安装的每条命令附加原有 `--home`。`--yes` 用于非交互注册。服务先持久化再开放派发，不启动 ACP、探测模型或提交任务。注册立即可见，无需重启，不打断活动会话或改写任务指派；同数据目录重启后保留，切换数据目录不复制注册。

执行端继承后台过滤后的原生环境，不是执行注册命令的终端环境。若要改变 PATH、HOME 或原生配置环境，核查活动工作后停止后台，再从目标环境启动；刷新和注册不会导入新终端变量。

## dsh ACP 执行端

使用 **Node.js 24.9+** 和 dsh 原生 ACP profile。安装 dsh 时遵循其当前发布说明；Task Conductor 仓库开发基线固定为 `0.2.2-rc.1`，不要求用户安装同一精确版本。dsh 自身的模型、工具、认证和 `acp` profile 须在后台所用 OS 用户及环境下准备。

注册 ID 采用 `dsh-acp`，command 替换为已安装 `dsh` 可执行文件解析符号链接后的规范绝对路径：

```json
{
  "id": "dsh-acp",
  "command": "/absolute/canonical/path/to/dsh",
  "args": ["--profile", "acp"]
}
```

```bash
task-conductor executor register --file /absolute/private/dsh-acp.json --yes
task-conductor executor show dsh-acp
```

这里使用原生 **`dsh --profile acp`**，没有额外适配器包或单独的 ACP 可执行命令。不注册为内置执行端，也不保留 `dsh` ID。Task Conductor 宿主插件和此 ACP 入口独立；无需为了执行任务把宿主插件安装到 `acp` profile。内部协调仍使用服务的 pi durable 及协调模型配置，不要求交互式 Pi CLI，不把宿主模型或协调凭据导入 dsh 执行端。

## 查询和使用

用 `task-conductor executor list` 核对 ID，再通过实际 MCP `executor_list({})` 查询。如果此前因无执行端而连接失败，重连 MCP；dsh 主会话使用 `/task-conductor connect`。之后按[任务使用](tasks.md)在节点中选择 `executorId`，例如 `dsh-acp`。

ready 只说明本机启动准备完成，不证明 ACP/模型任务成功；注册检查不需要提交试验任务。

## 移除或更改

注册不原地覆盖。新启动配置使用新 ID，由后续任务显式选择。先核查受影响任务，再按用户的移除请求执行：

```bash
task-conductor executor unregister my-acp --yes
```

注销即时生效，不需重启，阻止后续通过该 ID 派发；不终止活动进程、删除历史或改变已有快照。同一 ID 换用不同 command、args 或 cwd 不会重绑旧任务。响应丢失时先查询状态，不删除注册文件、历史或工作目录修复不确定结果。
