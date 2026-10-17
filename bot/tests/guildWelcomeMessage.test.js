"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const discord = require("discord.js");

const source = fs.readFileSync(path.join(__dirname, "../handlers/feature-events.js"), "utf8").replace(/\r\n/g, "\n");
const start = source.indexOf('client.on("guildCreate", async guild => {');
const end = source.indexOf('\n});\n\n/* ================= GUILD DELETE EVENT', start);
assert.ok(start >= 0 && end > start, "guild create welcome handler should exist");

function harness() {
  let guildCreateHandler;
  const dmMessages = [], serverMessages = [];
  const adderUser = { id: "222222222222222222", username: "Robin", send: async payload => dmMessages.push(payload) };
  const channel = { type: discord.ChannelType.GuildText, send: async payload => serverMessages.push(payload) };
  const channels = new discord.Collection([
    ["333333333333333333", channel],
    ...Array.from({ length: 17 }, (_, index) => [`channel-${index}`, { type: discord.ChannelType.GuildVoice }]),
  ]);
  const guild = {
    id: "111111111111111111",
    name: "Robin's server",
    memberCount: 3,
    systemChannel: channel,
    channels: { cache: channels },
    roles: { cache: new discord.Collection([
      ["111111111111111111", { id: "111111111111111111" }],
      ["444444444444444444", { id: "444444444444444444" }],
      ["555555555555555555", { id: "555555555555555555" }],
      ["666666666666666666", { id: "666666666666666666" }],
    ]) },
    members: { me: { id: "777777777777777777" } },
    fetchAuditLogs: async () => ({
      entries: { find: predicate => [{ target: { id: "999999999999999999" }, executor: adderUser }].find(predicate) },
    }),
    fetchOwner: async () => ({ user: adderUser }),
  };
  const context = vm.createContext({
    ...discord,
    client: {
      user: { id: "999999999999999999", username: "Soezy" },
      on: (event, handler) => { if (event === "guildCreate") guildCreateHandler = handler; },
    },
    console: { log() {}, error() {} },
    setTimeout: callback => { callback(); return { unref() {} }; },
    guildData: () => ({ antinuke: { enabled: false } }),
    getPrefix: () => ",",
    featureSecurityPremiumActive: () => false,
    EMOJIS: {},
    soezySecurity: { handleGuildJoinGuard: async () => {} },
    takeGuildSnapshot: async () => {},
  });
  vm.runInContext(source.slice(start, end + 4), context);
  return { guildCreateHandler, guild, dmMessages, serverMessages };
}

function textDisplays(payload) {
  return payload.components[0].toJSON().components
    .filter(component => component.type === discord.ComponentType.TextDisplay)
    .map(component => component.content);
}

test("guild join posts the server welcome with the requested emoji, help details, and counts", async () => {
  const h = harness();
  await h.guildCreateHandler(h.guild);
  const [title, details, stats] = textDisplays(h.serverMessages[0]);
  assert.equal(title, "<a:0Neko_Catacafe_EMO4:1559062062259511377> **Ty for inviting Soezy!**");
  assert.match(details, /Ready to help your server\. Let's get started!/);
  assert.match(details, /\*\*Prefix:\*\* `,`/);
  assert.match(details, /\*\*Help:\*\* `,help` or `\/help`/);
  assert.match(stats, /\*\*Members:\*\* 3\s+•\s+\*\*Channels:\*\* 18\s+•\s+\*\*Roles:\*\* 3/);
  assert.doesNotMatch(JSON.stringify(h.serverMessages[0]), /Setup/);
});

test("guild join DMs the inviter a spaced welcome using the emoji from the supplied image", async () => {
  const h = harness();
  await h.guildCreateHandler(h.guild);
  const [title, details, support] = textDisplays(h.dmMessages[0]);
  assert.equal(title, "<a:info:1559656193637617754> **Ty for inviting Soezy!**");
  assert.match(details, /Ready to help in \*\*Robin's server\*\*\. Let's get started!\n\n/);
  assert.match(details, /\*\*Prefix:\*\* `,`/);
  assert.match(details, /\*\*Help:\*\* `,help` or `\/help`/);
  assert.match(support, /Need a hand\? Join our \*\*\[Support Server\]/);
  assert.doesNotMatch(JSON.stringify(h.dmMessages[0]), /Setup/);
});
