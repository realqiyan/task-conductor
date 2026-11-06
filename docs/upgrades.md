# 服务与数据升级

服务包更新使用 `task-conductor update`，不修改已有数据格式。数据格式基线为 `0.1.0`，存储结构变化通过 `task-conductor migrate` 显式转换；格式使用引入该结构的项目版本，不随每次包发布递增。

## 升级步骤

1. 核对命令路径、安装版本、`npm prefix -g` 和原有 `--home`，后续命令沿用同一命令路径与 home。`update` 只支持当前 npm 全局 prefix 对应的同一份安装；`--home` 选择已有私有安装目录，不改变 npm 安装位置。私有 home 和数据目录须位于 npm 包目录外，避免随包替换被删除。先查 `task-conductor --help` 是否列出 `update`；已发布 `0.1.4` 尚无此命令，按下文[旧版升级入口](#旧版升级入口)处理。
2. 用 `status` 和 Task/Run 查询核查活动协调、ACP 会话及待回答 Run，确认停服影响。保持宿主 MCP 断开，执行 `task-conductor stop` 确认后台停止，再安全备份 `home` 和当前 `dataDir`；待回答 Run 也可能持有 ACP 会话，停服不保证无损续接。备份含凭据与任务历史，不能读入聊天、上传或放入 Git。
3. 执行更新；自定义安装始终使用相同 `--home`，需要结构化结果时附加 `--json`：

   ```bash
   task-conductor update --home /absolute/private/task-conductor
   ```

4. 成功后在宿主重新建立 MCP stdio 连接，保留原有注册。用同一命令路径和 home 查询 `task-conductor status`，核对安装、launcher、服务版本一致且 `restartRequired=false`；实际调用 MCP `service_status` 核对 `serviceVersion`，再用 `executor_list` 或 `task_list` 验证只读连接。宿主重连入口见[安装与连接](../plugin/skills/using-task-conductor/references/installation.md#注册或重连)。

更新到 npm `latest`，完整替换 launcher 和服务进程，通过认证健康检查且运行版本与安装一致才报告成功。同版本也完整重启，后台原已停止时更新后启动。命令直接执行，不自动迁移、备份、回滚或提权，只更新服务包；实现与结果字段见 [update.mjs](../scripts/update.mjs)。`restart` 仍只重启服务子进程以应用配置，宿主 stdio 进程须通过重连替换。

失败以非零码退出并报告失败阶段，不能仅凭 npm 安装成功报告升级完成。停服异常时不安装；安装超时或中断时先结束 npm 再释放锁，保留停服状态。保持宿主断开，按错误核查；需要数据迁移或续接时按下文显式处理，重新通过 `migrate --check` 后再重连并按步骤 4 验证。缺少运行版本信息时保持未知，不从安装版本推断。

## 旧版升级入口

尚无 `update` 的版本（包括已发布 `0.1.4`）首次升级仍需手工停服、npm 安装、数据检查和重连。先完成上述路径核对、停服备份并保持宿主断开；将下例 prefix 替换为已确认的同一安装位置，home 保持原值：

```bash
npm install --global --prefix /absolute/npm-prefix --ignore-scripts task-conductor@latest
task-conductor migrate --check --home /absolute/private/task-conductor
```

每条命令成功后才继续。需要迁移或续接时按下文处理；格式检查通过后重连宿主，启动新后台并按步骤 4 核对。不要先调用旧版不存在的 `update`，也不要用另装一份、重复 setup、删除历史或重放任务修复失败。

## 离线数据迁移

检查格式使用 `task-conductor migrate --check --home /absolute/private/task-conductor`。`--check` 不写入数据，也不证明执行时已停服。检查要求迁移时，继续保持停服及宿主断开，指定安装目录及数据目录之外的新备份目录：

```bash
task-conductor migrate --home /absolute/private/task-conductor \
  --backup /absolute/private/backups/task-conductor-upgrade --yes
```

实际迁移取得安装与数据目录的排他锁，校验源数据，备份并校验副本，再修改并校验目标数据。缺表、损坏、未知格式、目录切换未完成或备份路径冲突时拒绝执行。

## 中断与恢复

迁移记录保存在安装目录的 `migration.json`。备份完成后发生中断时，普通启动拒绝使用未完成的迁移；检查原备份及目录后显式续接：

```bash
task-conductor migrate --resume --yes --home /absolute/private/task-conductor
```

续接使用已记录的备份，不覆盖备份，不重放任务、模型调用或 ACP 工作。备份未完成时，业务数据未修改；保留失败目录，另选新备份目录重试。不要删除迁移记录来绕过启动限制。

备份包含安装目录和数据目录，排除运行锁文件；目录嵌套关系保持在备份中，外置数据目录单独保存为 `data/`。备份保留配置中的原路径，不作为另一套服务直接启动。手工恢复前须停服，并保留当前数据与备份；不能将旧库、会话文件和新库混合使用。

## 支持范围

当前入口校验 `0.1.0` 数据格式，为符合该契约且缺少格式标记的数据库写入标记；已有标记且格式一致时无需转换。不修复缺失的业务表、记录或会话文件，不恢复外部执行。

实现：[迁移入口](../scripts/migrate.mjs)、[业务存储格式与校验](../src/tasks/storage/store.ts)、[协调会话校验](../src/integrations/coordinator/storage.ts)。

后续存储变更须同时提供明确的源与目标格式转换、离线备份和续接支持，以及真实旧格式数据的迁移测试。无法安全转换的变更须在发布前声明限制，不以重新初始化代替迁移。正常启动不承担格式升级，迁移也不改变任务执行授权。
