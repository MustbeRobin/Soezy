"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("AutoMod registers config and the merged message limit with runtime owner checks", () => {
  const json = require("../commands/config/automod").data.toJSON();
  assert.deepEqual(json.options.map(option => [option.name, option.type]), [["message-limit", 1], ["config", 1]]);
  assert.equal(json.default_member_permissions, undefined);
});

test("AutoMod has one registered slash command and one guarded message dispatcher", () => {
  const collection = require("../commands/registry").loadCommandCollection();
  assert.equal([...collection.keys()].filter(name => name === "automod").length, 1);
  assert.deepEqual(collection.get("automod").data.toJSON().options.map(option => option.name).sort(), ["config", "message-limit"]);

  const fs = require("node:fs");
  const path = require("node:path");
  const messageSource = fs.readFileSync(path.join(__dirname, "../events/messageCreate.js"), "utf8");
  assert.equal((messageSource.match(/client\.on\("messageCreate"/g) || []).length, 1);
  assert.match(messageSource, /__soezyMsgEventsLoaded/);
  assert.match(messageSource, /\}, "guild-main"\)/);

  const runtimeSource = fs.readFileSync(path.join(__dirname, "../utils/runtimeManager.js"), "utf8");
  assert.doesNotMatch(runtimeSource, /^\s*"antispam":/m);
});

test("stale AutoMod slash subcommands cannot mutate settings", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../events/interactionCreate.js"), "utf8");
  const start = source.indexOf('          if (sub !== "config" || subGroup)');
  assert.ok(start > source.indexOf('// ========== AUTOMOD CONFIG =========='));
  const block = source.slice(start, source.indexOf('          const gId = interaction.guildId;', start));
  for (const [sub, subGroup, rejected] of [["setup", null, true], ["reset", null, true], ["enable", "rule", true], ["config", null, false]]) {
    let reply;
    await vm.runInNewContext(`(async () => { ${block} })()`, { sub, subGroup,
      createInfoContainer: (title, description) => ({ title, description }), MessageFlags: { IsComponentsV2: 32768 },
      interaction: { reply: async payload => { reply = payload; } } });
    assert.equal(Boolean(reply), rejected);
  }
});
