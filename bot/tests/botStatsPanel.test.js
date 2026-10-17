"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Collection, ComponentType, ButtonStyle, MessageFlags } = require("discord.js");
const { buildBotStatsContainer, handleStatsTabInteraction, scanCodeStats } = require("../utils/botStatsPanel");

const requesterId = "123456789012345678";

test("stats is a botstats prefix alias and bypasses the music stats route", () => {
  const source = fs.readFileSync(path.join(__dirname, "../events/messageCreate.js"), "utf8");
  assert.match(source, /cmd === "botstats" \|\| cmd === "stats" \|\| cmd === "bstats"/);
  assert.match(source, /cmd !== "stats" && soezyMusic\.isMusicPrefixCommandKeyword/);
  assert.doesNotMatch(source, /cmd === "botinfo"[^\n]+cmd === "stats"/);
});

test("stats serializes without a thumbnail", () => {
  const root = createFixture();
  try {
    const client = createClient();
    client.user = {};
    assert.equal(buildBotStatsContainer({ client, requesterId, root }).container.toJSON().type, ComponentType.Container);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Code and System use the uploaded Node.js application emoji", () => {
  const root = createFixture();
  try {
    const emoji = "<:stats_nodejs:1560309753853382788>";
    for (const tab of ["code", "system"]) {
      const panel = buildBotStatsContainer({ client: createClient(), requesterId, root, tab, emojis: { stats_nodejs: emoji } }).container.toJSON();
      assert.ok(JSON.stringify(panel).includes(emoji));
      assert.doesNotMatch(JSON.stringify(panel), /stats_python/);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

function createClient() {
  const guilds = new Collection();
  guilds.set("111111111111111111", { memberCount: 12 });
  guilds.set("222222222222222222", { memberCount: 8 });
  return {
    guilds: { cache: guilds },
    channels: { cache: new Collection([["333333333333333333", {}]]) },
    ws: { ping: 17, shards: new Collection([["0", {}]]) },
    user: { displayAvatarURL: () => "https://example.com/bot.png" },
  };
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "soezy-stats-"));
  fs.mkdirSync(path.join(root, "node_modules"));
  fs.writeFileSync(path.join(root, "src.js"), "const a = 1;\nconst b = 2;\n");
  fs.writeFileSync(path.join(root, "README.md"), "ignored line\n");
  fs.writeFileSync(path.join(root, "node_modules", "dep.js"), "ignored dependency\n");
  return root;
}

test("stats panel contains four interactive tabs in the same container as its details", () => {
  const root = createFixture();
  try {
    const result = buildBotStatsContainer({
      client: createClient(),
      config: { ownerIds: [requesterId] },
      db: { devUsers: ["123456789012345679"] },
      requesterId,
      tab: "general",
      root,
      emojis: { stats_servers: "<:Servers:1517580984101503137>" },
    });
    const panel = result.container.toJSON();
    const row = panel.components.find(component => component.type === ComponentType.ActionRow);
    const buttons = row.components;
    assert.deepEqual(buttons.map(button => button.label), ["General", "Code", "System", "Team"]);
    assert.equal(buttons[0].style, ButtonStyle.Primary);
    assert.ok(buttons.slice(1).every(button => button.style === ButtonStyle.Secondary));
    assert.match(JSON.stringify(panel), /General Stats/);
    assert.match(JSON.stringify(panel), /Servers/);
    assert.equal(result.allowedMentions.parse.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("code tab reports source counts and team tab renders configured groups", () => {
  const root = createFixture();
  try {
    assert.deepEqual(scanCodeStats(root), { files: 2, lines: 2 });
    const common = {
      client: createClient(),
      config: { ownerIds: [requesterId], adminIds: ["123456789012345680"] },
      db: { devUsers: ["123456789012345679"], partnerUsers: [] },
      requesterId,
      root,
    };
    const code = buildBotStatsContainer({ ...common, tab: "code" }).container.toJSON();
    const team = buildBotStatsContainer({ ...common, tab: "team" }).container.toJSON();
    assert.match(JSON.stringify(code), /Total Files.*2/);
    assert.match(JSON.stringify(code), /Total Lines.*2/);
    assert.match(JSON.stringify(team), /Owners/);
    assert.match(JSON.stringify(team), /Admins/);
    assert.match(JSON.stringify(team), /Developers/);
    assert.match(JSON.stringify(team), /Partners/);
    assert.match(JSON.stringify(team), new RegExp(requesterId));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("all stats tabs quote their detail lines", () => {
  const root = createFixture();
  try {
    const examples = {
      general: "**Servers:**",
      code: "**Total Files:**",
      system: "**Gateway Ping:**",
      team: "**Owners**",
    };
    for (const [tab, example] of Object.entries(examples)) {
      const text = JSON.stringify(buildBotStatsContainer({ client: createClient(), requesterId, root, tab }).container.toJSON());
      const labelIndex = text.indexOf(example);
      const lineStart = text.lastIndexOf("\\n", labelIndex) + 2;
      assert.ok(labelIndex >= 0 && text.slice(lineStart, labelIndex).includes("> "), `${tab} tab detail is not blockquoted`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("tab interactions refresh the shared container and reject other users", async () => {
  const root = createFixture();
  try {
    const client = createClient();
    const initial = buildBotStatsContainer({ client, requesterId, root, emojis: { stats_ping: "<:stats_ping:1560014713616596993>" } });
    const button = initial.container.toJSON().components
      .flatMap(component => component.components || [])
      .find(component => component.label === "System");
    const accepted = {
      customId: button.custom_id,
      user: { id: requesterId },
      client,
      message: {},
      isButton: () => true,
      update: async payload => { accepted.payload = payload; },
    };
    assert.equal(await handleStatsTabInteraction(accepted, { root }), true);
    assert.equal(accepted.payload.flags, MessageFlags.IsComponentsV2);
    assert.match(JSON.stringify(accepted.payload.components[0].toJSON()), /System Stats/);
    assert.match(JSON.stringify(accepted.payload.components[0].toJSON()), /<:stats_ping:1560014713616596993>/);

    let deniedPayload;
    const denied = {
      ...accepted,
      user: { id: "123456789012345670" },
      reply: async payload => { deniedPayload = payload; },
    };
    assert.equal(await handleStatsTabInteraction(denied, { root }), true);
    assert.equal(deniedPayload.ephemeral, true);
    assert.match(deniedPayload.content, /Only the person who opened/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
