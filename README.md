# Task Conductor

English | [简体中文](README.zh-CN.md)

A standalone service for persistent, agent-driven tasks: **MCP manages tasks, a pi durable coordinator advances a caller-defined DAG, and ACP executors perform the work.**

The caller defines the plan and assigns an executor to each node. The coordinator uses judgment and persistent memory to clarify requirements, review deliveries, and decide whether the overall goal is complete. It does not split tasks or change the plan.

**Research-stage software.** Not production-ready or intended for unattended trading.

## Quick start

Requires **Linux or macOS, Node.js 22.19+, and npm**. Using dsh requires **Node.js 24.9+**. Published packages include built runtime files.

1. Install at least one native executor CLI (Pi, Codex, Claude Code, or OpenCode) and configure its native authentication and permissions. Administrators can also [register a local stdio ACP executor](docs/cli.md#自定义本机-acp-接入).
2. Install and configure the service, including its coordinator model and credentials:

   ```bash
   npm install -g task-conductor
   task-conductor setup
   ```

3. Add the stdio server to your MCP host. For hosts that use `mcpServers`:

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

   The configuration location and outer structure depend on the host. Use an absolute command path if the host cannot find it. For a custom installation home, use `["mcp", "--home", "/absolute/private/task-conductor"]`.

4. Connect the host. The MCP entry starts or reuses a separate background service; no prior `start` command is needed. Check its state with:

   ```bash
   task-conductor status
   ```

The background service continues after the host disconnects. See [deployment](docs/deployment.md) for executor preparation and service management.

The [host integration package](docs/host-integrations.md) provides the `using-task-conductor` guide for Pi, dsh, Claude Code, and Codex, with setup and connection instructions for each host. Pi and dsh also receive task notifications in the original session.

## How tasks work

- Submit a fixed DAG with `task_create`, assigning a ready local ACP executor to each node. Single-node and multi-node tasks use the same API. Immediate, scheduled, and Cron execution are supported.
- Each Task retains one durable coordination conversation; each Run records a separate execution admission and its results.
- Accepted executor deliveries unlock dependencies; the coordinator explicitly decides when the overall goal is complete.
- Ordinary discussion does not start idle ACP work or answer a pending question. Additional work requires explicit intent; accepted deliveries and terminal Runs remain immutable.
- Supply an existing absolute `workspace`, or let the stdio entry supply its launch directory. Direct HTTP callers must provide it. The directory is fixed when the task is created.

The [task contract](src/protocol/task-contract.ts), [MCP tools](src/protocol/mcp.ts), and [conversation design](docs/task-conversation-plan.md) define the detailed interfaces.

## Operations and safety

```bash
task-conductor status
task-conductor restart   # Apply saved configuration and check the new instance
task-conductor stop     # Stop the background service and active execution
task-conductor --help
```

The local [Web console](docs/web-console.md) is available at `/admin/` on the address reported by `status`. It uses a separate administrator token. The [CLI](docs/cli.md) provides the same management operations.

- Configure each executor's native authorization for unattended work. Additional ACP approval requests are rejected.
- Interrupted or uncertain external work blocks new dispatch. The service does not automatically retry, replay side effects, or switch executors.
- Restarting closes ACP sessions and may interrupt Runs awaiting input. Check active Runs before restarting.
- Use `task-conductor update` to update the service package and replace both the launcher and service process. Follow the [upgrade procedure](docs/upgrades.md) for backups, MCP reconnection, and older CLI versions. Data migration remains a separate offline operation.
- The service trusts the local OS user. Protect logs and agent output as sensitive data.

## Documentation

Detailed operational and design documents are currently in **Chinese**. The English and Chinese READMEs provide the repository overview; CLI output and built-in guidance are also currently Chinese.

| Topic | Guide |
| --- | --- |
| Installation, authentication, and background service | [Deployment](docs/deployment.md) |
| Package updates, data checks, and offline migration | [Upgrades](docs/upgrades.md) |
| Pi, dsh, Claude Code, and Codex integration | [Host integrations](docs/host-integrations.md) |
| Local console and configuration | [Web console](docs/web-console.md) |
| CLI configuration, credentials, tasks, and Runs | [CLI](docs/cli.md) |
| Product goals and architecture decisions | [Design proposal](docs/design-proposal.md) |
| Pi and dsh session notifications | [Notifications](docs/notifications.md) |
| Task conversations, memory, and additional work | [Conversation design](docs/task-conversation-plan.md) |
| Terminology | [Glossary](CONTEXT.md) |
| Implementation and test navigation | [Technical design](docs/technical-design.md) |
| Prompts, tool descriptions, skills, and context loading | [Model instruction guidelines](docs/model-instruction-guidelines.md) |
| Package validation and controlled npm releases | [Release guide](docs/release.md) |
| Contributing | [Development guide](AGENTS.md), [architecture guidelines](docs/architecture-guidelines.md) |

Documentation explains goals, usage, and constraints. Source contracts remain authoritative for fields, defaults, and state transitions.

## Development

Use Node.js **24.9+** for development and dsh integration tests. Dependency versions are defined in [package.json](package.json).

```bash
npm ci --ignore-scripts
npm run check
npm test
git diff --check
```

Tests use real local files, SQLite, processes, and SDKs. Real-model test requirements and entry points are in the [development guide](docs/technical-design.md#集成与验收入口).

## License

[MIT](LICENSE), Copyright (c) 2026 realqiyan. Dependencies and executors retain their own licenses.
