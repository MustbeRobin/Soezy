"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const names = commandPath => require(path.join(root, commandPath)).data.toJSON().options.map(option => option.name);

test("verification and media slash commands retain config only", () => {
  assert.deepEqual(names("commands/moderation/verify.js"), ["config"]);
  assert.deepEqual(names("commands/config/media.js"), ["config"]);
});

test("autoresponder and autoreact slash commands do not expose enable or disable", () => {
  for (const commandPath of ["commands/config/autoresponder.js", "commands/config/autoreact.js"]) {
    assert.ok(!names(commandPath).some(name => name === "enable" || name === "disable"));
  }
});

test("startup slash sync checks the remote schema before honoring the local hash cache", () => {
  const readySource = fs.readFileSync(path.join(root, "events/ready.js"), "utf8");
  assert.match(readySource, /cachedSlash\.hash === nextHash && remoteCommandsMatch/);
});
