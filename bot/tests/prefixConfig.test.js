"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const discord = require("discord.js");

const messageSource = fs.readFileSync(path.join(__dirname, "../events/messageCreate.js"), "utf8").replace(/\r\n/g, "\n");
const interactionSource = fs.readFileSync(path.join(__dirname, "../events/interactionCreate.js"), "utf8").replace(/\r\n/g, "\n");

test("prefix settings use a heading, divider, and quoted current-prefix instruction", () => {
  const start = messageSource.indexOf("function buildPrefixSettingsContainer(");
  const end = messageSource.indexOf("\n}\n\nfunction parseOnOffToggle", start) + 2;
  assert.ok(start >= 0 && end > start);

  const context = vm.createContext({ ...discord });
  vm.runInContext(messageSource.slice(start, end), context);
  const components = context.buildPrefixSettingsContainer("guild", ",").toJSON().components;

  assert.equal(components.length, 3);
  assert.equal(components[0].content, "### Prefix Configuration");
  assert.equal(components[1].type, discord.ComponentType.Separator);
  assert.equal(components[1].divider, true);
  assert.equal(components[2].content, "> **Your prefix is `,`. Change it with `,prefix <new_prefix>` if punctuation is feeling too powerful today.**");
});

test("slash prefix info uses the server prefix and the same container layout", () => {
  assert.match(interactionSource, /const activePrefix = getPrefix\(interaction\.guildId\)/);
  assert.match(interactionSource, /### Prefix Configuration/);
  assert.match(interactionSource, /Your prefix is \\`\$\{activePrefix\}\\`\. Change it with \\`\$\{activePrefix\}prefix <new_prefix>\\` if punctuation is feeling too powerful today/);
  assert.match(interactionSource, /components: \[container\], flags: MessageFlags\.IsComponentsV2/);
});
