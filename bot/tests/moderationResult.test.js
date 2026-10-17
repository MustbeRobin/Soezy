"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { EmbedBuilder, ContainerBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const source = fs.readFileSync(path.join(__dirname, "../utils/embedBuilders/moderationEmbeds.js"), "utf8");
const ctx = vm.createContext({ EmbedBuilder, require: require("node:module").createRequire(path.join(__dirname, "../index.js")), EMOJIS: {
  moderation: "MOD", moderation_update: "UPDATE", Tick: "TICK", moderation_dm_tick: "OLD_TICK", cross: "CROSS",
  ban_title: "BAN", unban_title: "UNBAN", mute_title: "MUTE", unmute_title: "UNMUTE", kick_title: "KICK",
  fban_title: "FBAN", fkick_title: "FKICK", fmute_title: "FMUTE",
}, getThemeColor: () => 0xabcdef });
Object.assign(ctx, { ContainerBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle });
vm.runInContext(source.slice(0, source.indexOf("/* ================= WHITELIST")), ctx);
const avatar = "https://cdn.discordapp.com/embed/avatars/0.png";
const options = { guild: { id: "1", name: "Test Server", iconURL: () => avatar }, target: { id: "123", displayAvatarURL: () => avatar }, executor: { id: "456" } };

test("runtime loads the complete moderation helper before both command handlers", () => {
  const files = require("../handlers/runtime-files");
  const helperIndex = files.indexOf("utils/embedBuilders/moderationEmbeds.js");
  assert.ok(helperIndex >= 0);
  for (const handler of ["events/messageCreate.js", "events/interactionCreate.js"])
    assert.ok(files.indexOf(handler) > helperIndex);
  const runtime = vm.createContext({ EmbedBuilder, require: require("node:module").createRequire(path.join(__dirname, "../index.js")), EMOJIS: { moderation_update: "MOD", cross: "CROSS" }, getThemeColor: () => 0x808080 });
  vm.runInContext(source, runtime);
  const reply = vm.runInContext('buildModerationResultReplyOptions(buildModerationResultEmbed({guild: {id: "1", name: "Server"}, target: {id: "123"}, executor: {id: "456"}, action: "kick"}), {id: "123"})', runtime);
  assert.equal(reply.content, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(reply.allowedMentions)), { parse: [], users: [], roles: [], repliedUser: false });
  assert.match(reply.embeds[0].toJSON().title, /User Kicked/);
});

test("all moderation actions use the reference embed layout and truthful DM status", () => {
  const actionTitles = { mute: "MUTE", unmute: "UNMUTE", ban: "BAN", unban: "UNBAN", kick: "KICK", warn: "UPDATE" };
  for (const [action, emoji] of Object.entries(actionTitles)) {
    const result = ctx.buildModerationResultEmbed({ ...options, action, dmSent: true }).toJSON();
    assert.match(result.title, new RegExp(`^${emoji} User `));
    assert.match(result.description, /> \*\*Target : <@123> \(`123`\)\*\*/);
    assert.match(result.description, /> \*\*Executor : <@456>\*\*/);
    assert.match(result.description, /> \*\*Server : `Test Server`\*\*/);
    assert.match(result.description, /> \*\*Reason :\*\*\n```\nNo reason provided\.\n```/);
    assert.match(result.description, /\*\*DM Status\*\*: TICK Sent successfully/);
    assert.equal(result.thumbnail.url, avatar);
    assert.equal(result.footer, undefined);
    assert.equal(result.timestamp, undefined);
  }
});

test("moderation replies explicitly allow only the target mention", () => {
  const embed = ctx.buildModerationResultEmbed({ ...options, action: "mute" });
  const reply = ctx.buildModerationResultReplyOptions(embed, options.target);
  assert.equal(reply.content, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(reply.allowedMentions)), { parse: [], users: [], roles: [], repliedUser: false });
  assert.match(reply.embeds[0].toJSON().description, /<@123>/);
  assert.equal(reply.embeds[0], embed);
});

test("moderation DMs use the requested container layout and only mute actions include a view button", () => {
  for (const action of ["mute", "unmute", "ban", "unban", "kick"]) {
    const container = ctx.buildModerationDmContainer({
      action, guildName: "Jane", moderatorTag: "be_my_mommy", reason: "No reason provided.",
      duration: action === "mute" ? "10m" : undefined,
      sourceUrl: "https://discord.com/channels/1/2/3",
    }).toJSON();
    const text = container.components[0].content;
    assert.match(text, /^## .*You have been|^## .*Your timeout has been/);
    assert.match(text, /> \* \*\*Server: `Jane`\*\*/);
    assert.match(text, /> \* \*\*Moderator: `be_my_mommy`\*\*/);
    assert.match(text, /> \* \*\*Reason:\*\* ```No reason provided\.```/);
    if (action === "mute") assert.match(text, /> \* \*\*Duration: `10m`\*\*/);
    const rows = container.components.filter(component => component.type === 1);
    assert.equal(rows.length, action === "mute" || action === "unmute" ? 1 : 0);
    if (rows.length) {
      assert.equal(rows[0].components[0].label, "View Message");
      assert.equal(rows[0].components[0].style, ButtonStyle.Link);
    }
  }
});

test("duration, warnings, failed and unattempted DMs remain distinct", () => {
  const result = ctx.buildModerationResultEmbed({ ...options, action: "mute", duration: "1m", dmSent: false, warnings: 2 }).toJSON();
  assert.match(result.description, /\*\*Duration : `1m`\*\*/);
  assert.match(result.description, /Total Warnings : `2`/);
  assert.match(result.description, /CROSS Could not send DM/);
  const simulatedTitles = { ban: "FBAN", kick: "FKICK", mute: "FMUTE" };
  for (const [action, emoji] of Object.entries(simulatedTitles)) {
    const fake = ctx.buildModerationResultEmbed({ ...options, action, simulated: true }).toJSON();
    assert.match(fake.title, new RegExp(`^${emoji} User `));
    assert.match(fake.title, /\(Simulation\)/);
    assert.match(fake.description, /CROSS Not sent/);
    assert.doesNotMatch(fake.description, /Sent successfully/);
  }
});

test("handles raw IDs, missing guild icons and long multiline reasons safely", () => {
  const result = ctx.buildModerationResultEmbed({ ...options, target: { id: "123" }, guild: { ...options.guild, iconURL: () => null }, action: "ban", reason: "```\n@everyone\n" + "x".repeat(5000) }).toJSON();
  assert.equal(result.thumbnail, undefined);
  assert.equal(result.footer, undefined);
  assert.equal((result.description.match(/```/g) || []).length, 2);
  assert.ok(result.description.length < 4096);
});

test("prefix and slash success paths use the shared builder", () => {
  const prefix = fs.readFileSync(path.join(__dirname, "../events/messageCreate.js"), "utf8");
  for (const name of ["mute", "unmute", "ban", "unban", "kick", "warn", "fban", "fkick", "fmute"]) {
    assert.match(prefix, new RegExp("const _" + name + "Embed = buildModerationResultEmbed"));
  }
  const slash = fs.readFileSync(path.join(__dirname, "../events/interactionCreate.js"), "utf8");
  for (const action of ["mute", "unmute", "ban", "unban", "kick", "warn"]) {
    assert.match(slash, new RegExp('buildModerationResultEmbed\\(\\{[^\\n]+action: "' + action + '"'));
  }
  assert.match(slash, /const warnDmSent = await user.send/);
  assert.match(prefix, /buildModerationResultReplyOptions\(_muteEmbed, target\)/);
  assert.match(slash, /buildModerationResultReplyOptions\(embed, user\)/);
});
