"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const discord = require("discord.js");
function harness(enabled = true) {
  const gd = { antinuke: { systemEnabled: enabled, enabled, events: { antiban: false } }, extraOwners: ["22"] };
  let featureStateCalls = 0;
  const ctx = vm.createContext({ ...discord, require: id => require(path.resolve(__dirname, "..", id)), guildData: () => gd,
    EMOJIS: { an_title: "TITLE", thinking: "<a:thinking:1559656266261995620>", lock: "<a:lock:123456789012345678>", moderation_dm_tick: "<:dm_tick:123456789012345679>", scross: "<:scross:1559257945030525110>", an_tick: "ON", an_disable: "<:off:1559244479314001961>", an_alert: "ALERT", tick: "<:tick:1559236522711187577>" },
    ANTINUKE_EVENTS: [
      ...Array.from({ length: 23 }, (_, n) => ({ id: n ? `event${n}` : "antiban", label: `Protection ${n}` })),
      { id: "antiautomodcreate", label: "AntiAutomod Create" },
      { id: "antiautomoddelete", label: "AntiAutomod Delete" },
    ],
    getEmoji: () => ">", getDisplayHelpPrefix: () => ",", saveDB: () => {},
    canManageAntiNuke: (_guild, id) => ["11", "22"].includes(id),
    isConfiguredBotOwner: id => id === "11",
    setFeatureState: (_id, _key, value) => { featureStateCalls++; gd.antinuke.systemEnabled = gd.antinuke.enabled = value; }, syncFeatureState: async () => {},
    buildInteractionSecurityWarningContainer: () => new discord.ContainerBuilder().addTextDisplayComponents(t => t.setContent("WHITELIST FIRST")),
    createErrorContainer: (title, message) => new discord.ContainerBuilder().addTextDisplayComponents(t => t.setContent(title + message)),
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../utils/bulkToggleState.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../utils/antinukePanel.js"), "utf8"), ctx);
  return {
    api: ctx.soezyAntiNukePanel,
    gd,
    getEventIds: () => ctx.ANTINUKE_EVENTS.map(event => event.id),
    getFeatureStateCalls: () => featureStateCalls,
  };
}
test("enabled panel shows real feature states, owner list, buttons and bounded event menus", () => {
  const { api } = harness(); const p = api.build("1", `11_${Date.now()}`, { id: "11" }).toJSON();
  const text = p.components.map(c => c.content || "").join("\n");
  assert.match(text, /AntiNuke Configuration/); assert.match(text, /`Enabled`/); assert.match(text, /<@22>/);
  assert.match(text, /<:off:1559244479314001961> Anti Ban/);
  assert.match(text, /Anti Unban · OFF · Inactive/);
  const rows = p.components.filter(c => c.type === discord.ComponentType.ActionRow);
  assert.equal(rows[0].components[0].disabled, true);
  assert.equal(rows[0].components[1].disabled, false);
  assert.equal(rows[1].components[0].options.length, 25);
  assert.equal(rows.filter(row => row.components[0].type === discord.ComponentType.StringSelect).length, 1);
  assert.equal(rows[0].components[0].emoji.name, "dm_tick");
  assert.equal(rows[0].components[1].emoji.name, "scross");
  assert.match(text, /<a:thinking:1559656266261995620> \*\*AntiNuke Configuration\*\*/);
});
test("disabled panel shows saved preferences as inactive", () => {
  const { api, gd } = harness(false); gd.extraOwners = [];
  const p = api.build("1", `11_${Date.now()}`, { id: "11" }).toJSON();
  const text = p.components.map(c => c.content || "").join("\n");
  assert.match(text, /`Disabled`/); assert.match(text, /Not Configured/); assert.match(text, /Saved Security Preferences · Inactive/);
  assert.match(text, /Anti Ban · OFF · Inactive/);
});
test("master buttons reflect parent state and preserve individual preferences", () => {
  const { api, gd, getEventIds } = harness(true);
  gd.antinuke.events = Object.fromEntries(getEventIds().map(id => [id, true]));
  gd.antiRaid = { enabled: true };
  let rows = api.build("1", `11_${Date.now()}`, { id: "11" }).toJSON().components.filter(c => c.type === discord.ComponentType.ActionRow);
  assert.equal(rows[0].components[0].disabled, true);
  assert.equal(rows[0].components[1].disabled, false);

  gd.antinuke.systemEnabled = gd.antinuke.enabled = false;
  rows = api.build("1", `11_${Date.now()}`, { id: "11" }).toJSON().components.filter(c => c.type === discord.ComponentType.ActionRow);
  assert.equal(rows[0].components[0].disabled, false);
  assert.equal(rows[0].components[1].disabled, true);

  gd.antinuke.systemEnabled = gd.antinuke.enabled = true;
  gd.antinuke.events.antiban = false;
  rows = api.build("1", `11_${Date.now()}`, { id: "11" }).toJSON().components.filter(c => c.type === discord.ComponentType.ActionRow);
  assert.equal(rows[0].components[0].disabled, true);
  assert.equal(rows[0].components[1].disabled, false);
});
test("already-satisfied AntiNuke bulk actions do not call feature-state synchronization", async () => {
  const { api, gd, getEventIds, getFeatureStateCalls } = harness(true);
  const eventIds = getEventIds();
  gd.antinuke.events = Object.fromEntries(eventIds.map(id => [id, true]));
  gd.antiRaid = { enabled: true };
  const i = { guildId: "1", guild: {}, user: { id: "11" }, customId: `ancfg_panel_enable_11_${Date.now()}`, update: async () => {} };
  await api.interaction(i);
  assert.equal(getFeatureStateCalls(), 0);

  gd.antinuke.enabled = false;
  gd.antinuke.systemEnabled = false;
  gd.antinuke.events = Object.fromEntries(eventIds.map(id => [id, false]));
  gd.antiRaid.enabled = false;
  i.customId = `ancfg_panel_disable_11_${Date.now()}`;
  await api.interaction(i);
  assert.equal(getFeatureStateCalls(), 0);
});
test("enable button runs setup and disable edits the existing panel", async () => {
  const { api, gd } = harness(false); const out = [];
  const channels = { cache: new Map(), create: async options => {
    const channel = { id: options.type === discord.ChannelType.GuildCategory ? "logs-category" : "log-channel", options,
      type: options.type, parentId: options.parent || null, isTextBased: () => options.type !== discord.ChannelType.GuildCategory,
      setParent: async parentId => { channel.parentId = parentId; }, send: async () => {} };
    channels.cache.set(channel.id, channel); return channel;
  }, fetch: async () => channels.cache };
  const roles = { cache: new Map(), fetch: async () => roles.cache, create: async options => { const role = { ...options, id: "whitelist-role", permissions: { has: () => false } }; roles.cache.set(role.id, role); return role; } };
  const guild = { id: "1", ownerId: "11", channels, roles, members: { me: { id: "bot", permissions: { has: () => true } } } };
  const i = {
    guildId: "1", guild, user: { id: "11" }, customId: `ancfg_panel_enable_11_${Date.now()}`,
    deferUpdate: async () => { i.deferred = true; },
    update: async p => out.push(p), editReply: async p => out.push(p),
  };
  await api.interaction(i); assert.equal(gd.antinuke.enabled, true, JSON.stringify(out.map(p => p.components?.[0]?.toJSON?.())));
  assert.equal(gd.antinuke.logs, "log-channel");
  assert.equal(out.length, 1);
  assert.match(out[0].components[0].toJSON().components[0].content, /AntiNuke Configuration/);
  gd.antinuke.enabled = true; i.customId = `ancfg_panel_disable_11_${Date.now()}`;
  await api.interaction(i); assert.equal(gd.antinuke.enabled, false);
});
test("combined AutoMod rule option toggles create and delete together", async () => {
  const { api, gd } = harness(true); const i = {
    guildId: "1", guild: {}, user: { id: "11" }, values: ["antiautomodrules"],
    customId: `ancfg_panel_events_11_${Date.now()}`, update: async () => {}, reply: async p => { throw new Error(p.content); },
  };
  gd.antinuke.events.antiautomodcreate = true; gd.antinuke.events.antiautomoddelete = true;
  await api.interaction(i);
  assert.equal(gd.antinuke.events.antiautomodcreate, false);
  assert.equal(gd.antinuke.events.antiautomoddelete, false);
  await api.interaction(i);
  assert.equal(gd.antinuke.events.antiautomodcreate, true);
  assert.equal(gd.antinuke.events.antiautomoddelete, true);
});
test("setup creates its log category and channel, then ends at configuration", async () => {
  const { api, gd } = harness(false), out = [];
  const channels = { cache: new Map(), create: async options => {
    const channel = { id: options.type === discord.ChannelType.GuildCategory ? "logs-category" : "log-channel", options,
      type: options.type, parentId: options.parent || null, isTextBased: () => options.type !== discord.ChannelType.GuildCategory,
      setParent: async parentId => { channel.parentId = parentId; }, send: async () => {} };
    channels.cache.set(channel.id, channel); return channel;
  }, fetch: async () => channels.cache };
  const roles = { cache: new Map(), fetch: async () => roles.cache, create: async options => { const role = { ...options, id: "whitelist-role", permissions: { has: () => false } }; roles.cache.set(role.id, role); return role; } };
  const guild = { id: "1", ownerId: "11", channels, roles, members: { me: { id: "bot", permissions: { has: () => true } } } };
  const i = { guildId: "1", guild, user: { id: "11" }, deferUpdate: async () => { i.deferred = true; }, update: async p => { i.replied = true; out.push(p); }, editReply: async p => out.push(p) };
  await api.start(i);
  assert.equal(gd.antinuke.enabled, true, JSON.stringify(out.map(p => p.components?.[0]?.toJSON?.())));
  assert.equal(gd.antinuke.logs, "log-channel");
  assert.equal(channels.cache.size, 2);
  assert.equal(channels.cache.get("log-channel").options.name, "antinuke-logs");
  assert.equal(out.length, 1);
  assert.match(out[0].components[0].toJSON().components[0].content, /AntiNuke Configuration/);
});
test("setup reuses the configured text log channel", async () => {
  const { api, gd } = harness(false), out = [];
  gd.antinuke.logs = "existing-log";
  gd.logging = { categoryId: "logs-category" };
  const existingCategory = { id: "logs-category", name: "Soezy", type: discord.ChannelType.GuildCategory };
  const existing = { id: "existing-log", type: discord.ChannelType.GuildText, parentId: existingCategory.id, isTextBased: () => true, setParent: async () => {} };
  const channels = { cache: new Map([[existingCategory.id, existingCategory], [existing.id, existing]]), fetch: async () => channels.cache,
    create: async () => { throw new Error("should reuse configured log channel and category"); } };
  const i = {
    guildId: "1", guild: { id: "1", ownerId: "11", channels, roles: { cache: new Map(), fetch: async () => new Map(), create: async options => ({ ...options, id: "whitelist-role" }) }, members: { me: { id: "bot", permissions: { has: () => true } } } },
    user: { id: "11" }, deferUpdate: async () => { i.deferred = true; }, update: async p => { i.replied = true; out.push(p); }, editReply: async p => out.push(p),
  };
  await api.start(i);
  assert.equal(gd.antinuke.logs, "existing-log");
  assert.equal(channels.cache.size, 2);
});
test("Enable/Disable buttons follow the parent state regardless of child preferences", () => {
  const { api, gd } = harness(true);
  const buttons = () => api.build("1", `11_${Date.now()}`, { id: "11" }).toJSON().components
    .filter(c => c.type === discord.ComponentType.ActionRow)[0].components;
  gd.antinuke.events = {}; gd.antiRaid = { enabled: true };
  assert.equal(buttons()[0].disabled, true); assert.equal(buttons()[1].disabled, false);
  gd.antiRaid.enabled = false;
  assert.equal(buttons()[0].disabled, true); assert.equal(buttons()[1].disabled, false);
  gd.antinuke.systemEnabled = gd.antinuke.enabled = false;
  assert.equal(buttons()[0].disabled, false); assert.equal(buttons()[1].disabled, true);
});
test("unauthorized and expired buttons cannot change state", async () => {
  const { api, gd } = harness(false);
  for (const [id, stamp] of [["33", Date.now()], ["11", 0]]) {
    let denied;
    await api.interaction({ guild: {}, user: { id }, customId: `ancfg_panel_enable_${id}_${stamp}`, reply: async p => { denied = p; } });
    assert.equal(denied.flags, 64); assert.equal(gd.antinuke.enabled, false);
  }
});
test("Extra Owners button opens an owner-only add/remove form and saves a valid member", async () => {
  const { api, gd } = harness(false); let modal;
  const owner = { id: "11" };
  const button = { guildId: "1", guild: { ownerId: "11" }, user: owner, customId: `ancfg_panel_owners_11_${Date.now()}`, showModal: async value => { modal = value; }, reply: async payload => { button.response = payload; } };
  await api.interaction(button);
  assert.equal(modal.data.title, "Manage Extra Owners");
  const submit = {
    guildId: "1", guild: { ownerId: "11", members: { fetch: async id => ({ user: { id, bot: false } }) } }, user: owner,
    customId: modal.data.custom_id,
    fields: { getTextInputValue: key => key === "owner_action" ? "add" : "123456789012345678" },
    reply: async payload => { submit.response = payload; },
  };
  await api.interaction(submit);
  assert.deepEqual(gd.extraOwners, ["22", "123456789012345678"]);
  assert.equal(submit.response.flags, 64);
});
