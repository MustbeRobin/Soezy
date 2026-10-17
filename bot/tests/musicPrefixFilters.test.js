"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const music = require("../commands/music/music");

test("music filters reject prefix execution but retain slash routing", async () => {
  const filters = ["nightcore", "vaporwave", "slowmo", "bassboost", "treble", "pop", "rock", "jazz", "8d", "karaoke", "vibrato", "lowpass", "distortion", "mono", "normalization", "soft", "tv", "speed", "pitch", "resetfilters", "filters", "bass", "chimpunk", "china", "clearfilter", "darthvader", "daycore", "doubletime", "earrape", "electronic", "equalizer", "lofi", "party", "ratemusic", "slow", "treblebass", "tremolo"];
  for (const name of filters) {
    assert.equal(music.isMusicPrefixCommandKeyword(name), false, name);
    assert.equal(music.isMusicCommandKeyword(name), true, name);
    assert.equal(await music.handleMusicCommand(name, [], {}, ",", {}), false, name);
  }
  for (const name of ["play", "skip", "volume", "queue", "playlist", "pause", "resume"]) assert.equal(music.isMusicPrefixCommandKeyword(name), true, name);
});
