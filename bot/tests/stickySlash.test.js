"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("sticky registers only the config slash subcommand", () => {
  const json = require("../commands/config/sticky").data.toJSON();
  assert.deepEqual(json.options.map(option => [option.name, option.type]), [["config", 1]]);
});

test("stale sticky slash commands are rejected before mutation", async () => {
  const source = read("events/interactionCreate.js");
  const start = source.indexOf('          if (commandName === "sticky" && sub !== "config")');
  assert.ok(start > 0);
  assert.ok(start < source.indexOf('if (commandName === "sticky" && ["name", "message", "mode"].includes(sub))'));
  const block = source.slice(start, source.indexOf("          const gId = interaction.guildId;", start));
  for (const sub of ["create", "edit", "delete", "set", "name", "message", "mode", "list", "remove", "config"]) {
    let reply;
    await vm.runInNewContext(`(async () => { ${block} })()`, {
      commandName: "sticky", sub,
      createInfoContainer: (title, description) => ({ title, description }),
      MessageFlags: { IsComponentsV2: 32768 },
      interaction: { reply: async payload => { reply = payload; } }
    });
    assert.equal(Boolean(reply), sub !== "config");
  }
});

test("slash sticky config uses the prefix panel with server prefix and existing permissions", async () => {
  const source = read("events/interactionCreate.js");
  const start = source.indexOf("// ========== STICKY CONFIG ==========");
  const block = source.slice(start, source.indexOf("// ========== BIRTHDAY CONFIG ==========", start));
  assert.match(read("events/messageCreate.js"), /buildStickyConfigPanel\(guildId, msg.author, PREFIX\)/);
  const user = { id: "user" };
  for (const [manageMessages, authorized] of [[true, true], [false, true], [true, false]]) {
    let reply;
    let built = 0;
    await vm.runInNewContext(`(async () => { ${block} })()`, {
      commandName: "sticky",
      interaction: { guildId: "guild", user, memberPermissions: { has: () => manageMessages }, reply: async payload => { reply = payload; } },
      PermissionsBitField: { Flags: { ManageMessages: 1 } },
      isAuthorizedInteraction: () => authorized,
      createErrorContainer: () => "denied",
      MessageFlags: { IsComponentsV2: 32768 },
      getPrefix: () => ",",
      buildStickyConfigPanel: (guildId, panelUser, prefix) => {
        assert.equal(guildId, "guild");
        assert.equal(panelUser, user);
        assert.equal(prefix, ",");
        built++;
        return "shared-panel";
      }
    });
    assert.equal(built, manageMessages && authorized ? 1 : 0);
    assert.equal(reply.components[0], built ? "shared-panel" : "denied");
  }
});
