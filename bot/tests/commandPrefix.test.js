"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const discord = require("discord.js");
const { resolveCommandInvocation } = require("../utils/commandManager");
const source = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8").replace(/\r\n/g, "\n");

function declaration(file, name) {
  const text = source(file);
  const start = text.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return text.slice(start, text.indexOf("\n}", start) + 2);
}

test("old AutoMod paths route to the canonical handlers without separate state", () => {
  for (const alias of ["automod", "am", "automode"]) {
    for (const [rule, canonical] of [["antilink", "antilink"], ["badword", "badword"], ["nsfw", "nsfw"], ["mention", "antimention"]]) {
      for (const action of ["enable", "disable", "config"]) {
        assert.deepEqual(resolveCommandInvocation(alias, [rule, action]), { commandName: canonical, args: [action] });
      }
    }
  }
  assert.deepEqual(resolveCommandInvocation("automod", ["badword", "add", "MiXeD"]), { commandName: "badword", args: ["add", "MiXeD"] });
  assert.deepEqual(resolveCommandInvocation("automod", ["nsfw", "off"]), { commandName: "nsfw", args: ["disable"] });
  assert.deepEqual(resolveCommandInvocation("automod", ["mention", "limit", "6"]), { commandName: "antimention", args: ["limit", "6"] });
  assert.deepEqual(resolveCommandInvocation("nsfwfilter", ["enable"]), { commandName: "nsfw", args: ["enable"] });
});

test("displayed prefixes follow each server and update without changing the bot default", () => {
  const ctx = vm.createContext({ config: { prefix: "!" }, DEFAULT_PREFIX: "!", db: { prefixes: { first: ",", second: "so!" } } });
  vm.runInContext([
    declaration("utils/database.js", "getPrefix"),
    declaration("utils/embedBuilders/helpEmbeds.js", "getDisplayHelpPrefix"),
    declaration("events/messageCreate.js", "getDisplayPrefix"),
  ].join("\n"), ctx);
  for (const method of ["getPrefix", "getDisplayHelpPrefix", "getDisplayPrefix"]) {
    assert.equal(ctx[method]("first"), ",");
    assert.equal(ctx[method]("second"), "so!");
    assert.equal(ctx[method]("unconfigured"), "!");
    ctx.db.prefixes.first = ".";
    assert.equal(ctx[method]("first"), ".");
    ctx.db.prefixes.first = ",";
  }
  assert.equal(ctx.config.prefix, "!");
});

test("selfie and timezone panels render server-specific command examples", () => {
  const ctx = vm.createContext({ ...discord, config: { prefix: "!" }, DEFAULT_PREFIX: "!",
    db: { prefixes: { server: "?" }, users: {} }, guildData: () => ({}), EMOJIS: { search: "" },
    TIMEZONE_OFFSETS_HOURS: { UTC: 0 }, timezoneClockText: () => "UTC",
  });
  vm.runInContext([
    declaration("utils/database.js", "getPrefix"),
    declaration("utils/database.js", "buildSelfieConfigPanel"),
    declaration("events/messageCreate.js", "buildPersonalTimezoneContainer"),
  ].join("\n"), ctx);
  assert.match(JSON.stringify(ctx.buildSelfieConfigPanel({}, "server", "session", { username: "member" }).container.toJSON()), /\?selfie/);
  assert.match(JSON.stringify(ctx.buildPersonalTimezoneContainer("user", "member", "server").toJSON()), /\?stz/);
});

test("user-facing command examples and panel refreshes do not hardcode the default prefix", () => {
  for (const file of ["events/messageCreate.js", "events/interactionCreate.js", "handlers/feature-events.js", "handlers/error-handling.js", "utils/database.js", "utils/game.js", "utils/embedBuilders/helpEmbeds.js"]) {
    assert.doesNotMatch(source(file), /`![a-z][a-z-]*\b/i, file);
  }
  assert.doesNotMatch(source("events/interactionCreate.js"), /(?:build\w+ConfigPanel|refreshConfigPanel).*DEFAULT_PREFIX/);
});

test("asynchronous music panels read the live per-server prefix across the VM boundary", () => {
  const ctx = vm.createContext({ ...discord, MUSIC_QUEUE_END: "" });
  vm.runInContext([
    declaration("commands/music/music.js", "getMusicPrefix"),
    declaration("commands/music/music.js", "buildHopeYouEnjoyedContainer"),
  ].join("\n"), ctx);
  const client = { _config: { prefix: "!" }, _db: { prefixes: { first: ",", second: "so!" } } };
  const queue = { textChannel: { client } };
  for (const [guildId, prefix] of [["first", ","], ["second", "so!"], ["unset", "!"]]) {
    assert.equal(ctx.getMusicPrefix(client, guildId), prefix);
    const json = JSON.stringify(ctx.buildHopeYouEnjoyedContainer(queue, ctx.getMusicPrefix(client, guildId)).toJSON());
    assert.ok(json.includes(`${prefix}play <song>`));
  }
  client._db.prefixes.first = "?";
  assert.equal(ctx.getMusicPrefix(client, "first"), "?");
  delete client._db.prefixes.first;
  assert.equal(ctx.getMusicPrefix(client, "first"), "!");
  const music = source("commands/music/music.js");
  assert.match(music, /const prefix = getMusicPrefix\(q.textChannel\?\.client, guildId\)/);
  assert.match(music, /const prefix = getMusicPrefix\(client, guildId\)/);
  assert.match(music, /getMusicPrefix\(client, guildId\)\}leave/);
  assert.equal(client._config.prefix, "!");
});
