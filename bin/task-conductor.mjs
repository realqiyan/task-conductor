#!/usr/bin/env node
import { readFileSync } from "node:fs";

const help = `用法：task-conductor <命令>
  setup [选项]              交互式初始化；参数见 setup --help
  update [选项]             更新 npm 安装并完整重启后台；参数见 update --help
  migrate [选项]            离线数据升级、备份与续接；参数见 migrate --help
  mcp [选项]               建立 MCP stdio 连接；参数见 mcp --help
  start [--home 目录]       在前台运行服务
  stop [--home 目录]        停止共享后台
  restart [--home 目录]     重启服务运行进程并检查就绪状态
  status [--home 目录]      查看健康状态、活动工作、版本及待生效配置
  console token            显示 Web 控制台管理员令牌
  config                   查看、编辑、校验和保存配置
  executor                 发现执行端、升级适配器及管理启用状态
  coordinator              配置协调模型
  credential               列出、替换或删除私有凭据
  task                     查询任务并控制未来触发
  run                      查询运行历史与交付
  notifications            插件通知桥接，从 stdin 接收 JSON，不启动后台
  <命令> --help            查看命令用法；管理命令支持 --json
  --version | --help
要求 Node.js 22.19+；支持 Linux 和 macOS。`;
try {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 19)) throw new Error("需要 Node.js 22.19 或更高版本");
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "help") {
    console.log(help);
  } else if (command === "--version") {
    console.log(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);
  } else if (["setup", "migrate", "update"].includes(command)) {
    process.argv = [process.execPath, command, ...args];
    await import(`../scripts/${command}.mjs`);
  } else {
    const lib = await import("../scripts/install-lib.mjs");
    if (command === "notifications") {
      if (args.includes("--help")) console.log("用法：task-conductor notifications [--home 绝对目录]；stdin 提供 poll/ack/release JSON，只访问已有后台。");
      else {
        const options = lib.argumentsFor(args);
        if (Object.keys(options).some(key => key !== "home")) throw new Error("通知桥接只接受 --home");
        try {
          const { runNotifications } = await import("../dist/application/notification-entry.js");
          await runNotifications(lib.installRoot(options));
        } catch { throw new Error("通知桥接不可用；未确认事件保留，请检查服务状态和版本。"); }
      }
    } else if (["start", "mcp", "stop"].includes(command)) {
      if (args.includes("--help")) { console.log("用法：task-conductor " + command + " [--home 绝对目录]" + (command === "stop" ? " [--json]" : command === "mcp" ? " [--notification-file 绝对文件路径]" : "")); }
      else {
        const options = {};
        for (let index = 0; index < args.length; index++) {
          const arg = args[index], key = arg.replace(/^--/, "");
          if (Object.hasOwn(options, key)) throw new Error("重复选项：" + arg);
          if (command === "stop" && arg === "--json") options.json = true;
          else if (arg === "--home" || (command === "mcp" && arg === "--notification-file")) {
            const value = args[++index];
            if (!value || value.startsWith("--")) throw new Error(arg + " 缺少值");
            options[key] = value;
          } else throw new Error("此命令不支持该选项");
        }
        const json = options.json === true;
        const root = lib.installRoot(options);
        if (command === "mcp") {
          const { runMcp } = await import("../dist/application/mcp-entry.js");
          await runMcp(root, options["notification-file"]);
        } else if (command === "stop") {
          const { controlService } = await import("../dist/integrations/local-service/control.js");
          console.log(JSON.stringify({ event: "stopped", ...await controlService(root, "stop") }, null, json ? undefined : 2));
        } else {
          process.argv = [process.execPath, "service-runner", root];
          await import("../scripts/service-runner.mjs");
        }
      }
    } else {
      const { runCli } = await import("../dist/protocol/cli/commands.js");
      await runCli(command, args, home => lib.installRoot({ home }));
    }
  }
} catch (error) {
  const message = process.argv[2] === "mcp"
    ? error.message + "\n安装、初始化或连接排障请使用 using-task-conductor：Pi /skill:using-task-conductor；dsh /using-task-conductor；Claude Code /task-conductor:using-task-conductor；Codex $using-task-conductor。先核查原因，不自动重装或重放工作。"
    : error.message;
  console.error(process.argv.includes("--json") ? JSON.stringify({ error: message }) : message);
  process.exitCode = 1;
}
