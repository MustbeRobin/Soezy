"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { buildFilterRules, lengthPattern } = require("../utils/nativeFilterRules");
const service = require("../utils/nativeAutomodService");

test("length boundary includes newlines and Unicode code points", () => {
  const regex = new RegExp(lengthPattern(100).replace("(?s)", ""), "su");
  for (const text of ["a".repeat(100), "\n".repeat(100), "\u{1F600}".repeat(100)]) assert.equal(regex.test(text), false);
  for (const text of ["a".repeat(101), "\n".repeat(101), "\u{1F600}".repeat(101)]) assert.equal(regex.test(text), true);
  for (const limit of [0, -1, 1.2, 4001, NaN]) assert.throws(() => lengthPattern(limit));
});
test("exceptions and channel overrides are preserved", () => {
  const rules = buildFilterRules({ automod: { enabled: true }, badWordEnabled: false, security: { messageLimit: 100, channelMaxLength: { a: 200 } }, antilink: { enabled: true, immuneRoles: ["role"] } }, ["a", "b"]);
  assert.equal(rules.find(r => r.key === "links"), undefined);
  assert.deepEqual(rules.find(r => r.key === "length").exemptChannels, ["a"]);
  assert.deepEqual(rules.find(r => r.key === "length200").exemptChannels, ["b"]);
  assert.doesNotThrow(() => buildFilterRules({ antilink: { enabled: true, whitelist: ["example.com"] } }, []));
});
test("sync blocks, updates without duplicates, and removes disabled filters", async () => {
  let count = 0;
  const store = new Map();
  const gd = { badWordEnabled: true, customBadWords: ["bad"], nsfwProtection: true, customNsfwWords: ["adult"], antilink: { enabled: true }, automod: { enabled: true, scams: { enabled: false }, antiMassMention: { enabled: true, maxMentions: 5 } }, security: { messageLimit: 100, antiZalgo: false, antiEveryoneBP: false } };
  gd.badWordConfig = { action: "block" };
  gd.automod.punishment = "block";
  gd.nsfwConfig = { action: "block" };
  const guild = { id: "guild", client: { user: { id: "bot" } }, channels: { fetch: async () => new Map() }, autoModerationRules: {
    fetch: async () => store,
    create: async payload => {
      const rule = { ...payload, creatorId: "bot", id: String(++count), edit: async update => { Object.assign(rule, update); return rule; }, delete: async () => store.delete(rule.id) };
      store.set(rule.id, rule);
      return rule;
    },
  } };
  const deps = { guildData: () => gd, saveDB: () => {} };
  await service.setup(guild, deps);
  assert.equal(store.size, 4);
  for (const rule of store.values()) {
    assert.equal(rule.actions[0].type, 1);
    assert.equal(rule.actions[0].metadata, undefined);
  }
  await service.syncFilters(guild, deps);
  assert.equal(count, 4);
  gd.antilink.enabled = false;
  await service.syncFilters(guild, deps);
  assert.equal(store.size, 4);
  assert.equal(gd.nativeAutomod.syncEnabled, true);
});

test("managed keyword rules stay inactive while AutoMod is off and return on parent enable", async () => {
  const h = filterHarness({ automod: { systemEnabled: false, enabled: false }, nativeAutomod: {} });
  const added = await service.addKeyword(h.guild, h.deps, "blocked phrase");
  assert.equal(added.result.operation, "deferred");
  assert.equal(h.rules.size, 0);
  assert.deepEqual(h.gd.nativeAutomod.keywords, ["blocked phrase"]);

  h.gd.automod.systemEnabled = h.gd.automod.enabled = true;
  await service.syncFilters(h.guild, h.deps);
  const rule = [...h.rules.values()].find(item => item.name.endsWith("Keywords"));
  assert.ok(rule);
  assert.equal(rule.enabled, true);

  h.gd.automod.systemEnabled = h.gd.automod.enabled = false;
  await service.syncFilters(h.guild, h.deps);
  assert.equal(rule.enabled, false);
  await assert.rejects(service.setRuleEnabled(h.guild, h.deps, rule.id, true), /AutoMod is disabled/);
});

test("explicit AutoMod disable keeps keyword and message-length rules off on re-enable", async () => {
  const { disableAutoModFeatures } = require("../utils/securityDisableFeatures");
  const h = filterHarness({ automod: { systemEnabled: true, enabled: true }, security: { messageLimit: 100, channelMaxLength: { channel: 200 } }, nativeAutomod: {} });
  await service.addKeyword(h.guild, h.deps, "blocked phrase");
  await service.syncFilters(h.guild, h.deps);
  const rule = [...h.rules.values()].find(item => item.name.endsWith("Keywords"));
  assert.equal(rule.enabled, true);
  disableAutoModFeatures(h.gd);
  h.gd.automod.systemEnabled = h.gd.automod.enabled = false;
  await service.syncFilters(h.guild, h.deps);
  h.gd.automod.systemEnabled = h.gd.automod.enabled = true;
  await service.syncFilters(h.guild, h.deps);
  assert.equal(rule.enabled, false);
  assert.deepEqual(h.gd.nativeAutomod.keywords, ["blocked phrase"]);
  assert.equal(h.gd.security.messageLimit, 100);
  assert.deepEqual(h.gd.security.channelMaxLength, { channel: 200 });
  assert.equal([...h.rules.values()].some(item => /Message Length/.test(item.name)), false);
  await service.addKeyword(h.guild, h.deps, "another phrase");
  assert.equal(rule.enabled, true);
  await service.setMessageLimit(h.guild, h.deps, 100);
  assert.equal(h.gd.security.messageLengthEnabled, true);
});

test("full setup with explicit block punishments covers every native trigger type", async () => {
  const gd = {
    badWordEnabled: true, nsfwProtection: true,
    badWordConfig: { action: "block" }, nsfwConfig: { action: "block" },
    automod: { enabled: true, punishment: "block", antiSpam: { enabled: true }, antiMassMention: { enabled: true, maxMentions: 5 }, antiCaps: { enabled: true }, antiInvite: { enabled: true }, advanced: { duplicate: { enabled: true }, invite: { enabled: true }, scams: { enabled: true } } },
    security: { antiZalgo: true, antiEveryoneBP: true }, nativeAutomod: { protections: { presets: true, profiles: true } },
  };
  const rules = new Map();
  let created = 0;
  const guild = { id: "full", client: { user: { id: "bot" } }, channels: { fetch: async () => new Map() }, autoModerationRules: {
    fetch: async () => rules,
    create: async payload => {
      const rule = { ...payload, id: String(++created), creatorId: "bot", edit: async update => { Object.assign(rule, update); return rule; }, delete: async () => rules.delete(rule.id) };
      rules.set(rule.id, rule);
      return rule;
    },
  } };
  const deps = { guildData: () => gd, saveDB() {}, words: { badWords: ["bad"], nsfwWords: ["adult"] } };
  const result = await service.setupAll(guild, deps);
  assert.ok(result.filters > 0);
  assert.equal(gd.security.messageLimit, undefined);
  assert.equal(gd.automod.antiMassMention.maxMentions, 5);
  assert.deepEqual([...new Set([...rules.values()].map(r => r.triggerType))].sort(), [1, 3, 4, 5, 6]);
  const profile = [...rules.values()].find(r => r.triggerType === 6);
  assert.equal(profile.eventType, 2);
  assert.deepEqual(profile.actions, [{ type: 4 }]);
  assert.deepEqual([...rules.values()].find(r => r.triggerType === 4).triggerMetadata.presets, [1, 2, 3]);
  const createdBefore = created;
  await service.setupAll(guild, deps);
  assert.equal(created, createdBefore);
});

test("native caps, mention, Zalgo, duplicate, and everyone rules block before posting", async () => {
  const gd = {
    automod: {
      enabled: true,
      punishment: "warn",
      antiSpam: { enabled: true },
      antiMassMention: { enabled: true, maxMentions: 5 },
      antiCaps: { enabled: true, minLength: 10, percentage: 70 },
      advanced: { duplicate: { enabled: true } },
    },
    security: { antiZalgo: true, antiEveryoneBP: true },
    nativeAutomod: { protections: { everyone: true } },
  };
  const h = filterHarness(gd);
  await service.syncFilters(h.guild, h.deps);
  const ids = gd.nativeAutomod.ruleIds;
  for (const key of ["spam", "duplicate", "mentions", "caps", "zalgo", "everyone"]) assert.ok(ids[`filter_${key}`], `${key} rule id is saved`);
  for (const rule of h.rules.values()) assert.equal(rule.actions[0].type, 1);

  const keywordRules = [...h.rules.values()].filter(rule => rule.triggerType === require("discord.js").AutoModerationRuleTriggerType.Keyword);
  const regexPatterns = keywordRules.flatMap(rule => rule.triggerMetadata.regexPatterns || []);
  assert.ok(regexPatterns.some(pattern => pattern.includes("(?-i)")));
  assert.ok(regexPatterns.some(pattern => pattern.includes("\\p{M}")));
  assert.ok(regexPatterns.some(pattern => pattern.includes("every\\s*one") && pattern.includes("here")));
  assert.ok(regexPatterns.every(pattern => pattern.length <= 75));

  const { capsPattern } = require("../utils/nativeFilterRules");
  const caps = new RegExp(capsPattern(10, 70).slice(5));
  assert.equal(caps.test("THIS IS A SHOUT"), true);
  assert.equal(caps.test("this is a normal message"), false);
  const zalgo = new RegExp("\\p{M}{3,}", "u");
  assert.equal(zalgo.test("a\u0301\u0302\u0303"), true);
  const everyone = new RegExp("@[\\p{Cf}\\p{Zs}\\u180e]*(?:every\\s*one|here)\\b", "u");
  assert.equal(everyone.test("@everyone"), true);
  assert.equal(everyone.test("@\u200beveryone"), true);
  assert.equal(everyone.test("@here"), true);

  await service.setCaps(h.guild, h.deps, { enabled: false });
  assert.equal(gd.nativeAutomod.ruleIds.filter_caps, undefined);
  assert.equal(h.rules.size, 3);
});

test("full keyword quota skips only rules that cannot fit and keeps other native protections", async () => {
  const gd = { security: { antiZalgo: false, antiEveryoneBP: false }, automod: { enabled: true, punishment: "block", antiSpam: { enabled: true }, antiInvite: { enabled: true }, scams: { enabled: true } } };
  const { AutoModerationRuleTriggerType: Trigger } = require("discord.js");
  const external = new Map(Array.from({ length: 6 }, (_, index) => [String(index), { id: String(index), creatorId: "other", triggerType: Trigger.Keyword }]));
  const created = [];
  const guild = { id: "keyword-full", client: { user: { id: "bot" } }, channels: { fetch: async () => new Map() }, autoModerationRules: {
    fetch: async () => external,
    create: async payload => { created.push(payload); return { ...payload, id: "soezy", creatorId: "bot" }; },
  } };
  const result = await service.syncFilters(guild, { guildData: () => gd, saveDB() {} });
  assert.equal(created.length, 1);
  assert.equal(created[0].triggerType, Trigger.Spam);
  assert.match(gd.nativeAutomod.warnings.join(" "), /AutoMod Discord Invites not installed/);
});

test("compatible invite and link regex protections share one available Discord keyword slot", async () => {
  const gd = { security: { antiZalgo: false, antiEveryoneBP: false }, automod: { enabled: true, punishment: "block", scams: { enabled: false }, antiInvite: { enabled: true }, antiLink: { enabled: true } } };
  const { AutoModerationRuleTriggerType: Trigger } = require("discord.js");
  const external = new Map(Array.from({ length: 5 }, (_, index) => [String(index), { id: String(index), creatorId: "other", triggerType: Trigger.Keyword }]));
  const created = [];
  const guild = { id: "regex-room", client: { user: { id: "bot" } }, channels: { fetch: async () => new Map() }, autoModerationRules: {
    fetch: async () => external,
    create: async payload => { created.push(payload); return { ...payload, id: "soezy", creatorId: "bot" }; },
  } };
  const result = await service.syncFilters(guild, { guildData: () => gd, saveDB() {} });
  assert.equal(result, 1);
  assert.equal(created.length, 1);
  assert.equal(created[0].name, `${service.MANAGED_PREFIX} Filter AutoMod Links and Invites`);
  assert.equal(created[0].triggerMetadata.regexPatterns.length, 2);
  assert.deepEqual(gd.nativeAutomod.warnings, []);
});

test("full setup skips occupied preset slots and installs the remaining protections", async () => {
  const gd = { badWordEnabled: true, badWordConfig: { action: "block" }, security: { messageLimit: 250 }, automod: { enabled: true, punishment: "block" }, nativeAutomod: { protections: { presets: true } } };
  let created = 0;
  const guild = { id: "conflict", client: { user: { id: "bot" } }, channels: { fetch: async () => new Map() }, autoModerationRules: {
    fetch: async () => new Map([["existing", { id: "existing", name: "Server presets", creatorId: "admin", triggerType: 4 }]]),
    create: async payload => ({ ...payload, id: String(++created) }),
  } };
  await service.setupAll(guild, { guildData: () => gd, saveDB() {} });
  assert.ok(created > 0);
  assert.match(gd.nativeAutomod.warnings[0], /KeywordPreset/);
  assert.equal(gd.nativeAutomod.syncEnabled, true);
});

test("legacy Soezy mention rule is reused without delete or duplicate creation", async () => {
  const gd = { badWordEnabled: false, security: { antiZalgo: false, antiEveryoneBP: false }, automod: { enabled: true, scams: { enabled: false }, antiMassMention: { enabled: true, maxMentions: 5 } } };
  gd.automod.punishment = "block";
  let edits = 0;
  const rule = { id: "old", creatorId: "bot", name: `${service.MANAGED_PREFIX} Mention Spam`, triggerType: 5,
    edit: async payload => { edits++; Object.assign(rule, payload); return rule; },
    delete: async () => assert.fail("Must not delete the existing mention rule"),
  };
  const guild = { id: "legacy", client: { user: { id: "bot" } }, channels: { fetch: async () => new Map() }, autoModerationRules: {
    fetch: async () => new Map([[rule.id, rule]]), create: async () => assert.fail("Must reuse the mention slot"),
  } };
  await service.setup(guild, { guildData: () => gd, saveDB() {} });
  assert.equal(edits, 1);
  assert.equal(rule.actions[0].type, 1);
  assert.equal(rule.actions[0].metadata, undefined);
  assert.deepEqual(gd.nativeAutomod.warnings, []);
});

test("another creator's mention rule is preserved; domain-aware Anti-Link stays in the bot handler", async () => {
  const gd = { badWordEnabled: false, antilink: { enabled: true }, security: { antiZalgo: false, antiEveryoneBP: false }, automod: { enabled: true, scams: { enabled: false }, antiMassMention: { enabled: true, maxMentions: 5 } } };
  gd.automod.punishment = "block";
  const created = [];
  const guild = { id: "links", client: { user: { id: "bot" } }, channels: { fetch: async () => new Map() }, autoModerationRules: {
    fetch: async () => new Map([["external", { id: "external", name: "Mention protection", creatorId: "admin", triggerType: 5 }]]),
    create: async payload => { created.push(payload); return { ...payload, id: "link-rule" }; },
  } };
  await service.setup(guild, { guildData: () => gd, saveDB() {} });
  assert.equal(created.length, 0);
  assert.match(gd.nativeAutomod.warnings[0], /MentionSpam/);
});

function filterHarness(gd) {
  gd.automod ||= {};
  if (typeof gd.automod.systemEnabled !== "boolean" && typeof gd.automod.enabled !== "boolean") gd.automod.enabled = true;
  const rules = new Map();
  let created = 0;
  const guild = { id: "test", client: { user: { id: "bot" } }, channels: { fetch: async () => new Map() }, autoModerationRules: {
    fetch: async () => rules,
    create: async payload => {
      const rule = { ...payload, id: String(++created), creatorId: "bot",
        edit: async update => { Object.assign(rule, update); return rule; }, delete: async () => rules.delete(rule.id) };
      rules.set(rule.id, rule);
      return rule;
    },
  } };
  const deps = { guildData: () => gd, saveDB() {}, words: { badWords: ["bad"], nsfwWords: ["adult"] } };
  return { gd, rules, guild, deps };
}

test("word rules require explicit block, including presets and profile words", () => {
  for (const action of [undefined, "timeout", "ban", "kick", "warn", "delete"]) {
    const gd = { automod: { enabled: true }, badWordEnabled: true, nsfwProtection: true, badWordConfig: { action }, nsfwConfig: { action }, nativeAutomod: { protections: { presets: true, profiles: true } } };
    assert.deepEqual(buildFilterRules(gd, [], { badWords: ["bad"], nsfwWords: ["adult"] }), []);
  }
  const gd = { automod: { enabled: true }, badWordEnabled: true, nsfwProtection: true, badWordConfig: { action: "timeout" }, nsfwConfig: { action: "block" }, nsfwImmuneRoles: ["safe"], nativeAutomod: { protections: { presets: true, profiles: true } } };
  const plans = buildFilterRules(gd, [], { badWords: ["bad"], nsfwWords: ["adult"] });
  assert.deepEqual(plans.map(p => p.key), ["presets", "profiles", "nsfw"]);
  assert.deepEqual(plans[0].triggerMetadata.presets, [2]);
  assert.deepEqual(plans[1].triggerMetadata.keywordFilter, ["adult"]);
  assert.ok(plans.every(p => p.exemptRoles.includes("safe")));
});

test("changing block to timeout/ban removes native word rules without changing durations", async () => {
  const h = filterHarness({ badWordEnabled: true, nsfwProtection: true,
    badWordConfig: { action: "block", timeoutMinutes: 12 }, nsfwConfig: { action: "block", timeoutDays: 3 },
    nativeAutomod: { protections: { presets: true, profiles: true } } });
  await service.setup(h.guild, h.deps);
  assert.equal(h.rules.size, 4);
  await service.setWordFilter(h.guild, h.deps, "badword", { action: "timeout" });
  assert.equal(h.gd.badWordConfig.timeoutMinutes, 12);
  assert.equal(h.gd.badWordConfig.action, "timeout");
  assert.ok(![...h.rules.values()].some(r => r.name.endsWith("Bad Words")));
  assert.deepEqual([...h.rules.values()].find(r => r.triggerType === 4).triggerMetadata.presets, [2]);
  await service.setWordFilter(h.guild, h.deps, "nsfw", { action: "ban" });
  assert.equal(h.rules.size, 0);
  assert.deepEqual(h.gd.nativeAutomod.ruleIds, {});
  assert.equal(h.gd.nsfwConfig.action, "ban");
  assert.equal(h.gd.nsfwConfig.timeoutDays, 3);
  await service.setWordFilter(h.guild, h.deps, "badword", { action: "block" });
  assert.equal(h.rules.size, 3);
  await service.setWordFilter(h.guild, h.deps, "badword", { enabled: false });
  assert.equal(h.rules.size, 0);
});

test("timeout and ban do not require native AutoMod permissions when no rules exist", async () => {
  const gd = { badWordConfig: { action: "timeout" } };
  await service.setWordFilter({ id: "plain" }, { guildData: () => gd, saveDB() {} }, "badword", { action: "ban", enabled: true });
  assert.equal(gd.badWordConfig.action, "ban");
  assert.equal(gd.badWordEnabled, true);
  assert.equal(gd.nativeAutomod, undefined);
});

test("failed punishment changes restore the previous configuration and report the API error", async () => {
  const h = filterHarness({ badWordEnabled: true, badWordConfig: { action: "block" } });
  await service.setup(h.guild, h.deps);
  h.rules.values().next().value.delete = async () => { throw Object.assign(new Error("Missing permissions"), { code: 50013 }); };
  await assert.rejects(service.setWordFilter(h.guild, h.deps, "badword", { action: "ban" }));
  assert.equal(h.gd.badWordConfig.action, "block");
  assert.match(h.gd.nativeAutomod.lastError, /Manage Server/);
});

test("mention commands share one configuration and disabling removes legacy rules", async () => {
  const h = filterHarness({ badWordEnabled: false, security: { antiZalgo: false, antiEveryoneBP: false }, automod: { punishment: "block", scams: { enabled: false } } });
  await service.setMentions(h.guild, h.deps, { enabled: true, limit: 7 });
  const rule = [...h.rules.values()][0];
  assert.equal(h.gd.automod.antiMassMention.maxMentions, 7);
  await service.setMentions(h.guild, h.deps, { limit: 3 });
  assert.equal(h.rules.size, 1);
  assert.equal(rule.triggerMetadata.mentionTotalLimit, 3);
  rule.name = `${service.MANAGED_PREFIX} Mention Spam`;
  h.gd.nativeAutomod.ruleIds.mentions = rule.id;
  await service.setMentions(h.guild, h.deps, { enabled: false });
  assert.equal(h.rules.size, 0);
  assert.deepEqual(h.gd.nativeAutomod.ruleIds, {});
});

test("full setup preserves timeout and ban punishments instead of silently installing word blocks", async () => {
  const h = filterHarness({ badWordConfig: { action: "timeout" }, nsfwConfig: { action: "ban" } });
  await service.setupAll(h.guild, h.deps);
  assert.equal(h.gd.badWordConfig.action, "timeout");
  assert.equal(h.gd.nsfwConfig.action, "ban");
  assert.ok(![...h.rules.values()].some(r => /Words|Presets|Profiles/.test(r.name)));
});

test("security message limits enable native sync and share channel overrides", async () => {
  const h = filterHarness({ security: { enabled: true, channelMaxLength: { one: 200 } } });
  h.guild.channels.fetch = async () => new Map([["one", { id: "one" }], ["two", { id: "two" }]]);
  await service.setMessageLimit(h.guild, h.deps, 100);
  assert.equal(h.gd.nativeAutomod.syncEnabled, true);
  assert.equal(h.gd.security.messageLimit, 100);
  assert.equal(h.rules.size, 2);
  await service.setMessageLimit(h.guild, h.deps, 0, "one");
  assert.equal(h.rules.size, 1);
  assert.equal(h.gd.security.channelMaxLength.one, undefined);
  assert.equal(h.gd.security.messageLimit, 100);
  await service.setMessageLimit(h.guild, h.deps, 0);
  assert.equal(h.rules.size, 0);
});

test("bounded burst of native AutoMod sync requests stays serialized per guild", async t => {
  const requestCount = 120;
  let fetchCount = 0;
  let activeFetches = 0;
  let maxActiveFetches = 0;
  const gd = { automod: { enabled: false }, nativeAutomod: {} };
  const guild = {
    id: "native-sync-burst",
    client: { user: { id: "bot" } },
    autoModerationRules: {
      fetch: async () => {
        fetchCount++;
        activeFetches++;
        maxActiveFetches = Math.max(maxActiveFetches, activeFetches);
        await new Promise(resolve => setImmediate(resolve));
        activeFetches--;
        return new Map();
      }
    }
  };
  const deps = { guildData: () => gd, saveDB() {} };
  const started = performance.now();
  await Promise.all(Array.from({ length: requestCount }, () => service.syncFilters(guild, deps)));
  const elapsedMs = performance.now() - started;

  assert.equal(fetchCount, requestCount);
  assert.equal(maxActiveFetches, 1);
  assert.equal(activeFetches, 0);
  t.diagnostic(JSON.stringify({ requests: requestCount, concurrency: requestCount, maxDiscordOperationsPerGuild: maxActiveFetches, elapsedMs: Number(elapsedMs.toFixed(2)), discord: "mock API" }));
});
