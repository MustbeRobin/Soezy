"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const discord = require("discord.js");
const source = fs.readFileSync(path.join(__dirname, "../utils/embedBuilders/helpEmbeds.js"), "utf8").replace(/\r\n/g, "\n");
const avatar = "https://cdn.discordapp.com/embed/avatars/0.png";
function declaration(name) {
  const start = source.indexOf(`const ${name} =`);
  return source.slice(start, source.indexOf("\n};", start) + 3);
}
function fn(name) {
  const start = source.indexOf(`function ${name}(`);
  return source.slice(start, source.indexOf("\n}", start) + 2);
}
function context() {
  const ctx = vm.createContext({
    ...discord, process: { env: {} },
    featureEmoji: name => `<:feature_${name}:123456789012345678>`,
    actionEmoji: name => `<:action_${name}:123456789012345678>`,
    getEmoji: name => `<:${name}:123456789012345678>`,
    getStatusEmojiObject: (group, name) => ({ id: "123456789012345678", name }),
    EMOJIS: {}, client: { user: { id: "123456789012345678" } },
    getBotAvatar: () => avatar, getBotDisplayName: () => "Soezy", getDisplayHelpPrefix: () => ",",
    canSeeOwner: id => id === "owner", canSeeLogs: () => true,
  });
  const orderStart = source.indexOf("const HELP_MODULE_ORDER =");
  const order = source.slice(orderStart, source.indexOf("\n];", orderStart) + 3);
  vm.runInContext([
    declaration("ALL_COMMANDS"), declaration("ALL_COMMANDS_CATEGORY"), declaration("MODULE_SECTIONS"), order, "const HELP_PAGE_SIZE = 8;",
    "globalThis.__moduleSections = MODULE_SECTIONS;",
    ...["isHelpCommandVisible", "getVisibleHelpCommands", "getHelpCategoryEntries", "getHelpModuleEntries", "getHelpNavigationKeys", "getHelpOptionEmoji", "buildMainHelpContainer", "buildSectionAwarePages", "buildCategoryPage", "buildHelpPageButtons"].map(fn),
  ].join("\n"), ctx);
  return ctx;
}

test("home help matches original heading, thumbnail, bold summary, quoted module list and links", () => {
  const ctx = context();
  const raw = ctx.buildMainHelpContainer("guild", "member", {}).toJSON();
  assert.equal(raw.components[0].components[0].content, "## Hey, I'm Soezy\u2122\nA powerful multipurpose bot");
  assert.equal(raw.components[0].accessory.media.url, avatar);
  assert.match(raw.components[1].content, /\*\*My Prefix is\*\* `,`/);
  assert.match(raw.components[1].content, /\*\*Total Commands:\*\* `\d+`/);
  assert.ok(raw.components[2].content.split("\n").every(line => line.startsWith("> ")));
  assert.match(raw.components[2].content.split("\n")[0], /Anti-Nuke/);
  assert.doesNotMatch(raw.components[2].content, /\*\*.*Owner/);
  assert.match(raw.components[4].content, /\[Invite Me\].*\[Support Server\].*\[Website\]/);
  const options = raw.components.at(-3).components[0].options;
  assert.equal(options[0].value, "antinuke");
  assert.deepEqual(options.map(o => o.value), Array.from(ctx.getHelpNavigationKeys("member", {})));
  assert.equal(raw.accent_color, undefined);
  assert.equal(raw.components.at(-2).type, discord.ComponentType.Separator);
  assert.equal(raw.components.at(-2).divider, true);
  assert.equal(raw.components.at(-1).content, "-# *Designed by youknowntg*");
});

test("module page keeps its title, section heading, compact entries and navigation", () => {
  const ctx = context();
  const result = ctx.buildCategoryPage("antinuke", 0, "member", "guild", "member", {});
  const raw = result.container.toJSON();
  assert.match(raw.components[0].components[0].content, /^# .*\*\*Anti-Nuke\*\*$/);
  assert.equal(raw.components[0].accessory.media.url, avatar);
  assert.equal(raw.components[1].type, discord.ComponentType.TextDisplay);
  const body = raw.components[1].content;
  assert.ok(body.startsWith("### __**Anti-Nuke**__"));
  assert.doesNotMatch(body, /^\*\*__Antinuke__\*\*/);
  assert.doesNotMatch(body, /Requested by/);
  assert.ok(body.includes("### __**Anti-Nuke**__"));
  assert.equal(body.split("\n").filter(line => line.startsWith("\u276f ")).length, 3);
  assert.equal(body.split("\n").filter(line => line.startsWith("> **`")).length, 3);
  assert.doesNotMatch(body, /`,antinuke settings`|`,antinuke status`/);
  assert.doesNotMatch(body, /`\*\*\n\n\u276f/);
  assert.doesNotMatch(body, /Aliases:/);
  assert.doesNotMatch(body, /`,antinuke events`/);
  assert.doesNotMatch(body, /`,antinuke (?:enable|disable)`/);
  assert.ok(raw.components.at(-1).components[0].options.find(o => o.value === "antinuke").default);
  const nextModulePage = ctx.buildCategoryPage("antinuke", 1, "member", "guild", "member", {}).container.toJSON();
  assert.match(nextModulePage.components[1].content, /### __\*\*Anti-Raid\*\*__/);
  const buttons = ctx.buildHelpPageButtons("member_session", result.page, result.totalPages, "antinuke", "member", {}).toJSON().components;
  assert.equal(buttons.length, 5);
  assert.equal(buttons[2].style, discord.ButtonStyle.Danger);
  assert.equal(buttons[2].custom_id, "help_main_member");
  assert.ok(buttons.every(button => button.emoji && !button.label));
});

test("module content does not repeat the title already shown in the page header", () => {
  const ctx = context();
  const result = ctx.buildCategoryPage("music", 0, "member", "guild", "member", {});
  const raw = result.container.toJSON();
  const title = raw.components[0].components[0].content;
  const body = raw.components[1].content;
  assert.match(title, /Music/);
  assert.doesNotMatch(body, /^\*\*__Music__\*\*/);
  assert.doesNotMatch(body, /Requested by/);
});

test("all configured help sections have valid markers and render a category heading", () => {
  const ctx = context();
  for (const [categoryKey, sections] of Object.entries(ctx.__moduleSections)) {
    const commands = ctx.getVisibleHelpCommands(categoryKey, "owner", {});
    const names = new Set(commands.map(command => command.name));
    const pages = ctx.buildSectionAwarePages(commands, categoryKey, 8);

    for (const section of sections) {
      assert.ok(names.has(section.marker), `${categoryKey} has no command marker: ${section.marker}`);
      const pageIndex = pages.findIndex(page => page.some(command => command.name === section.marker));
      const page = ctx.buildCategoryPage(categoryKey, pageIndex, "owner", "guild", "owner", {}).container.toJSON();
      const heading = section.header.replace(/^#{1,6}\s+/, "").trim();
      const body = page.components[1].content;
      assert.ok(body.includes(`### __**${heading}**__`), `${categoryKey} did not render heading: ${heading}`);
      assert.ok(body.indexOf(`### __**${heading}**__`) < body.indexOf("> **`"), `${categoryKey} heading is not before its commands: ${heading}`);
    }
  }
});

test("All Commands uses the same category heading style and Anti-Nuke Verify stays under the module title", () => {
  const ctx = context();
  const allCommands = ctx.getVisibleHelpCommands("all_commands", "owner", {});
  const pages = ctx.buildSectionAwarePages(allCommands, "all_commands", 8);
  const rendered = pages.map((_, pageIndex) =>
    ctx.buildCategoryPage("all_commands", pageIndex, "owner", "guild", "owner", {}).container.toJSON().components[1].content
  ).join("\n");
  for (const [key, category] of ctx.getHelpCategoryEntries("owner", {}, true)) {
    if (key === "all_commands") continue;
    assert.ok(rendered.includes(`### __**${category.name}**__`), `missing All Commands heading: ${category.name}`);
  }

  const antinukeCommands = ctx.getVisibleHelpCommands("antinuke", "owner", {});
  const antinukePages = ctx.buildSectionAwarePages(antinukeCommands, "antinuke", 8);
  const verifyPageIndex = antinukePages.findIndex(page => page.some(command => command.name === "verify config"));
  const verifyPage = ctx.buildCategoryPage("antinuke", verifyPageIndex, "owner", "guild", "owner", {}).container.toJSON();
  assert.match(verifyPage.components[0].components[0].content, /\*\*Anti-Nuke\*\*/);
  assert.ok(verifyPage.components[1].content.startsWith("### __**Verify**__"));
});

test("AutoMod help omits redundant Anti-Bot prefix commands", () => {
  const ctx = context();
  const commands = ctx.getVisibleHelpCommands("automod", "member", {});
  assert.ok(commands.length > 0);
  assert.ok(commands.every(command => !command.name.startsWith("antibot ")));
  const pages = ctx.buildSectionAwarePages(commands, "automod", 8);
  const body = pages.map((_, pageIndex) =>
    ctx.buildCategoryPage("automod", pageIndex, "member", "guild", "member", {}).container.toJSON().components[1].content
  ).join("\n");
  assert.doesNotMatch(body, /`,antibot /);
  assert.doesNotMatch(body, /### __\*\*Anti-Bot\*\*__/);
});

test("Premium help omits Advanced Moderation commands", () => {
  const ctx = context();
  const commands = ctx.getVisibleHelpCommands("premium_features", "member", {});
  const removed = new Set([
    "shadowmute", "shadowunmute", "shadowmuted", "modstats", "casehistory", "auditexport",
  ]);
  assert.ok(commands.every(command => !removed.has(command.name)));
  assert.doesNotMatch(JSON.stringify(commands), /Advanced Moderation/);

  const page = ctx.buildCategoryPage("premium_features", 0, "member", "guild", "member", {}).container.toJSON();
  assert.doesNotMatch(JSON.stringify(page), /shadowmute|shadowunmute|shadowmuted|modstats|casehistory|auditexport|Advanced Moderation/);
});

test("settings help exposes an explicit enable-channel command", () => {
  const ctx = context();
  const commands = ctx.getVisibleHelpCommands("settings", "member", {});
  const enable = commands.find(command => command.name === "enablechannel");
  assert.ok(enable);
  assert.equal(enable.usage, "enablechannel <#channel>");
  assert.ok(enable.aliases.includes("enablechan"));
});
