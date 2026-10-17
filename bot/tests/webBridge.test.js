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
