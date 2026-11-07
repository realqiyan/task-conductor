import test from "node:test";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major > 24 || (major === 24 && minor >= 9)) await import("./dsh/integration.mjs");
else test("原生 dsh 验收", { skip: "dsh 需要 Node.js 24.9+；服务基础测试仍支持 Node.js 22.19+" }, () => {});
