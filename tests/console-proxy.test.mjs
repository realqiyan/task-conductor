import test from "node:test";
import assert from "node:assert/strict";
import { consoleOrigin } from "../plugin/scripts/console-proxy.mjs";

test("控制台代理只接受本机管理员地址", () => {
  assert.equal(consoleOrigin("http://127.0.0.1:8765/admin/"), "http://127.0.0.1:8765");
  assert.equal(consoleOrigin("http://127.0.0.1:8765/admin"), "http://127.0.0.1:8765");
  for (const value of ["https://127.0.0.1:8765/admin/", "http://localhost:8765/admin/", "http://10.0.0.1:8765/admin/",
    "http://user:pass@127.0.0.1:8765/admin/", "http://127.0.0.1:8765/other", "http://127.0.0.1:8765/admin/?x=1",
    "not a url"]) {
    assert.throws(() => consoleOrigin(value), /控制台地址/, value);
  }
});
