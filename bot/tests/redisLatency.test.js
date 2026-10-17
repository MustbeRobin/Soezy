"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { createRequire } = require("node:module");
const redisSource = fs.readFileSync(path.join(__dirname, "../utils/redis.js"), "utf8");

function fixture() {
  let clients = 0;
  let calls = 0;
  let signal;
  const client = Object.assign(new EventEmitter(), {
    isReady: true,
    withCommandOptions(options) { signal = options.abortSignal; return this; },
    ping() { calls++; return Promise.resolve("PONG"); },
  });
  const context = {
    module: { exports: {} }, process, setTimeout, clearTimeout, AbortController,
    console: { log() {} },
    require(name) {
      if (name === "redis") return { createClient() { clients++; return client; } };
      if (name === "node:events") return { EventEmitter };
      if (name === "../config.json") return { redis: { host: "127.0.0.1" } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(redisSource, context);
  return { api: context.module.exports, client, clients: () => clients, calls: () => calls, signal: () => signal };
}

test("latency uses the ready shared client without a global alias or new connection", async () => {
  const f = fixture();
  assert.equal(await f.api.getRedisLatency(), null);
  assert.equal(f.clients(), 0);
  assert.equal(f.api.getRedisClient(), f.client);
  const values = await Promise.all(Array.from({ length: 20 }, () => f.api.getRedisLatency()));
  assert.ok(values.every(value => Number.isFinite(value) && value >= 0));
  assert.equal(f.clients(), 1);
  assert.equal(f.calls(), 1);
});

test("latency handles outages, errors, bounded deadlines and recovery", async () => {
  const f = fixture();
  f.api.getRedisClient();
  f.client.isReady = false;
  assert.equal(await f.api.getRedisLatency(), null);
  f.client.isReady = true;
  f.client.ping = async () => { throw new Error("fixture-private-error"); };
  assert.equal(await f.api.getRedisLatency(), null);
  await new Promise(resolve => setImmediate(resolve));
  let release;
  let stalledCalls = 0;
  f.client.ping = () => { stalledCalls++; return new Promise(resolve => { release = resolve; }); };
  assert.equal(await f.api.getRedisLatency(20), null);
  assert.equal(f.signal().aborted, true);
  assert.equal(await f.api.getRedisLatency(20), null);
  assert.equal(stalledCalls, 1);
  release("PONG");
  await new Promise(resolve => setImmediate(resolve));
  f.client.ping = async () => "PONG";
  assert.ok(Number.isFinite(await f.api.getRedisLatency()));
});

test("actual slash ping reads the Redis module across the VM boundary", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../commands/music/music.js"), "utf8");
  const rootRequire = createRequire(path.join(__dirname, "../commands/music/music.js"));
  const context = {
    module: { exports: {} }, process, console, Buffer, setTimeout, clearTimeout, setInterval, clearInterval,
    require(name) {
      if (name === "../../utils/redis") return { getRedisLatency: async () => 12.34 };
      return rootRequire(name);
    },
  };
  vm.runInNewContext(source, context);
  let payload;
  const msg = {
    guild: { id: "123" }, member: {}, channel: { id: "456" }, author: { id: "789" },
    client: { ws: { ping: -1 }, _db: {} }, _isSlashCommand: true,
    async reply(value) { payload = value; },
  };
  await context.module.exports.handleMusicCommand("ping", [], msg, "/", {});
  const output = JSON.stringify(payload.components[0].toJSON());
  assert.match(output, /12\.34ms/);
  assert.match(output, /Waiting for heartbeat/);
  assert.doesNotMatch(output, /Unavailable|-1ms/);
});
