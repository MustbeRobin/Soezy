"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { UpstashRestClient } = require("../utils/redis");

test("Upstash REST adapter sends authenticated Redis commands", async t => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    const command = JSON.parse(options.body)[0];
    const result = command === "PING" ? "PONG" : command === "HGETALL" ? ["field", "value"] : 1;
    return new Response(JSON.stringify({ result }), { status: 200 });
  };
  t.after(() => { global.fetch = originalFetch; });

  const redis = new UpstashRestClient("https://example.upstash.io", "test-token");
  await redis.connect();
  assert.equal(redis.isReady, true);
  assert.equal(await redis.ping(), "PONG");
  assert.deepEqual(await redis.hGetAll("data"), { field: "value" });
  assert.equal(await redis.eval("return 1", { keys: ["lock"], arguments: ["owner"] }), 1);
  assert.deepEqual(JSON.parse(requests.at(-1).options.body), ["EVAL", "return 1", 1, "lock", "owner"]);
  assert.equal(requests.at(-1).options.headers.Authorization, "Bearer test-token");
  await redis.close();
  assert.equal(redis.isReady, false);
});

test("Upstash REST adapter surfaces endpoint errors", async t => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ error: "WRITER_LOCK_LOST" }), { status: 200 });
  t.after(() => { global.fetch = originalFetch; });

  const redis = new UpstashRestClient("https://example.upstash.io", "test-token");
  await assert.rejects(redis.ping(), /WRITER_LOCK_LOST/);
});
