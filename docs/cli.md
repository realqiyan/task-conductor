# 本机管理 CLI

CLI 提供配置、凭据、执行端管理、任务查询、未来触发控制及重启操作，与 Web 共用管理能力。

## 连接与命令

先按[部署说明](deployment.md)安装并启动服务。CLI 通过安装目录定位当前实例，从私有环境文件读取管理员令牌，不需要复制令牌或登录命令。使用自定义安装目录时，每条命令都传入 `--home /absolute/installation`。

```bash
task-conductor --help
task-conductor console --help
task-conductor config --help
task-conductor executor --help
task-conductor coordinator --help
task-conductor credential --help
task-conductor task --help
task-conductor run --help
```

逐级帮助提供完整参数。管理命令支持 `--json`，结果写入 stdout，预览和诊断写入 stderr；失败退出码非零。非交互保存、适配器升级与任务变更须使用 `--yes`。

`console token` 无需启动服务，用法见[控制台说明](web-console.md#启用与连接)。其他管理命令需要服务运行；初始化和排障见[部署说明](deployment.md)。

服务更新使用 `task-conductor update`，配置生效使用 `restart`，离线数据迁移使用 `migrate`。支持范围、备份、重连和失败处理见[升级说明](upgrades.md)。

## 配置流程

交互编辑可用 `task-conductor config edit`。编辑器由 `--editor`、`VISUAL` 或 `EDITOR` 指定，值须是可执行文件名或路径，不包含 shell 参数。退出编辑器后先校验并显示影响，再确认保存。

批量编辑使用配置草稿：

```bash
task-conductor config export --output /absolute/private/draft.json
# 编辑草稿中的配置，保留编辑令牌。
task-conductor config validate --file /absolute/private/draft.json
task-conductor config apply --file /absolute/private/draft.json --yes
task-conductor config diff
task-conductor restart
task-conductor config show --running
```

导出文件不包含密钥值，以私有权限创建，拒绝覆盖已有文件。编辑令牌过期、服务重启或任一客户端保存配置/凭据后，旧草稿不能提交；重新读取并人工核对，不自动合并。草稿契约见 [settings-contract.ts](../src/protocol/settings-contract.ts)。

`executor enable/disable` 和 `coordinator` 提供便捷配置操作，均经预览、校验和保存后在下次启动生效。已有任务保持原执行端指派。凭据保存顺序和重启影响见[控制台说明](web-console.md#保存与重启)。

## 执行端发现与更新

```bash
task-conductor executor list
task-conductor executor show codex
task-conductor executor refresh
# 仅在需要升级适配器时执行：
task-conductor executor upgrade codex --yes
task-conductor executor list
```

发现、适配器升级、PATH 变更与原生认证见[部署说明](deployment.md#执行端发现与准备)。

## 自定义本机 ACP 接入

管理员可注册由服务启动的本机 stdio ACP 程序，MCP 调用方通过 ID 选择执行端。注册授权服务启动本机代码，需先准备其原生认证与无人值守权限。

准备不含密钥的私有注册文件，格式与 dsh 示例见[注册引导](../plugin/skills/using-task-conductor/references/custom-acp.md)。确认 `task-conductor executor --help` 提供注册命令后执行：

```bash
task-conductor executor register --file /absolute/private/my-acp.json --yes
task-conductor executor show my-acp
# 经确认不再用于后续派发时：
task-conductor executor unregister my-acp --yes
```

管理服务须已运行；需要时在另一终端执行 `task-conductor start`。命令使用规范绝对路径和参数数组，可选 `cwd` 设置进程启动目录，任务 workspace 保持不变。执行端使用后台的原生环境，环境变化按[部署说明](deployment.md#执行端发现与准备)处理。

**注册和注销持久化后立即生效。** 注册校验本地启动条件；无执行端导致 MCP 连接失败时，注册后重连。注册随当前 dataDir 保存。

同名注册拒绝覆盖；变更启动方式使用新 ID，由后续任务选择。注销阻止新派发，活动进程与历史保留。旧任务保持原命令、参数和 cwd 快照，重新注册同名 ID 也须匹配。结果不明时先查询状态。

## 凭据与任务

`credential set NAME` 使用隐藏终端输入；自动化通过 `--stdin --yes` 从可信凭据工具或受保护文件传值，不把值写进命令参数。`credential list` 只显示设置状态。执行端原生登录和权限继续由其官方工具管理。

`task show ID` 查看任务配置，`run show ID` 查看执行记录，`task update ID` 修改基础配置及未来触发。更新范围见[控制台说明](web-console.md#操作范围)，字段契约见 [taskUpdateSchema](../src/protocol/task-contract.ts)。

更新文件包含 `expected` 和要修改的字段。`expected` 按上述契约从 `task show ID --json` 的结果填写，其中 `nextAt` 的毫秒数需转为 UTC ISO 时间，null 保持原值；文件不包含 `taskId`。然后执行：

```bash
task-conductor task update ID --file /absolute/private/task-update.json --yes
```

更新冲突或结果不明时，用 `task show ID` 查看当前配置。
