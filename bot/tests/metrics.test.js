"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../utils/metrics.js"), "utf8");

for (const runtimeFirst of [true, false]) {
  test(`metrics share one timer and counters across VM/CommonJS (runtime first: ${runtimeFirst})`, () => {
    const timers = [];
    const logs = [];
    const process = { memoryUsage: () => ({ rss: 1048576, heapUsed: 0, heapTotal: 0, external: 0, arrayBuffers: 0 }) };
    function load(runtime) {
      const context = {
        process, module: { exports: {} }, console: { log: line => logs.push(line) },
        setInterval(fn, delay) { const timer = { fn, delay, unref() {} }; timers.push(timer); return timer; },
      };
      if (runtime) context.__soezyLoadingRuntimeFile = "utils/metrics.js";
      vm.runInNewContext(source, context);
      context.__soezyLoadingRuntimeFile = null;
      return context;
    }
    const first = load(runtimeFirst);
    const second = load(!runtimeFirst);
    const runtime = runtimeFirst ? first : second;
    const commonjs = runtimeFirst ? second : first;
    runtime.client = { guilds: { cache: { size: 83 } }, listenerCount: event => event === "raw" ? 1 : 0 };
    runtime.__soezyBlacklistCache = { guilds: { size: 103 } };
    runtime.soezySecurity = { getRuntimeSizes: () => ({ bans: 2 }) };
    first.incMetric("events", "test", 1);
    second.incMetric("events", "test", 2);
    assert.equal(first.soezyMetrics, second.soezyMetrics);
    assert.equal(first.__soezyMetricsInterval, second.__soezyMetricsInterval);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delay, 60000);
    assert.equal(commonjs.getSoezyMetricsSnapshot().events.test, 3);
    assert.equal(commonjs.getSoezyMetricsSnapshot().caches.security.bans, 2);
    timers[0].fn();
    assert.equal(logs.length, 1);
    assert.match(logs[0], /guilds=83 /);
    assert.match(logs[0], /rawListeners=1 /);
    assert.match(logs[0], /"blacklistGuilds":103/);
    for (let i = 0; i < 2500; i++) commonjs.incMetric("events", `event-${i}`);
    assert.equal(commonjs.soezyMetrics.events.size, 2001);
  });
}
