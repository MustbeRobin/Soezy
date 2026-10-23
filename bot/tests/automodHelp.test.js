"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("help covers registered command roots except the removed rob command", () => {
  const source = fs.readFileSync(path.join(__dirname, "../utils/embedBuilders/helpEmbeds.js"), "utf8");
  const ctx = vm.createContext({ STATUS: {}, EMOJIS: {}, getEmoji: () => "" });
  vm.runInContext(source.slice(0, source.indexOf("function getSimilarCommands")) + ";this.catalog=ALL_COMMANDS;", ctx);
  const roots = new Set(Object.values(ctx.catalog).flatMap(category => category.commands.flatMap(command =>
    [command.name, ...(command.aliases || [])].map(value => value.split(" ")[0]))));
  const registered = require("../commands/registry").loadCommandCollection();
  assert.deepEqual([...registered.keys()].filter(name => !roots.has(name)), ["rob"]);
});

test("AutoMod help advertises its parent toggles instead of legacy Anti-Link commands", () => {
  const source = fs.readFileSync(path.join(__dirname, "../utils/embedBuilders/helpEmbeds.js"), "utf8");
  const section = source.slice(source.indexOf('  automod: {'), source.indexOf('  // Welcome Commands'));
  for (const command of ["automod config", "automod enable", "automod disable"]) {
    assert.ok(section.includes(`name: "${command}"`));
    assert.ok(section.includes(`usage: "${command}"`));
  }
  assert.doesNotMatch(section, /antilink enable|antilink disable/);
});

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
