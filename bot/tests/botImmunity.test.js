"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const discord = require("discord.js");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8").replace(/\r\n/g, "\n");
const messageSource = read("events/messageCreate.js");
const databaseSource = read("utils/database.js");
const protectionSource = read("utils/embedBuilders/moderationEmbeds.js");
function declaration(source, name, async = false) {
  const start = source.indexOf(`${async ? "async " : ""}function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf("\n}", start) + 2);
}
function harness() {
  const bot = { id: "123456789012345678", bot: true };
  const states = { first: {}, second: {} };
  const member = { id: bot.id, user: bot, roles: { cache: new discord.Collection() } };
  const guild = { id: "first", ownerId: "owner", members: { cache: new Map([[bot.id, member]]), fetch: async () => member } };
  const replies = [];
  const saved = [];
  const ctx = vm.createContext({ ...discord, client: { guilds: { cache: new Map([[guild.id, guild]]) } },
    require: require("node:module").createRequire(path.join(__dirname, "../index.js")),
    guildData: id => states[id], resolveUser: async () => bot,
    gatherFeatureRoleIds: (data, features) => features.map(feature => data.featureRoleIds?.[feature]).filter(Boolean),
    isConfiguredBotOwner: id => id === "trusted-owner",
    canManageSecurityFeature: (targetGuild, id) => id === "trusted-owner" || states[targetGuild?.id]?.extraOwners?.includes(id),
    saveDB: id => saved.push(id),
    createErrorContainer: (title, message) => new discord.ContainerBuilder().addTextDisplayComponents(t => t.setContent(`### ${title}\n${message}`)),
  });
  vm.runInContext([
    databaseSource.slice(databaseSource.indexOf("function uniqueIdList("), databaseSource.indexOf("Object.assign(globalThis, { syncGuildWhitelist")),
    declaration(databaseSource, "isAuthorized"),
    declaration(messageSource, "ensureGuildWhitelistData"),
    declaration(messageSource, "handleBotImmunityCommand", true),
    protectionSource.slice(0, protectionSource.indexOf("/* ================= MOD LOGS")),
  ].join("\n"), ctx);
  const msg = { guild, author: { id: "trusted-owner" }, member: { permissions: new discord.PermissionsBitField(discord.PermissionFlagsBits.ManageGuild) }, reply: async payload => { replies.push(payload); return payload; } };
  return { ctx, bot, states, member, guild, msg, replies, saved };
}

test("botgrant uses the shared whitelist for Anti-Bot, Anti-Nuke, moderation and Wall", async () => {
  const h = harness();
  await h.ctx.handleBotImmunityCommand(h.msg, "first", [h.bot.id], ",");
  assert.deepEqual(Array.from(h.states.first.whitelistUsers), [h.bot.id]);
  assert.equal(h.ctx.isAntibotWhitelisted(h.bot.id, "first"), true);
  assert.equal(await h.ctx.isAntiNukeWhitelisted(h.bot.id, "first"), true);
  for (const check of ["isBadWordImmune", "isNSFWImmune", "isAntilinkImmune", "isAutomodImmune"]) {
    assert.equal(h.ctx[check](h.member, null, "first"), true, check);
  }
  assert.equal(h.ctx.isWallWhitelisted(h.member, "first"), true);
  assert.equal(h.ctx.isSecurityWhitelisted(h.member, "second"), false);
  assert.deepEqual(h.saved, ["first"]);
  const payload = h.replies[0];
  assert.equal(payload.flags, discord.MessageFlags.IsComponentsV2);
  assert.equal(payload.components[0].toJSON().components[0].content, "### Bot granted immunity");
  assert.equal(h.ctx.isAuthorized({ guild: h.guild, author: h.bot, member: h.member }, "first"), false);
});

test("grants are idempotent and revoke removes shared immunity without touching another member", async () => {
  const h = harness();
  h.states.first.whitelistUsers = ["unrelated"];
  await h.ctx.handleBotImmunityCommand(h.msg, "first", [h.bot.id], ",");
  await h.ctx.handleBotImmunityCommand(h.msg, "first", [h.bot.id], ",");
  assert.equal(h.states.first.whitelistUsers.filter(id => id === h.bot.id).length, 1);
  await h.ctx.handleBotImmunityCommand(h.msg, "first", [h.bot.id], ",", true);
  assert.deepEqual(Array.from(h.states.first.whitelistUsers), ["unrelated"]);
  assert.equal(h.ctx.isAntibotWhitelisted(h.bot.id, "first"), false);
  assert.equal(await h.ctx.isAntiNukeWhitelisted(h.bot.id, "first"), false);
  assert.equal(h.ctx.isWallWhitelisted(h.member, "first"), false);
});

test("AutoMod immunity uses its own whitelist role, not server access or Anti-Bot roles", () => {
  const h = harness();
  h.states.first.featureRoleIds = { access: "verified", antibot: "anti-bot", automod: "automod-exempt" };
  const member = { id: "member", roles: { cache: new discord.Collection([["verified", { id: "verified" }]]) } };
  assert.equal(h.ctx.isAutomodImmune(member, null, "first"), false);
  member.roles.cache = new discord.Collection([["anti-bot", { id: "anti-bot" }]]);
  assert.equal(h.ctx.isAutomodImmune(member, null, "first"), false);
  member.roles.cache = new discord.Collection([["automod-exempt", { id: "automod-exempt" }]]);
  assert.equal(h.ctx.isAutomodImmune(member, null, "first"), true);
});

test("an Anti-Nuke-specific whitelist entry does not grant immunity to other protection systems", async () => {
  const h = harness();
  h.states.first.antinuke = { whitelist: [h.bot.id], whitelistRoles: [], enabled: true };
  assert.equal(await h.ctx.isAntiNukeWhitelisted(h.bot.id, "first"), true);
  for (const check of ["isAntibotWhitelisted", "isBadWordImmune", "isNSFWImmune", "isAntilinkImmune", "isAutomodImmune"]) {
    const result = check === "isAntibotWhitelisted"
      ? h.ctx[check](h.bot.id, "first")
      : h.ctx[check](h.member, null, "first");
    assert.equal(result, false, check);
  }
  assert.equal(h.ctx.isWallWhitelisted(h.member, "first"), false);
});

test("non-admins, human targets, missing arguments and DMs cannot change immunity", async () => {
  const h = harness();
  h.msg.author.id = "admin";
  const denied = { ...h.msg, member: { permissions: new discord.PermissionsBitField() } };
  await h.ctx.handleBotImmunityCommand(denied, "first", [h.bot.id], "?");
  assert.match(h.replies.at(-1).components[0].toJSON().components[0].content, /Missing Permission/);
  h.msg.author.id = "trusted-owner";
  await h.ctx.handleBotImmunityCommand(h.msg, "first", [], "?");
  assert.match(JSON.stringify(h.replies.at(-1)), /\?botgrant/);
  h.bot.bot = false;
  await h.ctx.handleBotImmunityCommand(h.msg, "first", [h.bot.id], "?");
  await h.ctx.handleBotImmunityCommand({ ...h.msg, guild: null }, null, [h.bot.id], "?");
  assert.equal(h.saved.length, 0);
  assert.deepEqual(h.states.first, {});
});
