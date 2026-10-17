"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("removed games and suggestions are absent from command registry", () => {
  const commands = require("../commands/registry").loadCommandCollection();
  for (const name of ["chess", "battleship", "bs", "suggestions", "suggest", "suggestapprove", "suggestaccept", "airdrop", "stockmarket", "stocks", "stock", "countdown", "channelcooldown", "chcd"]) assert.equal(commands.has(name), false);
});

test("removed command handlers and passive suggestions cannot execute", () => {
  const prefix = read("events/messageCreate.js");
  const slash = read("events/interactionCreate.js");
  assert.doesNotMatch(prefix, /cmd === "(?:chess|battleship|bs|suggestapprove|suggestaccept)"/);
  assert.doesNotMatch(prefix, /_gd\.suggestions\?\.enabled/);
  assert.doesNotMatch(slash, /commandName === "suggestions"|chess\.handleButton|battleshipGames|startsWith\("sgcfg_select_/);
  assert.doesNotMatch(read("config/bootstrap.js"), /require\(['"]\.\/utils\/game\.js/);
  assert.doesNotMatch(read("utils/embedBuilders/helpEmbeds.js"), /name: "(?:chess|battleship|suggestapprove)"/);
});

test("standalone feature toggle panel is removed while module config commands remain", () => {
  const prefix = read("events/messageCreate.js");
  const help = read("utils/embedBuilders/helpEmbeds.js");
  const runtime = read("utils/runtimeManager.js");
  assert.doesNotMatch(prefix, /ENABLE \/ DISABLE PANEL|prefix_enable_panel_open|buildTogglePanel\(msg\.guildId/);
  assert.doesNotMatch(help, /name: "enable", description: "Open the module enable\/disable toggle panel"/);
  assert.doesNotMatch(runtime, /"dashboard","dash","panel","enable","disable"/);
  assert.match(help, /name: "security config"/);
  assert.match(help, /name: "automod config"/);
});

test("disabled channels have separate explicit disable and enable command handlers", () => {
  const prefix = read("events/messageCreate.js");
  const help = read("utils/embedBuilders/helpEmbeds.js");
  const runtime = read("utils/runtimeManager.js");
  assert.match(prefix, /cmd === "enablechannel" \|\| cmd === "enablechan"/);
  assert.match(prefix, /data\.disabledChannels = disabled\.filter\(id => id !== channel\.id\)/);
  assert.match(prefix, /data\.disabledChannels = \[\.\.\.disabled, channel\.id\]/);
  assert.match(help, /name: "enablechannel".*aliases: \["enablechan"\]/);
  assert.match(runtime, /"enablechannel","enablechan"/);
});

test("removed premium commands have no handlers, help entries or passive cooldown", () => {
  const prefix = read("events/messageCreate.js");
  assert.doesNotMatch(prefix, /cmd === "(?:airdrop|stockmarket|stocks|stock|countdown|channelcooldown|chcd)"/);
  assert.doesNotMatch(prefix, /channelCooldownTracker|channelCooldowns/);
  assert.doesNotMatch(read("events/interactionCreate.js"), /airdrop_claim_|airdropMessages/);
  assert.doesNotMatch(read("utils/embedBuilders/helpEmbeds.js"), /name: "(?:airdrop|stockmarket|countdown|chcd)(?: |")/);
  assert.doesNotMatch(read("utils/runtimeManager.js"), /"(?:airdrop|stockmarket|stocks|stock|countdown|channelcooldown|chcd)"/);
});

test("AFK and automatic response utilities stay enabled without legacy toggle commands", () => {
  const help = read("utils/embedBuilders/helpEmbeds.js");
  const prefix = read("events/messageCreate.js");
  const slash = read("events/interactionCreate.js");
  const responderSlash = read("commands/config/autoresponder.js");
  const reactSlash = read("commands/config/autoreact.js");
  const config = read("utils/embedBuilders/configEmbeds.js");
  const database = read("utils/database.js");
  const featureState = read("utils/featureStateManager.js");

  for (const removed of ["afk enable", "afk disable", "afk remove", "afk clear", "autoresponder enable", "autoresponder disable", "autoresponder settings", "autoreact enable", "autoreact disable", "autoreact settings"]) {
    assert.doesNotMatch(help, new RegExp(`name: "${removed.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}"`));
  }
  assert.doesNotMatch(responderSlash + reactSlash, /setName\("(?:enable|disable)"\)/);
  assert.doesNotMatch(slash, /sub === "enable" \|\| sub === "disable"[\s\S]{0,300}autoresponder|sub === "enable" \|\| sub === "disable"[\s\S]{0,300}autoreact/);
  assert.match(prefix, /\["enable", "disable", "remove", "off", "clear"\]\.includes\(subCmd\)/);
  assert.match(config, /Status:\*\* <:tick:1559236522711187577> Enabled/);
  assert.doesNotMatch(config, /arespcfg_toggle_|arxcfg_toggle_|Disable Autoresponder|Disable Autoreact/);
  assert.match(database, /for \(const key of \["afk", "autoresponder", "autoreact"\]\)/);
  assert.match(database, /enabled: true, triggers: \{\}/);
  assert.match(featureState, /for \(const key of \["afk", "autoresponder", "autoreact"\]\)/);
});

test("no-prefix management only exposes local add, server add, global add, and list", () => {
  const help = read("utils/embedBuilders/helpEmbeds.js");
  const prefix = read("events/messageCreate.js");
  const runtime = read("utils/runtimeManager.js");
  const noPrefixParser = read("utils/noPrefixParser.js");
  assert.match(help, /name: "npx add", description: "Grant server-only no-prefix access"/);
  assert.match(help, /name: "snpx add", description: "Grant server-only no-prefix access"/);
  assert.match(help, /name: "gnpx add", description: "Grant global no-prefix access"/);
  assert.match(help, /name: "npx list"/);
  assert.doesNotMatch(help, /name: "(?:noprefix|npx) (?:config|remove|check|trial|claim)"/);
  assert.doesNotMatch(help, /name: "noprefix (?:add|remove|list)"/);
  assert.match(prefix, /if \(cmd === "npx"\)/);
  assert.match(prefix, /new Set\(\["add", "list"\]\)/);
  assert.match(prefix, /No-Prefix Added \(Server\)/);
  assert.match(prefix, /if \(subCmd !== "add"\)[\s\S]*gnpx add/);
  assert.match(prefix, /if \(subCmd !== "add"\)[\s\S]*snpx add/);
  assert.match(runtime, /"npx":\s*\["add","list"\]/);
  assert.doesNotMatch(runtime, /"noprefix":\s*\[/);
  assert.doesNotMatch(noPrefixParser, /\["npx", \{ command: "npx", args: \[\] \}\]/);
});
