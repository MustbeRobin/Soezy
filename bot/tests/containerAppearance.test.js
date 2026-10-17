"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const discord = require("discord.js");
const source = fs.readFileSync(path.join(__dirname, "../utils/embedBuilders/errorEmbeds.js"), "utf8");
const wrap = source.slice(source.indexOf("function wrapEmbedAsContainer("), source.indexOf("function createInfoContainer("));
const normalize = source.slice(source.indexOf("function normalizeComponentsV2Payload("), source.indexOf("const _patchedSendTargets"));
const context = vm.createContext({ ...discord, require: require("node:module").createRequire(path.join(__dirname, "../index.js")), isValidUrl: value => !!value, hasComponentsV2Flag: flags => !!(flags & discord.MessageFlags.IsComponentsV2) });
vm.runInContext(`${wrap}\n${normalize}`, context);

test("existing panels keep their original colors, emojis, controls and footer", () => {
  const panel = new discord.ContainerBuilder().setAccentColor(0x5865F2)
    .addTextDisplayComponents(t => t.setContent("## <:info:123456789012345678> Prefix Settings"))
    .addTextDisplayComponents(t => t.setContent("<:arrow:123456789012345678> **Current Prefix:** `.`"))
    .addTextDisplayComponents(t => t.setContent("-# Original footer"));
  const original = panel.toJSON();
  const payload = { flags: discord.MessageFlags.IsComponentsV2, components: [panel] };
  const result = context.normalizeComponentsV2Payload(payload);
  assert.strictEqual(result.components[0], panel);
  assert.deepEqual(result.components[0].toJSON(), original);
});

test("legacy embed conversion retains its accent and description emojis", () => {
  const embed = new discord.EmbedBuilder().setColor(0x57F287).setTitle("Giveaway Created!")
    .setDescription("<:gift:123456789012345678> **Prize:** Reward")
    .addFields({ name: "Giveaway ID", value: "`gw_example`" });
  const result = context.wrapEmbedAsContainer(embed).toJSON();
  assert.equal(result.accent_color, 0x57F287);
  assert.match(result.components[1].content, /^<:gift:/);
  assert.match(result.components[2].content, /gw_example/);
});

test("thumbnail sits beside the description when the embed has no title", () => {
  const avatar = "https://cdn.discordapp.com/embed/avatars/0.png";
  const embed = new discord.EmbedBuilder().setDescription("Welcome to Jane!").setThumbnail(avatar)
    .setAuthor({ name: "Robin", iconURL: avatar }).setFooter({ text: "Member #10", iconURL: avatar });
  const result = context.wrapEmbedAsContainer(embed).toJSON();
  const sections = result.components.filter(c => c.type === discord.ComponentType.Section);
  assert.equal(sections.length, 3);
  assert.equal(sections[1].components[0].content, "Welcome to Jane!");
  assert.equal(sections[1].accessory.media.url, avatar);
  assert.equal(result.components.filter(c => c.type === discord.ComponentType.TextDisplay).some(c => c.content === "\u200b"), false);
  assert.equal(sections[0].components[0].content, "-# Robin");
  assert.equal(sections[2].components[0].content, "-# Member #10");
});

test("giveaway creation uses a native container with a heading, divider and plain labels", () => {
  const handler = fs.readFileSync(path.join(__dirname, "../events/messageCreate.js"), "utf8");
  const title = handler.indexOf('text.setContent("### Giveaway Created!")');
  assert.ok(title >= 0);
  const start = handler.lastIndexOf("const container = new ContainerBuilder()", title);
  const end = handler.indexOf("const replyMsg =", title);
  const panel = vm.runInNewContext(`${handler.slice(start, end)}\ncontainer.toJSON()`, {
    ...discord, prize: "owo", winners: 1, duration: "10m", giveawayId: "gw_test",
  });
  assert.equal(panel.type, discord.ComponentType.Container);
  assert.equal(panel.accent_color, undefined);
  assert.equal(panel.components.length, 3);
  assert.equal(panel.components[0].content, "### Giveaway Created!");
  assert.equal(panel.components[1].type, discord.ComponentType.Separator);
  assert.equal(panel.components[1].divider, true);
  assert.equal(panel.components[2].content, "**Prize:** owo\n**Winners:** 1\n**Duration:** 10m\n\n**Giveaway ID:** `gw_test`");
  assert.match(handler.slice(end, end + 150), /components: \[container\], flags: MessageFlags.IsComponentsV2/);
});
