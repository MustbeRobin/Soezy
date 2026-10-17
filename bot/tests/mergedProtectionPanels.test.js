"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const discord = require("discord.js");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const guildId = "123456789012345678";
const user = { id: "123456789012345679", username: "tester" };

function context(data) {
  const emoji = "<:tick:1559236522711187577>";
  const ctx = vm.createContext({ ...discord, console: { log() {}, warn() {} }, module: { exports: {} },
    guildData: () => data, db: { guilds: { [guildId]: data } }, saveDB() {},
    ALL_SYSTEMS: [{ name: "antinuke", linked: ["antiraid"] }, { name: "automod", linked: ["security"] }],
    EMOJIS: new Proxy({ thinking: "<a:thinking:1559656266261995620>" }, { get: (obj, key) => obj[key] || emoji }),
    getEmoji: () => emoji, getPrefix: () => ",", configTitleEmoji: () => emoji,
    panelExpiryFooter: () => "Requested by tester", soezySecurity: null, canManageAntiNuke: () => true,
    createErrorContainer: () => new discord.ContainerBuilder(),
    soezyNativeAutomod: { apiError: error => error.message },
  });
  vm.runInContext(read("utils/featureStateManager.js"), ctx);
  vm.runInContext(read("utils/bulkToggleState.js"), ctx);
  const settings = read("config/settings.js");
  vm.runInContext(settings.slice(settings.indexOf("const ANTINUKE_EVENTS ="), settings.indexOf("const EMOJI_ENABLE")), ctx);
  vm.runInContext(read("utils/antinukePanel.js"), ctx);
  const config = read("utils/embedBuilders/configEmbeds.js");
  vm.runInContext(config.slice(config.indexOf("function securityConfigFeatureList"), config.indexOf("function buildAutoResponderConfigPanel")), ctx);
  const help = read("utils/embedBuilders/helpEmbeds.js");
  vm.runInContext(help.slice(help.indexOf("function getAutomodBulkFeatureState"), help.indexOf("function buildAntiLinkConfigContainer")), ctx);
  return ctx;
}

test("AutoMod bulk actions acknowledge silently and render only the final panel", async () => {
  const source = read("events/interactionCreate.js");
  const start = source.indexOf("        const automodMasterButton = customId.match(");
  const end = source.indexOf("        const securityMasterButton =", start);
  for (const action of ["enableall", "disableall"]) {
    let deferred = 0, edits = 0, calls = 0;
    const ctx = context({ automod: { enabled: false } });
    Object.assign(ctx, {
      customId: `amcfg_${action}_${user.id}_${Date.now()}`,
      getAutomodBulkFeatureState: () => ({ allEnabled: false, allDisabled: false }),
      interaction: { user, guildId, guild: {}, deferUpdate: async () => deferred++, editReply: async () => edits++, update: async () => assert.fail("No intermediate panel") },
      isAuthorizedInteraction: () => true, isSessionOwner: () => true,
      configureAutomodSystem: async (_guild, enabled) => { calls++; assert.equal(enabled, action === "enableall"); return { warnings: [] }; },
      buildSecurityLoadingContainer: () => assert.fail("No loading animation"),
    });
    await vm.runInContext(`(async () => { ${source.slice(start, end)} })()`, ctx);
    assert.deepEqual([deferred, edits, calls], [1, 1, 1]);
  }
});

test("disabled AntiNuke config stays open and lets authorized users edit saved child preferences", async () => {
  const data = { antinuke: { enabled: false, events: { antiban: false } }, antiRaid: { enabled: false } };
  const ctx = context(data);
  let updates = 0, modals = 0;
  for (const action of ["events", "raid"]) {
    await ctx.soezyAntiNukePanel.interaction({ guildId, guild: { id: guildId }, user,
      customId: `ancfg_panel_${action}_${user.id}_${Date.now()}`, values: ["antiban"],
      reply: async () => assert.fail("Authorized configuration should remain available"), update: async () => { updates++; }, showModal: async () => { modals++; },
    });
  }
  assert.equal(data.antinuke.events.antiban, true);
  assert.equal(updates, 1);
  assert.equal(modals, 1);
  assert.equal(data.antinuke.enabled, false);
  assert.equal(data.antiRaid.enabled, false);
});

test("merged AutoMod serializes both feature sets and valid dropdowns", () => {
  const ctx = context({ automod: { enabled: true }, security: { antiPhishing: true, webhookGuard: true,
    joinCaptcha: true, noAvatarGate: true, slowmodeManager: true, slowmodeThresh: 10, slowmodeSeconds: 5, ghostPingDetect: true }, ghostPingLog: { enabled: true } });
  const panel = ctx.buildAutomodConfigContainer(guildId, `${user.id}_${Date.now()}`, user).toJSON();
  const text = JSON.stringify(panel);
  assert.match(text, /Anti-Phishing/);
  assert.match(text, /Webhook Guard/);
  assert.doesNotMatch(text, /Join Captcha|No-Avatar Gate|Slowmode Manager|Ghost Ping Detect/);
  assert.ok(!ctx.securityConfigFeatureList().some(feature => ["captcha", "noavatar", "slowmode", "ghostping"].includes(feature.id)));
  assert.equal("ghostPingLog" in ctx.guildData(guildId), false);
  for (const key of ["joinCaptcha", "noAvatarGate", "slowmodeManager", "slowmodeThresh", "slowmodeSeconds", "ghostPingDetect"]) {
    assert.equal(key in ctx.guildData(guildId).security, false);
  }
  assert.equal((text.match(/> [^\n]*Anti-Caps/g) || []).length > 0, true);
  assert.doesNotMatch(text, /Security Configuration|protection_nav_/);
  const menus = panel.components.flatMap(c => c.components || []).filter(c => c.type === 3);
  assert.equal(menus.length, 2);
  assert.equal(menus[0].options.length, 17);
  assert.doesNotMatch(text, /Protection settings|Core Filters/);
  assert.ok(text.indexOf("Account Age Gate") < text.indexOf("Filter Channels"));
  for (const menu of menus) assert.ok(menu.options.length <= 25);
  assert.ok(!menus[0].options.some(o => /amcfg_(botwhitelist|botunwhitelist|linkdomain|rmlinkdomain|botmanage|domainmanage)_/.test(o.value)));
  assert.ok(menus[1].options.some(o => /amcfg_botmanage_/.test(o.value)));
  assert.ok(menus[1].options.some(o => /amcfg_domainmanage_/.test(o.value)));
  assert.ok(!menus[1].options.some(o => /feature_(anticaps|antiduplicate)_/.test(o.value)));
  assert.ok(menus[0].options.some(o => /secfg_feature_antiphishing_/.test(o.value)));
  assert.ok(menus[0].options.some(o => /amcfg_antispam_/.test(o.value)));
  assert.ok(menus[0].options.some(o => /amcfg_antilink_/.test(o.value)));
  assert.match(menus[0].options.find(o => /amcfg_antilink_/.test(o.value)).label, /Configure Anti-Link/);
  assert.ok(menus[0].options.some(o => /amcfg_antibot_/.test(o.value)));
  assert.match(menus[0].options.find(o => /amcfg_antibot_/.test(o.value)).label, /Configure Anti-Bot/);
  assert.ok(!menus[0].options.some(o => /amcfg_master(enable|disable)_/.test(o.value)));
  assert.ok(menus[0].options.some(o => /amcfg_logs_/.test(o.value)));
  assert.ok(menus[0].options.some(o => /amcfg_messageguards_/.test(o.value)));
  assert.match(menus[0].options.find(o => /amcfg_messageguards_/.test(o.value)).label, /Message Length Limit/);
  assert.doesNotMatch(menus[0].options.find(o => /amcfg_messageguards_/.test(o.value)).label, /Slowmode/);
  assert.ok(menus[0].options.some(o => /amcfg_badwords_/.test(o.value)));
  assert.ok(menus[0].options.some(o => /amcfg_nsfw_/.test(o.value)));
  assert.ok(menus[0].options.some(o => /amcfg_advduplicate_/.test(o.value)));
  assert.ok(menus[0].options.some(o => /Scam & Image Scam Detection/.test(o.label)));
  assert.ok(menus[0].options.some(o => /Configure Invite Protection/.test(o.label)));
  assert.doesNotMatch(text, /Advanced Invite Protection|Image Scam OCR/);
  assert.equal(panel.components.at(-1).type, 1);
  assert.ok(!menus.some(menu => menu.options.some(option => /advpunishment/.test(option.value))));
  const buttons = panel.components.flatMap(c => c.components || []).filter(c => c.type === 2);
  assert.deepEqual(buttons.map(button => button.label), ["Enable", "Disable", "Punishment"]);
  assert.equal(buttons.find(button => button.label === "Enable").emoji.id, "1559236522711187577");
  assert.equal(buttons.find(button => button.label === "Disable").emoji.id, "1559257945030525110");
  assert.ok(menus.every(menu => menu.options.length <= 25));
  assert.ok(menus[0].options.some(option => /amcfg_accountage_/.test(option.value)));
  assert.equal(menus[1].options.length, 22);
});

test("removed security features are absent from the config menu", () => {
  const ctx = context({ automod: { enabled: true }, security: { enabled: true } });
  const menu = ctx.buildSecurityProtectionMenu(guildId, `${user.id}_${Date.now()}`).toJSON();
  const text = JSON.stringify(menu);
  assert.doesNotMatch(text, /Join Captcha|No-Avatar Gate|Slowmode Manager|Ghost Ping Detect|Set Slowmode Spike/);
  assert.ok(!ctx.securityConfigFeatureList().some(feature => ["captcha", "noavatar", "slowmode", "ghostping"].includes(feature.id)));
});

test("AutoMod panel distinguishes native pre-send spam blocking from bot-side filters", () => {
  const data = { automod: { enabled: true }, nativeAutomod: { ruleIds: { filter_spam: "native-rule" } } };
  const ctx = context(data);
  let text = JSON.stringify(ctx.buildAutomodConfigContainer(guildId, `${user.id}_${Date.now()}`, user).toJSON());
  assert.match(text, /Discord Pre-Send Block/);
  assert.match(text, /Spam: native/);
  assert.match(text, /Duplicate: bot fallback/);
  assert.match(text, /Caps: bot fallback/);

  delete data.nativeAutomod.ruleIds.filter_spam;
  data.nativeAutomod.warnings = ["Spam was not changed: an existing server rule occupies its only slot."];
  text = JSON.stringify(ctx.buildAutomodConfigContainer(guildId, `${user.id}_${Date.now()}`, user).toJSON());
  assert.match(text, /Spam: bot fallback/);
  assert.match(text, /Spam Rule Warning/);
});

test("AutoMod parent buttons reflect only parent state and do not depend on child preferences", () => {
  const data = { automod: { enabled: true, antiLink: { enabled: true }, antiSpam: { enabled: true }, antiMassMention: { enabled: true }, antiCaps: { enabled: true }, antiInvite: { enabled: true }, advanced: {
    invite: { enabled: true }, duplicate: { enabled: true }, scams: { enabled: true }, imageScam: { enabled: true },
  } }, antibot: { enabled: true }, badWordEnabled: true, nsfwProtection: true, security: { accountAgeDays: 7 } };
  const ctx = context(data);
  const sec = ctx.getSecurityConfigState(guildId);
  for (const feature of ctx.securityConfigFeatureList().filter(item => !["anticaps", "antiduplicate"].includes(item.id))) sec[feature.key] = true;

  const getButtons = () => ctx.buildAutomodConfigContainer(guildId, `${user.id}_${Date.now()}`, user).toJSON()
    .components.flatMap(row => row.components || []).flatMap(component => component.type === 2 ? [component] : []);
  let buttons = getButtons();
  assert.equal(buttons.find(button => button.label === "Enable").disabled, true);
  assert.equal(buttons.find(button => button.label === "Disable").disabled, false);

  data.automod.enabled = false;
  for (const key of ["antiSpam", "antiMassMention", "antiCaps", "antiInvite"]) data.automod[key].enabled = false;
  data.automod.antiLink.enabled = false;
  data.antibot.enabled = false;
  data.badWordEnabled = false;
  data.nsfwProtection = false;
  for (const key of ["invite", "duplicate", "scams", "imageScam"]) data.automod.advanced[key].enabled = false;
  for (const feature of ctx.securityConfigFeatureList()) sec[feature.key] = false;
  sec.accountAgeDays = 0;
  buttons = getButtons();
  assert.equal(buttons.find(button => button.label === "Enable").disabled, false);
  assert.equal(buttons.find(button => button.label === "Disable").disabled, true);

  data.automod.enabled = true;
  data.automod.antiSpam.enabled = true;
  buttons = getButtons();
  assert.equal(buttons.find(button => button.label === "Enable").disabled, true);
  assert.equal(buttons.find(button => button.label === "Disable").disabled, false);
});

test("AutoMod bulk handlers skip already-satisfied backend synchronization", async () => {
  const enabledConfig = {
    automod: {
      enabled: true,
      antiSpam: { enabled: true }, antiMassMention: { enabled: true },
      antiCaps: { enabled: true }, antiInvite: { enabled: true }, antiLink: { enabled: true },
      advanced: { invite: { enabled: true }, duplicate: { enabled: true }, scams: { enabled: true }, imageScam: { enabled: true } },
    },
    antibot: { enabled: true }, badWordEnabled: true, nsfwProtection: true, security: { accountAgeDays: 7 },
  };
  const ctx = context(enabledConfig);
  const enabledSecurity = ctx.getSecurityConfigState(guildId);
  for (const feature of ctx.securityConfigFeatureList()) enabledSecurity[feature.key] = true;
  const source = read("events/interactionCreate.js");
  const start = source.indexOf("        const automodMasterButton = customId.match(");
  const end = source.indexOf("        const securityMasterButton =", start);
  assert.ok(start >= 0 && end > start);
  let backendCalls = 0, updates = 0;
  Object.assign(ctx, {
    customId: `amcfg_enableall_${user.id}_${Date.now()}`,
    interaction: { user, guildId, update: async () => { updates++; } },
    isAuthorizedInteraction: () => true,
    isSessionOwner: () => true,
    buildAutomodConfigContainer: () => new discord.ContainerBuilder(),
    configureAutomodSystem: async () => { backendCalls++; },
    MessageFlags: discord.MessageFlags,
    createErrorContainer: () => new discord.ContainerBuilder(),
  });
  await vm.runInContext(`(async () => { ${source.slice(start, end)} })()`, ctx);
  assert.equal(backendCalls, 0);
  assert.equal(updates, 1);

  enabledConfig.automod.enabled = false;
  for (const key of ["antiSpam", "antiMassMention", "antiCaps", "antiInvite"]) enabledConfig.automod[key].enabled = false;
  enabledConfig.automod.antiLink.enabled = false;
  enabledConfig.antibot.enabled = false;
  enabledConfig.badWordEnabled = false;
  enabledConfig.nsfwProtection = false;
  for (const key of ["invite", "duplicate", "scams", "imageScam"]) enabledConfig.automod.advanced[key].enabled = false;
  const sec = ctx.getSecurityConfigState(guildId);
  for (const feature of ctx.securityConfigFeatureList()) sec[feature.key] = false;
  sec.accountAgeDays = 0;
  ctx.customId = `amcfg_disableall_${user.id}_${Date.now()}`;
  await vm.runInContext(`(async () => { ${source.slice(start, end)} })()`, ctx);
  assert.equal(backendCalls, 0);
  assert.equal(updates, 2);
});

test("AntiNuke parent buttons preserve event and raid preferences", async () => {
  const data = { antinuke: { enabled: true, events: { antiban: false } }, antiRaid: { enabled: false } };
  const ctx = context(data);
  ctx.require = require("node:module").createRequire(path.join(__dirname, "../index.js"));
  data.antinuke.logs = "logs";
  data.antinuke.whitelistRoleId = "role";
  data.logging = { categoryId: "category" };
  const channels = new Map([
    ["logs", { id: "logs", parentId: "category", isTextBased: () => true }],
    ["category", { id: "category", type: discord.ChannelType.GuildCategory }],
  ]);
  const guild = { id: guildId, channels: { cache: channels }, roles: { cache: new Map([["role", { id: "role" }]]) }, members: { me: { permissions: { has: () => true } } } };
  const interaction = { guildId, guild, user,
    customId: `ancfg_panel_enable_${user.id}_${Date.now()}`, deferUpdate: async () => {}, editReply: async () => {}, update: async () => {}, reply: async () => assert.fail("unexpected reply") };
  await ctx.soezyAntiNukePanel.interaction(interaction);
  assert.equal(data.antiRaid.enabled, false);
  assert.equal(data.antinuke.events.antiban, false);
  const savedEvents = { ...data.antinuke.events };
  interaction.customId = `ancfg_panel_disable_${user.id}_${Date.now()}`;
  await ctx.soezyAntiNukePanel.interaction(interaction);
  assert.equal(data.antiRaid.enabled, false);
  assert.equal(data.antinuke.enabled, false);
  assert.deepEqual(data.antinuke.events, savedEvents);
});

test("AutoMod parent toggle preserves merged protection settings and account age preference", () => {
  const data = { automod: { enabled: true, features: { antiPhishing: { enabled: true }, accountAge: { enabled: true } } }, security: { antiPhishing: true, accountAgeDays: 12 }, accountAge: { enabled: true, minDays: 12 } };
  const ctx = context(data);
  ctx.setFeatureState(guildId, "automod", false, { sync: false });
  assert.equal(data.automod.systemEnabled, false);
  assert.equal(data.security.antiPhishing, true);
  assert.equal(data.security.accountAgeDays, 12);
  assert.equal(data.accountAge.enabled, true);
  ctx.setFeatureState(guildId, "automod", true, { sync: false });
  assert.equal(data.security.accountAgeDays, 12);
  assert.equal(data.security.antiPhishing, true);
  assert.equal(data.accountAge.enabled, true);
});

test("merged Security dropdown toggles in place without setup or confirmation", async () => {
  const data = { automod: { enabled: true }, security: { antiPhishing: false } };
  const ctx = context(data);
  const source = read("events/interactionCreate.js");
  const start = source.indexOf('          if (action.startsWith("feature_"))');
  const end = source.indexOf('          if (action === "setcaps")', start);
  const updates = [];
  Object.assign(ctx, { action: "feature_antiphishing", gId: guildId, sec: data.security,
    interaction: { user, update: async payload => updates.push(payload) } });
  await vm.runInContext(`(async () => { ${source.slice(start, end)} })()`, ctx);
  assert.equal(data.security.antiPhishing, true);
  assert.equal(updates.length, 1);
  assert.match(JSON.stringify(updates[0]), /AutoMod Configuration/);
  await vm.runInContext(`(async () => { ${source.slice(start, end)} })()`, ctx);
  assert.equal(data.security.antiPhishing, false);
});

test("AntiNuke groups related events and includes raid settings", () => {
  const ctx = context({ antinuke: { enabled: true, events: {} }, antiRaid: { enabled: true, threshold: 12 } });
  const panel = ctx.soezyAntiNukePanel.build(guildId, `${user.id}_${Date.now()}`, user).toJSON();
  const text = JSON.stringify(panel);
  assert.match(text, /Anti Channel Create\/Delete\/Update/);
  assert.match(text, /Anti Raid · ON · Active · 12 joins/);
  assert.match(text, /Raid Settings/);
  assert.doesNotMatch(text, /Anti Everyone\/Here Ping|Anti Role Ping/);
  const enable = panel.components.flatMap(row => row.components || []).find(item => item.custom_id?.startsWith("ancfg_panel_enable_"));
  assert.equal(enable.disabled, true);
  const menu = panel.components.flatMap(row => row.components || []).find(item => item.type === 3);
  assert.ok(menu.options.some(option => option.value === "channels"));
  assert.ok(menu.options.some(option => option.value === "antiraid"));
  assert.ok(!menu.options.some(option => option.value === "antichannelcreate"));
  for (const row of panel.components) for (const component of row.components || []) {
    if (component.type === 3) assert.ok(component.options.length <= 25);
  }
});

test("master switches control merged backends and retain protection settings", () => {
  const data = { automod: { enabled: false }, security: { antiPhishing: true }, antiRaid: { threshold: 23, interval: 9000 } };
  const ctx = context(data);
  ctx.setFeatureState(guildId, "automod", true, { linked: false });
  assert.equal(ctx.getFeatureState(guildId, "security"), true);
  data.automod.antiCaps.enabled = false;
  ctx.getFeatureState(guildId, "security");
  assert.equal(data.automod.antiCaps.enabled, false);
  ctx.setFeatureState(guildId, "automod", false, { linked: false });
  assert.equal(ctx.getFeatureState(guildId, "security"), false);
  assert.equal(data.security.antiPhishing, true);
  ctx.setFeatureState(guildId, "antinuke", true);
  assert.equal(data.antiRaid.enabled, true);
  ctx.setFeatureState(guildId, "antinuke", false);
  assert.equal(data.antiRaid.enabled, false);
  assert.equal(data.antiRaid.threshold, 23);
  assert.equal(data.antiRaid.interval, 9000);
});

test("raid modal rejects invalid settings before modifying configuration", async () => {
  const data = { antinuke: { enabled: true }, antiRaid: { threshold: 10 } };
  const ctx = context(data);
  let replied = false;
  await ctx.soezyAntiNukePanel.interaction({ customId: `ancfg_raid_modal_${user.id}_${Date.now()}`, guildId, user,
    guild: { channels: { cache: new Map() } },
    fields: { getTextInputValue: key => ({ raid_enabled: "on", raid_threshold: "1", raid_interval: "10", raid_action: "ban", raid_logs: "" })[key] },
    reply: async () => { replied = true; },
  });
  assert.equal(replied, true);
  assert.equal(data.antiRaid.threshold, 10);
});

test("separate Security and AntiRaid commands are retired", () => {
  const { loadCommandCollection } = require("../commands/registry");
  const commands = loadCommandCollection();
  assert.equal(commands.has("security"), false);
  assert.equal(commands.has("antiraid"), false);
  assert.ok(commands.has("antinuke"));
  assert.ok(commands.has("automod"));
});

test("grouped AntiNuke selection toggles every event in the group", async () => {
  const data = { antinuke: { enabled: true, events: { antichannelcreate: false } } };
  const ctx = context(data);
  const interaction = { customId: `ancfg_panel_events_${user.id}_${Date.now()}`, guildId, user, guild: {}, values: ["channels"], update: async () => {} };
  await ctx.soezyAntiNukePanel.interaction(interaction);
  for (const key of ["antichannelcreate", "antichanneldelete", "antichannelupdate"]) assert.equal(data.antinuke.events[key], true);
  await ctx.soezyAntiNukePanel.interaction(interaction);
  for (const key of ["antichannelcreate", "antichanneldelete", "antichannelupdate"]) assert.equal(data.antinuke.events[key], false);
});

test("configuration footer cleanup preserves other messages and warnings", () => {
  const { trimConfigDropdownFooter } = require("../utils/configPanelLayout");
  const panel = { type: 17, components: [
    { type: 10, content: "## Logging Configuration" },
    { type: 14 },
    { type: 1, components: [{ type: 3 }] },
    { type: 14 },
    { type: 10, content: "-# Requested by tester | Expires soon" },
  ] };
  assert.equal(trimConfigDropdownFooter(panel).components.length, 3);
  assert.equal(panel.components.length, 5);
  const help = { ...panel, components: [{ type: 10, content: "## Help" }, ...panel.components.slice(1)] };
  assert.equal(trimConfigDropdownFooter(help), help);
  const warning = { ...panel, components: [...panel.components.slice(0, 3), { type: 10, content: "-# Some native protections need attention" }] };
  assert.equal(trimConfigDropdownFooter(warning), warning);
});
