"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { ButtonBuilder, ButtonStyle } = require("discord.js");
const source = fs.readFileSync(path.join(__dirname, "../config/settings.js"), "utf8");
const start = source.indexOf("const EMOJIS = {");
const end = source.indexOf("\n};", start) + 3;
const emojis = vm.runInNewContext(source.slice(start, end) + "\nEMOJIS");

test("all success and failure aliases use the requested application emojis", () => {
  for (const key of ["stick", "tick", "Tick", "success", "yes", "enable", "senable", "moderation_dm_tick", "an_tick", "tick_animated"])
    assert.equal(emojis[key], "<:tick:1559236522711187577>", key);
  for (const key of ["cross", "cross_box", "scross", "error", "no", "disable", "sdisable", "an_disable", "wrong"])
    assert.equal(emojis[key], "<:scross:1559257945030525110>", key);
});

test("status emoji aliases serialize as valid custom button emojis", () => {
  for (const key of ["tick", "cross", "moderation_dm_tick", "scross"]) {
    const button = new ButtonBuilder().setCustomId(key).setLabel(key)
      .setStyle(ButtonStyle.Secondary).setEmoji(emojis[key]).toJSON();
    assert.equal(button.emoji.id, key === "tick" || key === "moderation_dm_tick" ? "1559236522711187577" : "1559257945030525110");
    assert.equal(button.emoji.animated, false);
  }
});
