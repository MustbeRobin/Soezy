"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const discord = require("discord.js");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function loggingHarness(logging = {}, emergency = null) {
  const context = vm.createContext({ ...discord, module: { exports: {} }, guildData: () => ({ logging }), soezyEmergency: emergency });
  vm.runInContext(read("utils/containerBuilder.js"), context);
  return context.module.exports;
}

test("channel logs send containers with dividers and no embeds or mentions", async () => {
  for (const event of ["channelCreate", "channelDelete"]) {
    let payload;
    const logging = { enabled: true, channel: "logs", events: { [event]: true } };
    const guild = { id: "guild", channels: { cache: new Map([["logs", { send: async value => { payload = value; } }]]) } };
    await loggingHarness(logging).sendConfiguredLogging(guild, event, {
      fields: [{ name: "Channel", value: "<#123>" }], files: ["audit.txt"],
    });
    assert.equal(payload.flags, discord.MessageFlags.IsComponentsV2);
    assert.equal(payload.embeds, undefined);
    assert.equal(payload.allowedMentions.parse.length, 0);
    assert.equal(payload.files[0], "audit.txt");
    const panel = payload.components[0].toJSON();
    assert.equal(panel.type, discord.ComponentType.Container);
    assert.equal(panel.accent_color, undefined);
    assert.equal(panel.components[1].divider, true);
  }
});

test("emergency logging skips both channel fetch and send", async () => {
  const api = loggingHarness({ enabled: true, channel: "logs", events: { messageEdit: true } }, { active: id => id === "guild" });
  await api.sendConfiguredLogging({ id: "guild", channels: { fetch: async () => assert.fail("fetched logs during attack") } }, "messageEdit");
});

test("standalone feature logs are revoked even when stale settings enable them", async () => {
  const events = ["wall", "wallBypass", "jail", "unjail", "confess", "confession", "ticketTranscript", "verification", "purge", "premium", "antinuke", "security:alert"];
  const sent = [];
  const channel = { send: async p => sent.push(p) };
  const guild = { id: "guild", channels: { cache: new Map([["logs", channel]]) } };
  const logging = { enabled: true, channel: "logs", events: Object.fromEntries(events.map(event => [event, true])) };
  const api = loggingHarness(logging);
  for (const event of events) {
    await api.sendLoggingContainer(channel, event, { guild });
    await api.sendConfiguredLogging(guild, event);
  }
  assert.equal(sent.length, 0);
});

test("legacy log callers use only Logging Config channel and enabled event settings", async () => {
  const sent = [];
  const configured = { send: async p => sent.push(p) };
  const legacy = { send: async () => assert.fail("used standalone log channel") };
  const guild = { id: "guild", channels: { cache: new Map([["configured", configured]]) } };
  const logging = { enabled: true, channels: { moderation: "configured" }, events: { memberWarn: true } };
  const api = loggingHarness(logging);
  await api.sendLoggingContainer(legacy, "warn", { guild });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].flags, discord.MessageFlags.IsComponentsV2);
  logging.events.memberWarn = false;
  await api.sendLoggingContainer(legacy, "warn", { guild });
  logging.events.memberWarn = true;
  logging.enabled = false;
  await api.sendLoggingContainer(legacy, "warn", { guild });
  assert.equal(sent.length, 1);
});

test("message edit logging respects settings and preserves text with a jump button", async () => {
  const logging = { enabled: true, events: { messageEdit: true }, channels: { message: "logs" } };
  const sent = [];
  const guild = { id: "guild", name: "Test", channels: { cache: new Map([["logs", { send: async p => sent.push(p) }]]) } };
  const api = loggingHarness(logging);
  const options = { fields: [{ name: "Before Edit", value: "**hello**\n\u2764\ufe0f" }, { name: "After Edit", value: "changed" }], jumpUrl: "https://discord.com/channels/1/2/3" };
  await api.sendConfiguredLogging(guild, "messageEdit", options);
  assert.equal(sent.length, 1);
  const panel = sent[0].components[0].toJSON();
  assert.equal(panel.components[0].content, "### Message Edited");
  assert.ok(panel.components.some(c => c.content === "**Before**\n```\n**hello**\n\u2764\ufe0f\n```"));
  assert.ok(panel.components.some(c => c.content === "**After**\n```\nchanged\n```"));
  assert.equal(sent[0].components.length, 1);
  const row = panel.components.at(-3);
  assert.equal(row.type, discord.ComponentType.ActionRow);
  assert.equal(row.components[0].url, options.jumpUrl);
  assert.equal(panel.components.at(-2).divider, true);
  assert.match(panel.components.at(-1).content, /^-# Test .*<t:\d+:f>$/);
  logging.events.messageEdit = false;
  await api.sendConfiguredLogging(guild, "messageEdit", options);
  logging.events.messageEdit = true;
  logging.enabled = false;
  await api.sendConfiguredLogging(guild, "messageEdit", options);
  assert.equal(sent.length, 1);
});

test("ignore voice and embedded-message switches suppress only matching logs", async () => {
  const logging = { enabled: true, events: { messageEdit: true, voiceJoin: true }, channels: { message: "logs", voice: "logs" } };
  const sent = [];
  const guild = { id: "guild", channels: { cache: new Map([["logs", { send: async p => sent.push(p) }]]) } };
  const api = loggingHarness(logging);
  await api.sendConfiguredLogging(guild, "messageEdit", { hasEmbeds: true });
  assert.equal(sent.length, 1);
  logging.ignoreEmbeds = true;
  await api.sendConfiguredLogging(guild, "messageEdit", { hasEmbeds: true });
  await api.sendConfiguredLogging(guild, "messageEdit", { hasEmbeds: false });
  assert.equal(sent.length, 2);
  logging.ignoreVoice = true;
  await api.sendConfiguredLogging(guild, "voiceJoin");
  assert.equal(sent.length, 2);
});

test("supplied logging buttons stay inside the container without duplicate jump buttons", async () => {
  for (const raw of [false, true]) {
    let payload;
    const logging = { enabled: true, channel: "logs", events: { messageEdit: true } };
    const guild = { id: "guild", channels: { cache: new Map([["logs", { send: async p => { payload = p; } }]]) } };
    const url = "https://discord.com/channels/1/2/3";
    const row = new discord.ActionRowBuilder().addComponents(
      new discord.ButtonBuilder().setLabel("Jump to Message").setStyle(discord.ButtonStyle.Link).setURL(url),
      new discord.ButtonBuilder().setLabel("View Channel").setStyle(discord.ButtonStyle.Link).setURL("https://discord.com/channels/1/2")
    );
    await loggingHarness(logging).sendConfiguredLogging(guild, "messageEdit", {
      jumpUrl: url, components: [raw ? row.toJSON() : row],
    });
    assert.equal(payload.components.length, 1);
    const rows = payload.components[0].toJSON().components.filter(c => c.type === discord.ComponentType.ActionRow);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].components.length, 2);
    assert.equal(rows[0].components[0].url, url);
    assert.equal(payload.components[0].toJSON().components.at(-3).type, discord.ComponentType.ActionRow);
  }
});

test("message update dispatches real edits and ignores bot and unchanged messages", async () => {
  const source = read("handlers/feature-events.js");
  const start = source.indexOf('client.on("messageUpdate"');
  const end = source.indexOf("/* ================= VOICE STATE", start);
  let listener;
  const calls = [];
  vm.runInNewContext(source.slice(start, end), {
    client: { on: (_event, fn) => { listener = fn; } },
    channelEditHistory: new Map(), editSnipedMessages: new Map(),
    sendLogEvent: async (...args) => calls.push(args),
  });
  const old = { guild: { id: "guild" }, channel: { id: "channel" }, author: { id: "user", bot: false }, content: "before" };
  await listener(old, { content: "after", url: "jump" });
  assert.equal(calls[0][1], "messageEdit");
  assert.equal(calls[0][2].editBefore, "before");
  assert.equal(calls[0][2].editAfter, "after");
  await listener(old, { content: "before" });
  await listener({ ...old, author: { bot: true } }, { content: "after" });
  assert.equal(calls.length, 1);
});

test("edit layout quotes author and channel, keeps code fences intact and ends with footer", () => {
  const panel = loggingHarness().createLoggingContainer("messageEdit", {
    guild: { name: "Server" }, actor: { id: "42", username: "Robin" },
    fields: [
      { name: "Channel", value: "<#123>" },
      { name: "Before Edit", value: "```js\ncode\n```" },
      { name: "After Edit", value: "updated" },
    ],
  }).toJSON();
  assert.equal(panel.components[0].content, "### Message Edited");
  assert.equal(panel.components[1].divider, true);
  assert.equal(panel.components[2].content, "> **By:** `Robin`\n> **Channel ID:** 123");
  assert.equal((panel.components[3].content.match(/```/g) || []).length, 2);
  assert.match(panel.components[4].content, /^\*\*After\*\*/);
  assert.equal(panel.components[5].divider, true);
  assert.match(panel.components[6].content, /^-# Server /);
});

test("empty giveaway announcement uses a native container", async () => {
  const source = read("utils/embedBuilders/dashboardEmbeds.js");
  const start = source.indexOf("const noEntriesContainer =");
  const end = source.indexOf(".catch(() => { });", start) + ".catch(() => { });".length;
  let payload;
  await vm.runInNewContext(`(async () => { ${source.slice(start, end)} })()`, {
    ...discord, giveawayData: { prize: "owo" }, channel: { send: async p => { payload = p; } },
  });
  assert.equal(payload.flags, discord.MessageFlags.IsComponentsV2);
  const panel = payload.components[0].toJSON();
  assert.equal(panel.components[0].content, "### Giveaway Ended");
  assert.equal(panel.components[1].divider, true);
  assert.match(panel.components[2].content, /No one participated.*owo/);
  assert.ok(source.includes("message.edit({ content: null, embeds: [], components: [endedContainerNoWin]"));
});
