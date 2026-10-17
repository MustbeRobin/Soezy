"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("AutoMod is a separate navigable help category and appears in all commands", () => {
  const source = fs.readFileSync(path.join(__dirname, "../utils/embedBuilders/helpEmbeds.js"), "utf8");
  const start = source.indexOf("const HELP_MODULE_ORDER =");
  const end = source.indexOf("function getHelpOptionEmoji", start);
  const ctx = { featureEmoji: () => "icon", canSeeLogs: () => true, canSeeOwner: () => false,
    ALL_COMMANDS: Object.fromEntries(["antinuke", "automod", "moderation", "whitelist"].map(key => [key, { name: key, commands: [{ name: `${key} config` }] }])) };
  vm.createContext(ctx);
  vm.runInContext(source.slice(start, end), ctx);
  const keys = Array.from(ctx.getHelpNavigationKeys("user", {}));
  assert.deepEqual(keys, ["antinuke", "automod", "moderation", "whitelist"]);
  assert.equal(ctx.getVisibleHelpCommands("automod", "user", {}).length, 1);
  assert.equal(ctx.getVisibleHelpCommands("all_commands", "user", {}).some(c => c.name === "automod config"), true);
});
