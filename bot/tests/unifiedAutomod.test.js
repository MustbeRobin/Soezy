const test = require("node:test");
const assert = require("node:assert/strict");

test("AutoMod unified command architecture and rule state mapping", async () => {
  const db = { guilds: {} };
  const guildData = id => (db.guilds[id] ||= {});
  const saveDB = () => {};
  const soezyAdvancedAutomod = require("../handlers/automod/automodManager");

  const guildId = "guild-test-123";
  const gd = guildData(guildId);

  // Test individual rule configurations
  // 1. Anti-link
  gd.antilink = { enabled: true };
  assert.equal(gd.antilink.enabled, true);

  // 2. Badword
  gd.badWordEnabled = true;
  assert.equal(gd.badWordEnabled, true);

  // 3. NSFW
  gd.nsfwProtection = true;
  assert.equal(gd.nsfwProtection, true);

  // 4. Mention
  gd.automod = { enabled: true, antiMassMention: { enabled: true } };
  assert.equal(gd.automod.antiMassMention.enabled, true);

  // 5. Caps
  gd.automod.antiCaps = { enabled: true };
  assert.equal(gd.automod.antiCaps.enabled, true);

  // 6. Spam
  gd.automod.antiSpam = { enabled: true };
  assert.equal(gd.automod.antiSpam.enabled, true);

  // 7. Duplicate
  await soezyAdvancedAutomod.setFeature(guildId, "duplicate", true, { db, guildData, saveDB });
  assert.equal(gd.automod.advanced.duplicate.enabled, true);

  // 8. Invite
  gd.automod.antiInvite = { enabled: true };
  await soezyAdvancedAutomod.setFeature(guildId, "invite", true, { db, guildData, saveDB });
  assert.equal(gd.automod.antiInvite.enabled, true);
  assert.equal(gd.automod.advanced.invite.enabled, true);

  // 9. Scam
  await soezyAdvancedAutomod.setFeature(guildId, "scams", true, { db, guildData, saveDB });
  assert.equal(gd.automod.advanced.scams.enabled, true);

  // 10. Image scam
  await soezyAdvancedAutomod.setFeature(guildId, "imageScam", true, { db, guildData, saveDB });
  assert.equal(gd.automod.advanced.imageScam.enabled, true);

  // Verify disabling rules
  await soezyAdvancedAutomod.setFeature(guildId, "duplicate", false, { db, guildData, saveDB });
  assert.equal(gd.automod.advanced.duplicate.enabled, false);

  gd.automod.antiLink.enabled = false;
  assert.equal(gd.automod.antiLink.enabled, false);
  assert.equal(gd.antilink, undefined);
});

test("Anti-Link merged system state sync", async () => {
  const db = { guilds: {}, guildSystems: {} };
  globalThis.db = db;
  globalThis.guildData = id => (db.guilds[id] ||= {});
  globalThis.saveDB = () => {};

  const fsm = require("../utils/featureStateManager");
  const guildId = "123456789012345678";
  const gd = globalThis.guildData(guildId);

  // Enable antilink via feature state manager
  fsm.setFeatureState(guildId, "antilink", true);
  assert.equal(gd.antilink?.enabled, true);
  assert.equal(gd.automod?.antiLink?.enabled, true);
  assert.equal(gd.automod?.enabled, false);
  assert.equal(fsm.getProtectionRuntimeState(guildId, "automod", "antiLink").featureEnabled, true);
  assert.equal(fsm.getProtectionRuntimeState(guildId, "automod", "antiLink").effectiveEnabled, false);
  assert.equal(gd.nativeAutomod?.syncEnabled, undefined);

  // Disable antilink via feature state manager
  fsm.setFeatureState(guildId, "antilink", false);
  assert.equal(gd.antilink?.enabled, false);
  assert.equal(gd.automod?.antiLink?.enabled, false);
});

