"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const discord = require("discord.js");
const source = fs.readFileSync(path.join(__dirname, "../utils/permissionUtils.js"), "utf8");
const owner = "111111111111111111", first = "222222222222222222", second = "333333333333333333";
function setup() {
  const gd = { extraOwners: [] };
  const ctx = { ...discord, module: { exports: {} }, guildData: () => gd, saveDB() {}, isConfiguredBotOwner: id => String(id) === owner,
    createErrorContainer: (title, text) => ({ title, text }), createInfoContainer: (title, text) => ({ title, text }) };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  const guild = { id: "guild", ownerId: "999999999999999999", members: { fetch: async id => ({ id, user: { bot: false } }) } };
  let result;
  const msg = { guild, author: { id: owner }, reply: async payload => { result = payload.components[0]; } };
  return { ctx, gd, guild, msg, result: () => result };
}
test("owner can add, edit, list and remove AntiNuke delegates", async () => {
  const f = setup();
  await f.ctx.handleExtraOwnerCommand(f.msg, ["add", `<@${first}>`], ",");
  assert.equal(f.ctx.canManageAntiNuke(f.guild, first), true);
  await f.ctx.handleExtraOwnerCommand(f.msg, ["edit", first, second], ",");
  assert.equal(f.ctx.canManageAntiNuke(f.guild, first), false);
  assert.equal(f.ctx.canManageAntiNuke(f.guild, second), true);
  await f.ctx.handleExtraOwnerCommand(f.msg, ["list"], ",");
  assert.ok(f.result().text.includes(second));
  await f.ctx.handleExtraOwnerCommand(f.msg, ["remove", second], ",");
  assert.equal(f.gd.extraOwners.length, 0);
});
test("extra owners cannot delegate their own authority; ordinary admins are not owners", async () => {
  const f = setup(); f.gd.extraOwners.push(first); f.msg.author.id = first;
  await f.ctx.handleExtraOwnerCommand(f.msg, ["add", second], ",");
  assert.equal(f.result().title, "Access Denied");
  assert.equal(f.ctx.canManageAntiNuke(f.guild, second), false);
  assert.equal(f.ctx.canManageAntiNuke(f.guild, owner), true);
});

test("guild ownership alone does not authorize protected configuration", () => {
  const f = setup();
  assert.equal(f.ctx.canManageSecurityFeature(f.guild, owner, "antinuke"), true);
  assert.equal(f.ctx.canManageSecurityFeature(f.guild, f.guild.ownerId, "automod"), false);
  assert.equal(f.ctx.canManageSecurityFeature(f.guild, "444444444444444444", "wall"), false);
  f.gd.extraOwners.push(first);
  assert.equal(f.ctx.canManageSecurityFeature(f.guild, first, "wall"), true);
});
test("AntiNuke panels, modals and generic toggle values use the owner policy", () => {
  const f = setup();
  for (const i of [{ commandName: "antinuke" }, { customId: "ancfg_select_test" }, { customId: "anmod_punishment_test" }, { customId: "toggle_antinuke" }, { values: ["antinuke"] }]) {
    assert.equal(f.ctx.isAntiNukeInteraction(i), true);
  }
  assert.equal(f.ctx.isAntiNukeInteraction({ commandName: "ban" }), false);
});

test("help navigation is public while security controls remain protected", () => {
  const { ctx } = setup();
  for (const category of ["antinuke", "automod", "security", "verify", "wall", "whitelist"]) {
    for (const action of ["category", "cat", "main", "prevmod", "nextmod", "prev", "next", "first", "last", "close", "home"]) {
      const interaction = { customId: `help_${action}_123_${category}_456`, values: [category] };
      assert.equal(ctx.isAntiNukeInteraction(interaction), false);
      assert.equal(ctx.isOwnerSecurityInteraction(interaction), false);
    }
    assert.equal(ctx.isOwnerSecurityInteraction({ customId: `toggle_${category}`, values: [category] }), true);
    assert.equal(ctx.isOwnerSecurityInteraction({ commandName: category }), true);
  }
});

test("security configuration and whitelist paths are protected without blocking member actions", () => {
  const f = setup();
  for (const name of ["automod", "am", "security", "verify", "verification", "wall", "whitelist", "wl", "immune", "automodwhitelist", "antilink", "badword", "nsfw", "antimention"]) {
    assert.equal(f.ctx.isOwnerSecurityCommand(name), true, name);
  }
  for (const customId of ["amcfg_select_123", "ammod_set_123", "secfg_select_123", "wscfg_select_123", "wsmod_set_123", "vcfg_select_123", "vcmod_role_123", "whitelistsetup_pickuser_any_123", "secwl_pick_123", "securitywarn_continue_123", "wallappeal_config_123"]) {
    assert.equal(f.ctx.isOwnerSecurityInteraction({ customId }), true, customId);
  }
  for (const customId of ["verify_btn_123", "verify_approve_123", "wallappeal_open_123", "wallappeal_approve_123", "wallappeal_cancel_123", "music_pause_123"]) {
    assert.equal(f.ctx.isOwnerSecurityInteraction({ customId }), false, customId);
  }
  assert.equal(f.ctx.isOwnerSecurityCommand("ban"), false);
});
