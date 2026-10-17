"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { escapeMarkdown } = require("discord.js");

const source = fs.readFileSync(path.join(__dirname, "../commands/music/music.js"), "utf8");
const locks = source.slice(source.indexOf("const playLocks ="), source.indexOf("// \u2500\u2500 Emojis"));
const playback = source.slice(source.indexOf("function musicIsPreviewTrack("), source.indexOf("// \u2500\u2500 Utility helpers"));
const youtubeError = {
  track: { encoded: "failed-track" },
  exception: { message: "(yts.version: 1.18.2) All clients failed to load the item.\nClient [ANDROID_VR] failed: This video requires login.\n\tat java.private.Stacktrace(secret-fixture)\nClient [WEB] failed: No supported audio streams available" },
};

function fixture() {
  const timers = [];
  const sent = [];
  const logs = [];
  const played = [];
  const player = {};
  const q = {
    player, current: { title: "Test track", encoded: "failed-track" }, tracks: [],
    loop: "off", autoplay: false, guildColor: 0, history: [],
    textChannel: { send(payload) { sent.push(payload); return Promise.resolve({ delete: async () => {}, edit: async () => {} }); } },
  };
  const musicQueues = new Map([["guild", q]]);
  const context = {
    musicQueues, musicGetQueue: id => musicQueues.get(id), getMusicPrefix: () => ",",
    module: { exports: {} }, console: { error: line => logs.push(line), warn: line => logs.push(line) },
    escapeMarkdown, redactLavalinkError: error => String(error?.message || error).replaceAll("secret-fixture", "[REDACTED]"),
    createErrorContainer: (title, description) => ({ title, description }),
    MessageFlags: { IsComponentsV2: 32768 }, guildColor: 0,
    setTimeout(fn) { timers.push(fn); }, clearTimeout() {}, clearInterval() {},
    setVcStatus: async () => {}, saveQueue() {}, buildHopeYouEnjoyedContainer: () => ({}),
    isTwentyFourSevenEnabled: () => false, scheduleMusicAutoLeave() {}, clearMusicAutoLeaveTimer() {},
    safePlayTrack: async queue => { played.push(queue.current); return true; },
    resolveTrack: async track => { track.encoded = "resolved"; },
    buildNpMessagePayload: async () => ({}), fetchSyncedLyrics: async () => null,
    VC_EMOJI_SPOTIFY: "", VC_EMOJI_YOUTUBE: "", pendingLyrics: new Map(),
    lavalinkSearchOne: async () => { throw new Error("Unexpected autoplay search"); },
  };
  vm.runInNewContext(`${locks}\n${playback}\nmodule.exports = { musicIsPreviewTrack, musicPlaybackFailureDetails, musicHandlePlaybackFailure, musicPlayNext, withPlayLock, playLocks };`, context);
  return { ...context.module.exports, context, q, player, musicQueues, timers, sent, logs, played,
    async flush() { const timer = timers.shift(); assert.ok(timer); timer(); await new Promise(resolve => setImmediate(resolve)); },
  };
}

test("YouTube failures produce bounded, redacted logs and a helpful short message", () => {
  const f = fixture();
  const details = f.musicPlaybackFailureDetails(youtubeError);
  assert.equal(details.code, "YOUTUBE_LOGIN_REQUIRED");
  assert.match(details.description, /YouTube/);
  assert.doesNotMatch(details.description, /java\.|secret-fixture/);
  assert.doesNotMatch(details.summary, /java\.|secret-fixture|\n/);
  const long = f.musicPlaybackFailureDetails({ exception: { message: "secret-fixture".repeat(1000) } });
  assert.ok(long.summary.length <= 800);
  assert.doesNotMatch(long.summary, /secret-fixture/);
});

for (const loop of ["track", "queue"]) {
  test(`a failed track skips exactly once with ${loop} loop and autoplay enabled`, async () => {
    const f = fixture();
    f.q.loop = loop;
    f.q.autoplay = true;
    const pending = f.musicHandlePlaybackFailure("guild", f.player, youtubeError);
    await f.musicHandlePlaybackFailure("guild", f.player, youtubeError);
    assert.equal(f.sent.length, 1);
    assert.equal(f.logs.length, 1);
    assert.equal(f.timers.length, 1);
    assert.deepEqual(Array.from(f.sent[0].allowedMentions.parse), []);
    assert.ok(f.sent[0].components[0].description.length < 1000);
    await f.flush();
    await pending;
    assert.equal(f.q.current, null);
    assert.equal(f.q.failedTrack, null);
    assert.equal(f.q.tracks.length, 0);
    assert.equal(f.played.length, 0);
    assert.equal(f.playLocks.size, 0);
  });
}

test("failed tracks advance to the next explicit queue entry", async () => {
  const f = fixture();
  const next = { title: "Next track", encoded: "next" };
  f.q.tracks.push(next);
  const pending = f.musicHandlePlaybackFailure("guild", f.player, youtubeError);
  await f.flush();
  await pending;
  assert.equal(f.q.current, next);
  assert.equal(f.played.length, 1);
  assert.equal(f.q.failedTrack, null);
});

for (const source of ["youtube", "spotify"]) {
  for (const title of ["we never dated-sombr-X gu.m4a", "we never dated"]) {
    test(`${source} failure never substitutes another upload named ${title}`, async () => {
      const f = fixture();
      const requested = { title: "we never dated", artist: "sombr", duration: 197, source, encoded: "failed-track" };
      f.q.current = requested;
      f.q.loop = "track";
      f.q.autoplay = true;
      const next = { title: "Explicit next request", encoded: "next" };
      f.q.tracks.push(next);
      const queries = [];
      f.context.lavalinkResolve = async query => {
        queries.push(query);
        return { tracks: [{ encoded: "wrong-recording", info: { title, author: "sombr", length: 197000,
          uri: "https://soundcloud.com/gsrecords8ochenta/we-never-dated-sombr-x-gu-m4a" } }] };
      };

      const pending = f.musicHandlePlaybackFailure("guild", f.player, youtubeError);
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(queries, []);
      assert.equal(f.q.current, requested);
      assert.deepEqual(f.q.tracks, [next]);
      assert.equal(f.played.length, 0);
      assert.equal(f.sent[0].components[0].title, "Playback Error");
      await f.flush();
      await pending;
      assert.equal(f.q.current, next);
      assert.deepEqual(f.played, [next]);
      assert.deepEqual(queries, []);
    });
  }
}

test("SoundCloud previews are rejected even when metadata claims the full song duration", () => {
  const f = fixture();
  const candidate = { encoded: "sc", info: { title: "we never dated", author: "sombr", length: 196963,
    uri: "https://soundcloud.com/sombrsongs/we-never-dated", identifier: "U:https://api-v2.soundcloud.com/media/track/preview/hls" } };
  assert.equal(f.musicIsPreviewTrack(candidate), true);
  const full = { ...candidate, info: { ...candidate.info, identifier: "U:https://api-v2.soundcloud.com/media/track/stream/hls" } };
  assert.equal(f.musicIsPreviewTrack(full), false);
  assert.equal(f.musicIsPreviewTrack({ pluginInfo: { isPreview: true } }), true);
  assert.equal(f.musicIsPreviewTrack({ info: { title: "Preview of tomorrow", identifier: "regular-track" } }), false);
});

test("a queued preview cannot start or loop after a saved playlist is loaded", async () => {
  const f = fixture();
  f.q.current = null;
  f.q.loop = "track";
  f.q.tracks = [{ title: "we never dated", encoded: "preview", _llTrack: { pluginInfo: { isPreview: true } } },
    { title: "Full song", encoded: "full" }];
  await f.musicPlayNext("guild");
  assert.equal(f.played.length, 0);
  assert.match(f.sent[0].components[0].description, /short preview/);
  await f.flush();
  assert.equal(f.q.current.encoded, "full");
  assert.equal(f.played.length, 1);
});

test("late or duplicate exceptions cannot skip a newer track or replacement player", async () => {
  for (const change of ["current", "player", "destroyed"]) {
    const f = fixture();
    const pending = f.musicHandlePlaybackFailure("guild", f.player, youtubeError);
    f.q[change] = change === "destroyed" ? true : {};
    await f.flush();
    await pending;
    assert.equal(f.played.length, 0);
    assert.equal(f.sent.length, 1);
  }
  const f = fixture();
  f.q.current.encoded = "different-track";
  await f.musicHandlePlaybackFailure("guild", f.player, youtubeError);
  assert.equal(f.timers.length, 0);
  assert.equal(f.sent.length, 0);
});

test("normal repeat still repeats a successful track", async () => {
  const f = fixture();
  f.q.loop = "track";
  await f.musicPlayNext("guild");
  assert.equal(f.played[0].encoded, "failed-track");
  assert.equal(f.playLocks.size, 0);
});

for (const failure of ["resolve", "start"]) {
  test(`${failure} failures release the lock before advancing instead of deadlocking`, async () => {
    const f = fixture();
    f.q.current = null;
    f.q.tracks.push({ title: "Broken", encoded: failure === "start" ? "broken" : null }, { title: "Good", encoded: "good" });
    if (failure === "resolve") f.context.resolveTrack = async () => { throw new Error("Source unavailable"); };
    else f.context.safePlayTrack = async queue => queue.current.encoded === "good";
    await f.musicPlayNext("guild");
    assert.equal(f.playLocks.size, 0);
    assert.equal(f.timers.length, 1);
    await f.flush();
    assert.equal(f.q.current.encoded, "good");
    assert.equal(f.playLocks.size, 0);
  });
}

test("queue locks serialize overlapping advances and clear the final entry", async () => {
  const f = fixture();
  let release;
  const order = [];
  const first = f.withPlayLock("guild", async () => { order.push(1); await new Promise(resolve => { release = resolve; }); });
  const second = f.withPlayLock("guild", async () => { order.push(2); });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order, [1]);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(order, [1, 2]);
  assert.equal(f.playLocks.size, 0);
});

test("initial join and both move paths use the same playback failure handler", () => {
  assert.equal((source.match(/\.on\("exception", data => \{ void musicHandlePlaybackFailure/g) || []).length, 3);
  assert.doesNotMatch(source, /console\.error\(`\[MUSIC\] Lavalink exception/);
});
