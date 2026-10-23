"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createBotBridge } = require("../web/dashboard");

test("embedded dashboard bridge shares live client and persists config through bot writer", async () => {
  const botDir = fs.mkdtempSync(path.join(os.tmpdir(), "soezy-web-bridge-"));
  fs.mkdirSync(path.join(botDir, "commands"));
  const database = { guilds: {} };
  let saves = 0;
  const guild = {
    id: "1345717715892961333",
    name: "Bridge test",
    ownerId: "owner",
    memberCount: 1,
    channels: { cache: new Map() },
    roles: { cache: new Map() }
  };
  const client = {
    isReady: () => true,
    user: { id: "bot" },
    guilds: { cache: new Map([[guild.id, guild]]) },
    _db: database,
    _saveDatabase: async () => { saves++; return true; }
  };
  const previousClient = process.__soezyDiscordClient;
  process.__soezyDiscordClient = client;
  const bridge = createBotBridge({
    config: { bot: { dir: botDir, ownerIds: ["owner"] } },
    logger: { info() {}, warn() {} }
  });

  try {
    assert.equal(bridge.bridge().ready, true);
    assert.equal(bridge.loadDatabase(), database);
    const result = await bridge.updateConfig(guild.id, { "automod.enabled": true }, "owner");
    assert.equal(result.applied["automod.enabled"], true);
    assert.equal(database.guilds[guild.id].automod.enabled, true);
    assert.equal(saves, 1);
  } finally {
    bridge.close();
    if (previousClient === undefined) delete process.__soezyDiscordClient;
    else process.__soezyDiscordClient = previousClient;
    fs.rmSync(botDir, { recursive: true, force: true });
  }
});

test("native AutoMod permission failure is returned as a sync warning after settings persist", async () => {
  const botDir = fs.mkdtempSync(path.join(os.tmpdir(), "soezy-web-automod-sync-"));
  fs.mkdirSync(path.join(botDir, "commands"));
  const database = { guilds: {} };
  let saves = 0;
  const guild = {
    id: "1345717715892961333",
    name: "AutoMod sync test",
    ownerId: "owner",
    memberCount: 1,
    channels: { cache: new Map() },
    roles: { cache: new Map() }
  };
  const client = {
    isReady: () => true,
    user: { id: "bot" },
    guilds: { cache: new Map([[guild.id, guild]]) },
    _db: database,
    _saveDatabase: async () => { saves++; return true; }
  };
  const previousClient = process.__soezyDiscordClient;
  process.__soezyDiscordClient = client;
  const bridge = createBotBridge({
    config: {
      bot: {
        dir: botDir,
        ownerIds: ["owner"],
        onConfigUpdated: async () => { throw Object.assign(new Error("raw Discord REST details"), { code: 50013 }); }
      }
    },
    logger: { info() {}, warn() {} }
  });

  try {
    const result = await bridge.updateConfig(guild.id, { "automod.enabled": true }, "owner");
    assert.equal(result.applied["automod.enabled"], true);
    assert.equal(database.guilds[guild.id].automod.enabled, true);
    assert.equal(result.nativeAutomodSync.status, "failed");
    assert.match(result.nativeAutomodSync.message, /settings were saved/i);
    assert.match(result.nativeAutomodSync.message, /Manage Server permissions/i);
    assert.doesNotMatch(result.nativeAutomodSync.message, /raw Discord REST details/);
    assert.equal(database.guilds[guild.id].nativeAutomod.lastError.includes("Manage Server permissions"), true);
    assert.equal(saves, 2, "persist settings first, then persist the post-sync error state");
  } finally {
    bridge.close();
    if (previousClient === undefined) delete process.__soezyDiscordClient;
    else process.__soezyDiscordClient = previousClient;
    fs.rmSync(botDir, { recursive: true, force: true });
  }
});

test("same-guild dashboard update burst is serialized without losing the final value", async () => {
  const botDir = fs.mkdtempSync(path.join(os.tmpdir(), "soezy-web-bridge-burst-"));
  fs.mkdirSync(path.join(botDir, "commands"));
  const database = { guilds: {} };
  const guild = {
    id: "1345717715892961333",
    name: "Bridge burst test",
    ownerId: "owner",
    memberCount: 1,
    channels: { cache: new Map() },
    roles: { cache: new Map() }
  };
  const client = {
    isReady: () => true,
    user: { id: "bot" },
    guilds: { cache: new Map([[guild.id, guild]]) },
    _db: database,
    _saveDatabase: async () => true
  };
  const previousClient = process.__soezyDiscordClient;
  process.__soezyDiscordClient = client;
  let activeSyncs = 0;
  let maxActiveSyncs = 0;
  let completedSyncs = 0;
  const bridge = createBotBridge({
    config: {
      bot: {
        dir: botDir,
        ownerIds: ["owner"],
        onConfigUpdated: async () => {
          activeSyncs++;
          maxActiveSyncs = Math.max(maxActiveSyncs, activeSyncs);
          await new Promise(resolve => setImmediate(resolve));
          activeSyncs--;
          completedSyncs++;
        }
      }
    },
    logger: { info() {}, warn() {} }
  });

  try {
    const count = 120;
    await Promise.all(Array.from({ length: count }, (_, index) => bridge.updateConfig(
      guild.id,
      { "automod.antiSpam.enabled": index % 2 === 0 },
      "owner"
    )));
    assert.equal(completedSyncs, count);
    assert.equal(maxActiveSyncs, 1);
    assert.equal(database.guilds[guild.id].automod.antiSpam.enabled, false);
  } finally {
    bridge.close();
    if (previousClient === undefined) delete process.__soezyDiscordClient;
    else process.__soezyDiscordClient = previousClient;
    fs.rmSync(botDir, { recursive: true, force: true });
  }
});
