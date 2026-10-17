"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../events/interactionCreate.js"), "utf8");

test("whitelist registers only config", () => {
  assert.deepEqual(require("../commands/config/whitelist").data.toJSON().options.map(o => [o.name, o.type]), [["config", 1]]);
});

test("whitelist config rejects unauthorized and stale commands before showing shared panel", async () => {
  const start = source.indexOf('        if (commandName === "whitelist") {');
  const block = source.slice(start, source.indexOf("        if (soezyMusic.isMusicCommandKeyword(commandName))", start));
  for (const [authorized, group, sub, expected] of [[false, null, "config", "denied"], [true, "user", "add", "redirect"], [true, null, "config", "panel"]]) {
    let reply;
    await vm.runInNewContext(`(async () => { ${block} })()`, {
      commandName: "whitelist",
      interaction: { guildId: "guild", user: { id: "user" }, options: { getSubcommandGroup: () => group, getSubcommand: () => sub }, reply: async p => { reply = p; } },
      isAuthorizedInteraction: () => authorized,
      createErrorContainer: () => "denied", createInfoContainer: () => "redirect",
      buildWhitelistConfigPanel: () => "panel", MessageFlags: { IsComponentsV2: 32768 }
    });
    assert.equal(reply.components[0], expected);
  }
});

test("global panel writes use the prefix whitelist synchronization helper", () => {
  const start = source.indexOf("function updateSecurityWhitelistIds(");
  const block = source.slice(start, source.indexOf("function securityWhitelistScopeLabel", start));
  for (const type of ["user", "role", "channel"]) {
    for (const mode of ["add", "remove"]) {
      const calls = [];
      let saved = false;
      const ctx = { getSecurityWhitelistIds: () => mode === "add" ? [] : ["123"], uniqueSecurityIds: (...ids) => [...new Set(ids.flat())], guildData: () => ({}), syncGlobalWhitelistEntry: (...args) => calls.push(args), syncGuildWhitelist: () => {}, saveDB: () => { saved = true; } };
      vm.createContext(ctx);
      vm.runInContext(block, ctx);
      ctx.updateSecurityWhitelistIds("guild", "global", type, ["123"], mode);
      assert.equal(calls.length, 1);
      assert.equal(calls[0][1], type);
      assert.equal(calls[0][3], mode);
      assert.equal(saved, true);
    }
  }
});
