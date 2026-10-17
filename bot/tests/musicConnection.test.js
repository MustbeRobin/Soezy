"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const music = fs.readFileSync(path.join(__dirname, "../commands/music/music.js"), "utf8");

test("recovered playback sends position and pause state with the initial play request", async () => {
  const code = music.slice(music.indexOf("async function safePlayTrack("), music.indexOf("async function musicJoinAndSetup("));
  const sandbox = { console, module: { exports: {} } };
  vm.runInNewContext(code + "\nmodule.exports = safePlayTrack;", sandbox);
  const payloads = [];
  const q = { current: { encoded: "track" }, volume: 80, recoveryPosition: 45000, recoveryPaused: true,
    player: { playTrack: async value => { payloads.push(value); }, setGlobalVolume: async () => {} } };
  assert.equal(await sandbox.module.exports(q, "guild"), true);
  assert.equal(payloads[0].position, 45000);
  assert.equal(payloads[0].paused, true);
  assert.equal(q.recoveryPosition, undefined);
  await sandbox.module.exports(q, "guild");
  assert.equal("position" in payloads[1], false);
  assert.equal("paused" in payloads[1], false);
});

function voiceFixture() {
  const code = music.slice(music.indexOf("function musicHandleVoiceClosed("), music.indexOf("function musicPlaybackFailureDetails("));
  const timers = [];
  const calls = [];
  const player = {};
  const q = { player, textChannel: { client: {} } };
  const queues = new Map([["guild", q]]);
  const sandbox = { console: { warn() {}, error() {} }, musicQueues: queues,
    getMusicRecovery: () => ({ recoverPlayer: async (...args) => { calls.push(args); } }),
    module: { exports: {} }, redactLavalinkError: String,
    setTimeout(fn) { const timer = { fn, unref() {} }; timers.push(timer); return timer; } };
  vm.runInNewContext(code + "\nmodule.exports = musicHandleVoiceClosed;", sandbox);
  return { run: sandbox.module.exports, timers, calls, player, q, queues };
}

test("duplicate voice closures schedule a single recovery", async () => {
  const f = voiceFixture();
  f.run("guild", f.player, { code: 4006 });
  f.run("guild", f.player, { code: 4006 });
  assert.equal(f.timers.length, 1);
  f.timers[0].fn();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][2].expectedQueue, f.q);
});

test("old voice closure timers cannot restart a moved or replaced player", () => {
  for (const replacement of ["player", "queue", "destroyed"]) {
    const f = voiceFixture();
    f.run("guild", f.player, {});
    if (replacement === "player") f.q.player = {};
    else if (replacement === "queue") f.queues.set("guild", { player: f.player });
    else f.q.destroyed = true;
    f.timers[0].fn();
    assert.equal(f.calls.length, 0);
  }
});

function healthFixture() {
  const source = fs.readFileSync(path.join(__dirname, "../utils/runtimeManager.js"), "utf8");
  const code = source.slice(source.indexOf("const HEALTH_TICK_MS"), source.indexOf("const nodeHealth ="));
  let now = 1000;
  const context = { module: { exports: {} }, require: () => ({ redactLavalinkError: String }),
    Date: class extends Date { static now() { return now; } } };
  vm.runInNewContext(code + "\nmodule.exports = new NodeHealthManager();", context);
  const q = { current: { encoded: "track" }, player: { node: { state: 1 }, position: 1000 } };
  return { health: context.module.exports, q, advance(ms) { now += ms; } };
}

test("health scans detect an actual stalled track but ignore paused playback", () => {
  const f = healthFixture();
  for (let i = 0; i < 4; i++) {
    assert.equal(f.health.inspectPlayer("guild", f.q).stale, false);
    f.advance(30000);
  }
  assert.equal(f.health.inspectPlayer("guild", f.q).stale, true);
  f.q.player.paused = true;
  f.advance(120000);
  assert.equal(f.health.inspectPlayer("guild", f.q).stale, false);
  f.q.player.paused = false;
  assert.equal(f.health.inspectPlayer("guild", f.q).stale, false);
  f.q.player.position += 5000;
  f.advance(120000);
  assert.equal(f.health.inspectPlayer("guild", f.q).stale, false);
});

test("node health distinguishes reconnecting states and prunes departed players", async () => {
  const f = healthFixture();
  for (const state of [0, 2, 3]) {
    f.q.player.node.state = state;
    assert.equal(f.health.inspectPlayer("guild", f.q).connected, false);
  }
  f.q.player.node.state = 1;
  assert.equal(f.health.inspectPlayer("guild", f.q).connected, true);
  f.health.music = { musicQueues: new Map(), getShoukaku: () => ({ nodes: new Map([["offline", { state: 0 }]]) }) };
  await f.health.scan();
  assert.equal(f.health.playerMarks.size, 0);
  assert.equal(f.health.nodes.get("offline").status, "state:0");
  f.health.markNode("dead", { status: "disconnected" });
  assert.equal(f.health.getHealthiestNode(), null);
});
