"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture(nodes = []) {
  let now = 100_000;
  const timers = new Set();
  const intervals = [];
  const warnings = [];
  const errors = [];
  const music = { musicQueues: new Map(), getShoukaku: () => ({ nodes: new Map() }) };
  const nodeHealth = { start() {}, bindShoukaku() {}, snapshot: () => ({ nodes }),
    inspectPlayer: () => ({ stale: true, connected: true }), markPlayer() {} };
  const context = {
    module: { exports: {} },
    __soezyNodeHealth: nodeHealth,
    require(id) {
      if (id === "./lavalinkConfig") return require("../utils/lavalinkConfig");
      if (id === "./metrics") return { incMetric() {} };
      if (id === "../commands/music/music") return music;
      throw new Error(`Unexpected dependency: ${id}`);
    },
    console: { log() {}, warn: (...args) => warnings.push(args), error: (...args) => errors.push(args) },
    Date: class extends Date { static now() { return now; } },
    setTimeout(fn, delay) { const timer = { fn, delay, unref() {} }; timers.add(timer); return timer; },
    clearTimeout(timer) { timers.delete(timer); },
    setInterval(fn, delay) { const timer = { fn, delay, unref() {} }; intervals.push(timer); return timer; },
    clearInterval() {},
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../utils/musicManager.js"), "utf8"), context);
  return {
    api: context.module.exports, timers, intervals, warnings, errors, music,
    advance(ms) { now += ms; },
    async runNext() {
      const timer = timers.values().next().value;
      assert.ok(timer, "expected a pending reconnect");
      timers.delete(timer);
      now += timer.delay;
      timer.fn();
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

test("scheduled reconnect can acquire its own lock without deadlocking", async () => {
  const f = fixture();
  const manager = f.api.reconnectManager;
  let calls = 0;
  manager.schedule("node:test", () => manager.runExclusive("node:test", async () => { calls++; return { ok: true }; }));
  await f.runNext();
  assert.equal(calls, 1);
  assert.equal(manager.locks.size, 0);
  assert.equal(manager.timers.size, 0);
  assert.equal(manager.attemptCount("node:test"), 0);
});

test("repeated schedules do not overlap pending or running reconnects", async () => {
  const f = fixture();
  const manager = f.api.reconnectManager;
  let finish;
  let calls = 0;
  const reconnect = () => new Promise(resolve => { calls++; finish = resolve; });
  assert.equal(manager.schedule("node:test", reconnect), 1000);
  assert.equal(manager.schedule("node:test", reconnect), 0);
  await f.runNext();
  assert.equal(manager.schedule("node:test", reconnect), 0);
  assert.equal(calls, 1);
  finish({ ok: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(manager.timers.size, 0);
});

test("failed reconnect batches cool down once, then resume automatic retries", async () => {
  const f = fixture();
  const manager = f.api.reconnectManager;
  const fail = async () => ({ ok: false });
  for (let i = 0; i < 5; i++) {
    assert.ok(manager.schedule("node:test", fail));
    await f.runNext();
  }
  for (let i = 0; i < 10; i++) assert.equal(manager.schedule("node:test", fail), 0);
  assert.equal(f.warnings.length, 1);
  f.advance(60_000);
  assert.equal(manager.schedule("node:test", fail), 1000);
  assert.equal(manager.attemptCount("node:test"), 1);
  manager.reset("node:test");
  assert.equal(manager.cooldowns.size, 0);
  assert.equal(f.timers.size, 0);
});

test("reconnect exceptions release the scheduled slot for later retries", async () => {
  const f = fixture();
  const manager = f.api.reconnectManager;
  manager.schedule("node:test", () => manager.runExclusive("node:test", async () => { throw new Error("offline"); }));
  await f.runNext();
  assert.equal(manager.locks.size, 0);
  assert.equal(manager.timers.size, 0);
  assert.equal(f.errors.length, 1);
  assert.equal(manager.schedule("node:test", async () => ({ ok: true })), 2000);
});

test("automatic health checks retry disconnected nodes and install only once", async () => {
  const f = fixture([{ name: "offline", status: "disconnected" }, { name: "online", status: "connected" }, { name: "ready", status: "ready" }]);
  const client = {};
  f.api.installAutomaticRecovery(client, f.music);
  f.api.installAutomaticRecovery(client, f.music);
  const intervals = f.intervals.filter(timer => timer.delay === 45_000);
  assert.equal(intervals.length, 1);
  intervals[0].fn();
  assert.equal(f.api.reconnectManager.timers.size, 1);
  assert.equal(f.api.reconnectManager.timers.has("node:offline"), true);
});

test("a scheduled reconnect leaves an already recovered node connected", async () => {
  const f = fixture();
  f.music.getShoukaku = () => ({ nodes: new Map([["Wispbyte", { state: 1 }]]) });
  f.api.scheduleNodeReconnect({}, "Wispbyte");
  await f.runNext();
  assert.equal(f.api.reconnectManager.attemptCount("node:Wispbyte"), 0);
  assert.equal(f.errors.length, 0);
});

test("automatic reconnect never interrupts Shoukaku's in-flight connection", async () => {
  for (const state of [0, 2]) {
    const f = fixture();
    const node = { state, disconnect() { assert.fail("must not interrupt reconnect"); },
      connect() { assert.fail("must not start overlapping reconnect"); } };
    f.music.getShoukaku = () => ({ nodes: new Map([["Wispbyte", node]]) });
    f.api.scheduleNodeReconnect({}, "Wispbyte");
    await f.runNext();
    assert.equal(f.errors.length, 0);
    assert.equal(f.api.reconnectManager.locks.size, 0);
  }
});

function playerFixture() {
  const f = fixture();
  const node = { state: 1, name: "Wispbyte" };
  let joins = 0;
  let leaves = 0;
  const queue = {
    current: { title: "Song", encoded: "encoded" }, tracks: [{ title: "Next", encoded: "next" }],
    voiceChannelId: "voice", textChannel: { id: "text" }, volume: 80,
    player: { node, position: 43000, paused: true, removeAllListeners() {} },
  };
  f.music.musicQueues.set("guild", queue);
  f.music.musicGetQueue = id => f.music.musicQueues.get(id);
  f.music.getShoukaku = () => ({ nodes: new Map([[node.name, node]]), leaveVoiceChannel: async () => { leaves++; } });
  f.music.musicJoinAndSetup = async id => {
    assert.ok(++joins <= 2, "recovery must not revisit replacement queues");
    const q = { tracks: [], player: { node } };
    f.music.musicQueues.set(id, q);
    return q;
  };
  f.music.musicPlayNext = async id => { const q = f.music.musicGetQueue(id); q.current = q.tracks.shift(); };
  const channels = new Map([["voice", { id: "voice" }], ["text", { id: "text" }]]);
  const client = { guilds: { cache: new Map([["guild", { channels: { cache: channels } }]]) } };
  return { ...f, client, queue, node, counts: () => ({ joins, leaves }) };
}

test("a recovery scan visits each guild once even when queues are replaced", async () => {
  const f = playerFixture();
  const results = await f.api.recoverAllPlayers(f.client, { music: f.music });
  assert.equal(results.length, 1);
  assert.equal(results[0].recovered, true);
  assert.equal(f.counts().joins, 1);
  assert.equal(f.timers.size, 0, "no delayed seek against a later song");
  const q = f.music.musicGetQueue("guild");
  assert.equal(q.recoveryPosition, 43000);
  assert.equal(q.recoveryPaused, true);
  assert.equal(q.tracks[0].encoded, "next");
});

test("overlapping recovery requests share one player rebuild", async () => {
  const f = playerFixture();
  const options = { music: f.music, expectedQueue: f.queue };
  const results = await Promise.all([f.api.recoverPlayer(f.client, "guild", options), f.api.recoverPlayer(f.client, "guild", options)]);
  assert.ok(results.every(r => r.recovered));
  assert.deepEqual(f.counts(), { joins: 1, leaves: 1 });
  assert.equal(f.api.reconnectManager.locks.size, 0);
});

test("recovery skips a replaced queue and offline nodes without losing tracks", async () => {
  const f = playerFixture();
  const changed = await f.api.recoverPlayer(f.client, "guild", { music: f.music, expectedQueue: {} });
  assert.equal(changed.recovered, false);
  for (const state of [0, 2, 3]) {
    f.node.state = state;
    const result = await f.api.recoverPlayer(f.client, "guild", { music: f.music });
    assert.equal(result.recovered, false);
    assert.equal((await f.api.recoverAllPlayers(f.client, { music: f.music, onlyBroken: true })).length, 0);
  }
  assert.equal(f.music.musicGetQueue("guild"), f.queue);
  assert.deepEqual(f.counts(), { joins: 0, leaves: 0 });
});

test("failed rejoin retains the original queue for the next recovery", async () => {
  const f = playerFixture();
  f.music.musicJoinAndSetup = async () => { throw new Error("voice timeout"); };
  await assert.rejects(f.api.recoverPlayer(f.client, "guild", { music: f.music }), /voice timeout/);
  assert.equal(f.music.musicGetQueue("guild"), f.queue);
  assert.equal(f.queue.current.encoded, "encoded");
  assert.equal(f.queue.nodeDisconnected, true);
});
