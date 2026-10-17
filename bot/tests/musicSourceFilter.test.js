"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture(raw) {
  const source = fs.readFileSync(path.join(__dirname, "../commands/music/music.js"), "utf8").replace(/\r\n/g, "\n");
  const names = ["musicIsPreviewTrack", "normaliseLLResult", "lavalinkResolve", "lavalinkSearchOne", "resolveTrack"];
  const code = names.map(name => {
    const start = source.indexOf(`${["lavalinkResolve", "lavalinkSearchOne", "resolveTrack"].includes(name) ? "async " : ""}function ${name}(`);
    return source.slice(start, source.indexOf("\n}", start) + 2);
  }).join("\n");
  const queries = [];
  const context = { queries, getBestNode: () => ({ rest: { resolve: async query => { queries.push(query); return raw; } } }) };
  vm.runInNewContext(code, context);
  return context;
}

const preview = { encoded: "preview", info: { identifier: "U:https://api-v2.soundcloud.com/media/track/preview/hls", length: 197000 } };
const full = { encoded: "full", info: { identifier: "U:https://api-v2.soundcloud.com/media/track/stream/hls", length: 197000 } };

test("preview filtering covers v4 searches, direct tracks, playlists and legacy responses", () => {
  const f = fixture(null);
  for (const raw of [
    { loadType: "search", data: [preview, full] },
    { loadType: "playlist", data: { tracks: [preview, full] } },
    { loadType: "SEARCH_RESULT", tracks: [preview, full] },
  ]) {
    const result = f.normaliseLLResult(raw);
    assert.equal(result.tracks.length, 1);
    assert.equal(result.tracks[0], full);
    assert.equal(result.previewCount, 1);
    assert.equal((raw.data?.tracks || raw.data || raw.tracks).length, 2);
  }
  assert.equal(f.normaliseLLResult({ loadType: "track", data: preview }).tracks.length, 0);
});

test("direct preview links report their limitation and preview-only searches return no tracks", async () => {
  const f = fixture({ loadType: "search", data: [preview] });
  await assert.rejects(f.lavalinkResolve("https://soundcloud.com/sombrsongs/we-never-dated"), /Only a short preview/);
  for (const query of ["scsearch:sombr", "scsearch[0,30]:sombr", "ytsearch:sombr"]) {
    assert.equal((await f.lavalinkResolve(query)).tracks.length, 0);
  }
});

for (const provider of ["ytsearch", "scsearch"]) {
  for (const raw of [null, { loadType: "empty", data: {} }, { loadType: "search", data: [preview] }]) {
    test(`${provider} with ${raw?.loadType || "no response"} never searches another provider`, async () => {
      const f = fixture(raw);
      assert.equal(await f.lavalinkSearchOne("sombr we never dated", provider), null);
      assert.deepEqual(f.queries, [`${provider}:sombr we never dated`]);
    });
  }
  test(`${provider} keeps successful results on the requested provider`, async () => {
    const f = fixture({ loadType: "search", data: [full] });
    const result = await f.lavalinkSearchOne("track", provider);
    assert.equal(result.encoded, full.encoded);
    assert.equal(result.source, provider === "scsearch" ? "soundcloud" : "youtube");
    assert.deepEqual(f.queries, [`${provider}:track`]);
  });
}

for (const source of ["youtube", "soundcloud"]) {
  const url = source === "youtube" ? "https://www.youtube.com/watch?v=requested-id" : "https://soundcloud.com/requested/recording";
  test(`saved ${source} tracks resolve their exact URL without title searches`, async () => {
    const f = fixture({ loadType: "track", data: full });
    const track = { title: "Requested recording", source, url };
    assert.equal(await f.resolveTrack(track), full.encoded);
    assert.equal(track._llTrack, full);
    assert.deepEqual(f.queries, [url]);
  });
  test(`unavailable saved ${source} URLs are not replaced by search results`, async () => {
    const f = fixture({ loadType: "empty", data: {} });
    const track = { title: "Requested recording", source, url };
    await assert.rejects(f.resolveTrack(track), /No results/);
    assert.deepEqual(f.queries, [url]);
    assert.equal(track.encoded, undefined);
  });
}

test("preview-only saved URLs fail without searching for another recording", async () => {
  const f = fixture({ loadType: "track", data: preview });
  const url = "https://soundcloud.com/sombrsongs/we-never-dated";
  await assert.rejects(f.resolveTrack({ title: "we never dated", url, source: "soundcloud" }), /short preview/);
  assert.deepEqual(f.queries, [url]);
});

test("Spotify metadata and legacy tracks without URLs keep their requested search provider", async () => {
  for (const source of ["spotify", "youtube", "soundcloud"]) {
    const f = fixture({ loadType: "search", data: [full] });
    const track = { title: "Requested track", searchStr: "Artist Requested track", source };
    if (source === "spotify") track.url = "https://open.spotify.com/track/metadata";
    assert.equal(await f.resolveTrack(track), full.encoded);
    assert.deepEqual(f.queries, [`${source === "soundcloud" ? "scsearch" : "ytsearch"}:Artist Requested track`]);
  }
});

test("already encoded tracks do not cause additional lookups", async () => {
  const f = fixture(null);
  assert.equal(await f.resolveTrack({ encoded: "existing" }), "existing");
  assert.deepEqual(f.queries, []);
});
