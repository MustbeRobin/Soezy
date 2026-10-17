"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../utils/nativeAutomodService");
function fixture(code, failingType = 6) {
  const gd = { automod: { systemEnabled: true, enabled: true }, badWordEnabled: true, customBadWords: ["bad"], badWordConfig: { action: "block" }, nativeAutomod: { protections: { profiles: true } }, security: { messageLimit: 100 } };
  const rules = new Map();
  const guild = { id: `availability-${code}-${failingType}`, client: { user: { id: "bot" } }, channels: { fetch: async () => new Map() }, autoModerationRules: {
    fetch: async () => rules,
    create: async payload => {
      if (payload.triggerType === failingType) throw Object.assign(new Error("Denied"), { code });
      const rule = { ...payload, id: String(rules.size + 1), creatorId: "bot", edit: async update => { Object.assign(rule, update); return rule; } };
      rules.set(rule.id, rule); return rule;
    },
  } };
  return { gd, guild, rules, deps: { guildData: () => gd, saveDB() {} } };
}
for (const code of [50001, 50013]) test(`unavailable profile rule (${code}) does not abort message rules`, async () => {
  const h = fixture(code);
  assert.equal(await service.syncFilters(h.guild, h.deps), 2);
  assert.equal(h.rules.size, 2);
  assert.equal(h.gd.nativeAutomod.unavailableRules.profiles, code);
  assert.match(h.gd.nativeAutomod.warnings[0], /Member Profile.*unavailable/);
  await service.syncFilters(h.guild, h.deps);
  assert.equal(h.rules.size, 2);
});
test("real message-rule permission failures still fail instead of claiming success", async () => {
  const h = fixture(50013, 1);
  await assert.rejects(service.syncFilters(h.guild, h.deps), { code: 50013 });
});
test("unexpected profile errors are not hidden", async () => {
  const h = fixture(50035);
  await assert.rejects(service.syncFilters(h.guild, h.deps), { code: 50035 });
});
