"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildFilterRules } = require("../utils/nativeFilterRules");
test("category block installs native spam without hidden setup flags and retains filter exemptions", () => {
  const plans = buildFilterRules({ security: { antiZalgo: false, antiEveryoneBP: false }, automod: { enabled: true, punishment: "warn", punishments: { spam: "block", mentions: "block", invite: "block" }, antiSpam: { enabled: true, whitelistChannels: ["spam-room"] }, antiMassMention: { enabled: true }, antiInvite: { enabled: true, whitelistChannels: ["invites"] }, whitelistRoles: ["trusted"] } }, []);
  assert.deepEqual(plans.map(p => p.triggerType).sort(), [1, 3, 5]);
  assert.deepEqual(plans.find(p => p.key === "spam").exemptChannels, ["spam-room"]);
  assert.deepEqual(plans.find(p => p.key === "automod-invites").exemptChannels, ["invites"]);
  assert.ok(plans.every(p => p.exemptRoles.includes("trusted")));
});
test("duplicate-only block maps to Discord's native spam trigger", () => {
  const plans = buildFilterRules({ security: { antiZalgo: false, antiEveryoneBP: false }, automod: { enabled: true, punishments: { duplicate: "block" }, antiSpam: { enabled: false }, advanced: { duplicate: { enabled: true } } } }, []);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].key, "duplicate");
  assert.equal(plans[0].triggerType, require("discord.js").AutoModerationRuleTriggerType.Spam);
});
test("native spam and mention protections always use Discord message blocking", () => {
  const plans = buildFilterRules({ automod: { enabled: true, punishment: "block", punishments: { spam: "timeout", mentions: "ban", invite: "warn" }, antiSpam: { enabled: true }, antiMassMention: { enabled: true }, antiInvite: { enabled: true }, scams: { enabled: false } } }, []);
  assert.ok(plans.some(rule => rule.key === "spam"));
  assert.ok(plans.some(rule => rule.key === "mentions"));
  assert.equal(plans.some(rule => rule.key === "automod-invites"), false);
});
test("native spam and duplicate protections do not inherit bot-side punishment actions", () => {
  const punishment = require("../utils/automodPunishment");
  const gd = { automod: { enabled: true, punishment: "block", antiSpam: { enabled: true }, advanced: { duplicate: { enabled: true } } } };
  punishment.set(gd.automod, "spam", "timeout");
  punishment.set(gd.automod, "duplicate", "timeout");
  assert.equal(punishment.resolve(gd.automod, "spam"), "timeout");
  assert.equal(punishment.resolve(gd.automod, "duplicate"), "timeout");
  assert.equal(buildFilterRules(gd, []).some(rule => rule.key === "spam+duplicate"), true);
});
test("native links preserve domain exceptions by falling back when configured", () => {
  const gd = { security: { antiZalgo: false, antiEveryoneBP: false }, automod: { enabled: true, punishment: "block", antiLink: { enabled: true }, scams: { enabled: false } } };
  assert.ok(buildFilterRules(gd, []).some(p => p.key === "automod-links"));
  gd.automod.antiLink.allowedDomains = ["example.com"];
  assert.equal(buildFilterRules(gd, []).length, 0);
});
test("exact configured scam phrases use Discord's native block filter", () => {
  const [rule] = buildFilterRules({ security: { antiZalgo: false, antiEveryoneBP: false }, automod: { enabled: true, punishment: "warn", punishments: { scams: "block" }, advanced: { scams: { enabled: true } }, scams: { enabled: true, phrases: ["claim your prize"] } } }, []);
  assert.equal(rule.key, "scam-phrases");
  assert.deepEqual(rule.triggerMetadata.keywordFilter, ["claim your prize"]);
});

test("missing advanced toggles fail closed instead of enabling implicit protection", async () => {
  const manager = require("../handlers/automod/automodManager");
  const gd = { automod: { enabled: true, punishment: "ban" } };
  const message = {
    id: `missing-toggle-${Date.now()}`, guildId: `g-missing-toggle-${Date.now()}`, channelId: "c",
    content: "https://discord.gg/example", embeds: [], author: { id: "u" },
    member: { roles: { cache: new Map() }, ban: async () => assert.fail("Implicit feature toggle must not punish") },
    guild: { id: "g" }, channel: { send: async () => assert.fail("Implicit feature toggle must not notify") },
    delete: async () => assert.fail("Implicit feature toggle must not delete"),
  };
  assert.equal(await manager.handleMessage(message, { guildData: () => gd, saveDB() {} }), false);
  assert.equal(manager.ensureConfig(message.guildId, { guildData: () => gd }).invite.enabled, false);
  assert.equal(manager.ensureConfig(message.guildId, { guildData: () => gd }).duplicate.enabled, false);
  assert.equal(manager.ensureConfig(message.guildId, { guildData: () => gd }).scams.enabled, false);
  assert.equal(manager.ensureConfig(message.guildId, { guildData: () => gd }).imageScam.enabled, false);
});

test("the invite feature toggle writes the shared AutoMod configuration", async () => {
  const manager = require("../handlers/automod/automodManager");
  const gd = { automod: { enabled: true } };
  const guildId = `g-invite-toggle-${Date.now()}`;
  await manager.setFeature(guildId, "invite", true, { guildData: () => gd, saveDB() {} });
  assert.equal(gd.automod.antiInvite.enabled, true);
  assert.equal(gd.automod.advanced.invite.enabled, true);
});

test("global block does not install an unconfigured scam rule", () => {
  const plans = buildFilterRules({ automod: { enabled: true, punishment: "block" } }, []);
  assert.equal(plans.some(plan => plan.key === "scam-phrases"), false);
});
test("advanced block deletes silently without a public notice or escalating punishment", async () => {
  const manager = require("../handlers/automod/automodManager");
  const gd = { automod: { enabled: true, punishment: "ban", punishments: { invite: "block" }, antiInvite: { enabled: true } } };
  let deleted = 0;
  const message = { id: "m", guildId: "g", channelId: "c", content: "https://discord.gg/test", embeds: [],
    author: { id: "u" }, member: { roles: { cache: new Map() }, ban: async () => assert.fail("No ban for block") },
    guild: { id: "g" }, channel: { send: async () => assert.fail("No public block notice") }, delete: async () => deleted++,
  };
  assert.equal(await manager.handleMessage(message, { guildData: () => gd, saveDB() {} }), true);
  assert.equal(deleted, 1);
});

test("AutoMod timeout reports success only when Discord accepts it and checks hierarchy first", async () => {
  const manager = require("../handlers/automod/automodManager");
  const calls = [];
  const member = { id: "member", moderatable: true, timeout: async (duration, reason) => { calls.push({ duration, reason }); } };
  const message = { member, author: { id: member.id }, guild: { members: { fetch: async () => member } } };
  assert.equal(await manager.applyAction(message, "timeout", "spam", 60_000), true);
  assert.deepEqual(calls, [{ duration: 60_000, reason: "spam" }]);

  member.moderatable = false;
  assert.equal(await manager.applyAction(message, "timeout", "spam", 60_000), false);
  assert.equal(calls.length, 1);

  const failedMember = { id: "failed", moderatable: true, timeout: async () => { throw Object.assign(new Error("Missing Permissions"), { code: 50013 }); } };
  const failedMessage = { member: failedMember, author: { id: failedMember.id }, guild: { members: { fetch: async () => failedMember } } };
  const oldError = console.error;
  console.error = () => {};
  try { assert.equal(await manager.applyAction(failedMessage, "timeout", "spam", 60_000), false); }
  finally { console.error = oldError; }
});

test("spam enforcement routes through the shared manager and reports rejected timeouts accurately", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../events/messageCreate.js"), "utf8");
  assert.match(source, /soezyAdvancedAutomod\.handleDetection\(msg, detection, automodDeps\)/);
  assert.match(source, /triggered AutoMod, but \*\*\$\{actionLabel\} failed\*\*/);
  assert.match(source, /\*\*Moderate Members\*\* permission and my highest role above the member's/);
});

test("native duplicate rule prevents duplicate messages from being deleted by the bot", async () => {
  const manager = require("../handlers/automod/automodManager");
  const gd = { automod: { enabled: true, advanced: { duplicate: { enabled: true } } }, nativeAutomod: { ruleIds: { filter_duplicate: "native-rule" } } };
  let deleted = 0;
  for (let index = 0; index < 3; index++) {
    const message = {
      id: `m${index}`, guildId: "g-native", channelId: "c", content: "same repeated message", embeds: [],
      author: { id: "u" }, member: { roles: { cache: new Map() }, timeout: async () => {} },
      guild: { id: "g-native" }, channel: { send: async () => {} },
      delete: async () => { deleted++; },
    };
    assert.equal(await manager.handleMessage(message, { guildData: () => gd, saveDB() {} }), false);
  }
  assert.equal(deleted, 0);
});

test("duplicate detection uses configured threshold and rearms only after a quiet window", () => {
  const filter = require("../handlers/automod/duplicateFilter");
  const guildId = `g-config-${Date.now()}`;
  let now = 10_000;
  const makeMessage = index => ({
    id: `${guildId}-${index}`, guildId, channelId: "c", content: "repeated configurable message",
    author: { id: "u" },
  });
  const config = { duplicate: { requiredCount: 2, windowMs: 10000, timeoutMs: 120000 } };
  assert.equal(filter.check(makeMessage(1), config, now++), null);
  const detection = filter.check(makeMessage(2), config, now++);
  assert.equal(detection.messages.length, 2);
  assert.equal(detection.timeoutMs, 120000);
  assert.equal(filter.check(makeMessage(3), config, now++), null);
  assert.equal(filter.check(makeMessage(4), config, now + 10_001), null);
  assert.ok(filter.check(makeMessage(5), config, now + 10_002));
});

test("spam frequency detector triggers once per burst and rearms after the configured quiet window", () => {
  const spamFilter = require("../handlers/automod/spamFilter");
  const guildId = `g-spam-${Date.now()}`;
  const config = { maxMessages: 3, interval: 5000, duration: 120000, action: "timeout" };
  const makeMessage = id => ({ id: `${guildId}-${id}`, guildId, channelId: "c", author: { id: "u" } });

  assert.equal(spamFilter.check(makeMessage(1), config, 20_000), null);
  assert.equal(spamFilter.check(makeMessage(2), config, 20_100), null);
  const incident = spamFilter.check(makeMessage(3), config, 20_200);
  assert.equal(incident.type, "spam");
  assert.equal(incident.timeoutMs, 120000);
  assert.equal(spamFilter.check(makeMessage(4), config, 20_300), null);
  assert.equal(spamFilter.check(makeMessage(5), config, 25_301), null);
  assert.equal(spamFilter.check(makeMessage(6), config, 25_302), null);
  assert.ok(spamFilter.check(makeMessage(7), config, 25_303));
});

test("spam frequency detector does not create an incident below its configured threshold", () => {
  const spamFilter = require("../handlers/automod/spamFilter");
  const guildId = `g-spam-below-${Date.now()}`;
  const config = { maxMessages: 4, interval: 5000 };
  for (let index = 1; index < 4; index += 1) {
    assert.equal(spamFilter.check({ id: `${guildId}-${index}`, guildId, author: { id: "u" } }, config, 30_000 + index), null);
  }
});

test("spam and duplicate trackers stay bounded during high-cardinality bursts", () => {
  const spamFilter = require("../handlers/automod/spamFilter");
  const duplicateFilter = require("../handlers/automod/duplicateFilter");
  const suffix = Date.now();
  for (let index = 0; index < 5_050; index += 1) {
    const guildId = `g-bounded-${suffix}`;
    const authorId = `u-${index}`;
    const message = { id: `m-${index}`, guildId, channelId: "c", content: "unique user repeated message", author: { id: authorId } };
    spamFilter.check(message, { maxMessages: 5, interval: 5000 }, 40_000 + index);
    duplicateFilter.check(message, { duplicate: { minLength: 4, windowMs: 30_000 } }, 40_000 + index);
  }
  assert.ok(globalThis.__soezyAutomodSpamWindows.size <= 5_000);
  assert.ok(globalThis.__soezyAutomodDuplicateWindows.size <= 5_000);
});

test("shared AutoMod incident claim prevents repeated actions for the same incident", async () => {
  const manager = require("../handlers/automod/automodManager");
  const guildId = `g-dedupe-${Date.now()}`;
  const gd = { automod: { enabled: true, punishment: "timeout" } };
  let timeouts = 0;
  let notices = 0;
  const member = { moderatable: true, roles: { cache: new Map() }, timeout: async () => { timeouts += 1; } };
  const message = {
    id: `${guildId}-message`, guildId, channelId: "c", content: "spam", author: { id: "u" }, member,
    guild: { id: guildId }, channel: { send: async () => null }, delete: async () => {},
  };
  const detection = { type: "spam", title: "Spam Detected", reason: "Burst", incidentId: "burst-1", dedupeMs: 5000, delete: true };
  const deps = { guildData: () => gd, saveDB() {}, sendAutoModNotice: async () => { notices += 1; } };

  assert.equal(await manager.handleDetection(message, detection, deps), true);
  assert.equal(await manager.handleDetection(message, detection, deps), true);
  assert.equal(timeouts, 1);
  assert.equal(notices, 1);
});

test("a successful timeout removes the target member's 10 newest recent channel messages", async () => {
  const manager = require("../handlers/automod/automodManager");
  const guildId = `g-timeout-cleanup-${Date.now()}`;
  const removed = [];
  const history = Array.from({ length: 12 }, (_, index) => ({
    id: `target-${index}`,
    author: { id: "target" },
    createdTimestamp: index + 1,
    deletable: true,
    delete: async () => { removed.push(`target-${index}`); },
  }));
  history.push({ id: "other-user", author: { id: "someone-else" }, createdTimestamp: 99, delete: async () => { removed.push("other-user"); } });
  let timeoutCalls = 0;
  const gd = { automod: { enabled: true, punishment: "timeout" } };
  const message = {
    id: `${guildId}-trigger`, guildId, channelId: "c", author: { id: "target" },
    member: { moderatable: true, roles: { cache: new Map() }, timeout: async () => { timeoutCalls += 1; } },
    guild: { id: guildId },
    channel: { messages: { fetch: async () => new Map(history.map(item => [item.id, item])) }, send: async () => null },
  };
  const detection = { type: "spam", title: "Spam Detected", reason: "Burst", incidentId: "cleanup-1", delete: false };

  assert.equal(await manager.handleDetection(message, detection, { guildData: () => gd, saveDB() {} }), true);
  assert.equal(timeoutCalls, 1);
  assert.equal(removed.length, 10);
  assert.equal(removed.includes("target-11"), true);
  assert.equal(removed.includes("target-1"), false);
  assert.equal(removed.includes("other-user"), false);
});

test("a rejected timeout does not sweep the member's recent messages", async () => {
  const manager = require("../handlers/automod/automodManager");
  const guildId = `g-timeout-failed-cleanup-${Date.now()}`;
  let historyFetches = 0;
  const gd = { automod: { enabled: true, punishment: "timeout" } };
  const member = { moderatable: true, roles: { cache: new Map() }, timeout: async () => { throw new Error("Discord rejected timeout"); } };
  const message = {
    id: `${guildId}-trigger`, guildId, channelId: "c", author: { id: "target" }, member,
    guild: { id: guildId },
    channel: { messages: { fetch: async () => { historyFetches += 1; return new Map(); } }, send: async () => null },
  };
  const oldError = console.error;
  console.error = () => {};
  try {
    await manager.handleDetection(message, { type: "spam", reason: "Burst", incidentId: "cleanup-failed-1", delete: false }, {
      guildData: () => gd, saveDB() {}, sendAutoModNotice: async () => {},
    });
  } finally {
    console.error = oldError;
  }
  assert.equal(historyFetches, 0);
});

test("punishment categories resolve custom protections and spelling aliases", () => {
  const punishment = require("../utils/automodPunishment");
  const config = { punishment: "warn" };
  assert.equal(punishment.set(config, "antiLink", "ban"), "antilink");
  assert.equal(punishment.resolve(config, "anti-link"), "ban");
  punishment.set(config, "zalgo", "timeout");
  assert.equal(punishment.resolve(config, "ZALGO"), "timeout");
});

test("Badword and NSFW category blocks install only their selected native rules", () => {
  const words = { badWords: ["curseword"], nsfwWords: ["adultterm"] };
  const gd = { badWordEnabled: true, nsfwProtection: true, security: { antiZalgo: false, antiEveryoneBP: false }, automod: { enabled: true, punishment: "ban", punishments: { badwords: "block", nsfw: "timeout" } } };
  let plans = buildFilterRules(gd, [], words);
  assert.deepEqual(plans.map(plan => plan.key), ["badwords"]);
  gd.automod.punishments.nsfw = "block";
  plans = buildFilterRules(gd, [], words);
  assert.deepEqual(plans.map(plan => plan.key), ["badwords", "nsfw"]);
});
