"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handleEntry } = require("../utils/giveawayEntry");
const discord = require("discord.js");
const { MessageFlags } = discord;
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../utils/embedBuilders/dashboardEmbeds.js"), "utf8");
const renderSource = source.slice(source.indexOf("function buildActiveGiveawayContainer("), source.indexOf("async function createGiveaway("));
const render = vm.runInNewContext(`${renderSource}\nbuildActiveGiveawayContainer`, {
  ...discord, bold: discord.bold, getEmoji: () => "<:arrow:123456789012345678>",
  getStatusEmojiObject: () => ({ name: "status", id: "123456789012345678" }),
  EMOJIS: { pty: "<:party:123456789012345678>", gwys: "<:gift:123456789012345678>" },
});

function fixture() {
  const data = { id: "gw_test", guildId: "guild", messageId: "message", prize: "Prize", winners: 1, hostId: "host", endTime: Date.now() + 60000, participants: [] };
  const gd = { giveaways: { [data.id]: data } };
  const calls = [];
  const deps = { guildData: () => gd, giveaways: new Map(), saveDB: () => calls.push("save"), render, reply: (type, title, message) => ({ type, title, message }) };
  function interaction(id) {
    return { guildId: "guild", customId: "giveaway_enter_gw_test", user: { id }, member: {},
      deferReply: async () => calls.push(`defer:${id}`), editReply: async payload => { calls.push(payload); return payload; },
      message: { id: "message", flags: { has: () => true }, edit: async payload => {
        assert.equal(payload.flags, MessageFlags.IsComponentsV2);
        assert.equal(payload.embeds, undefined);
        calls.push("edit");
      } },
      guild: { members: { fetch: async () => ({ roles: { cache: new Map() } }) } },
    };
  }
  return { data, deps, calls, interaction };
}

test("ordinary users join and leave; acknowledgement precedes save and V2 update", async () => {
  const f = fixture();
  await handleEntry(f.interaction("alice"), f.deps);
  assert.equal(f.calls[0], "defer:alice");
  assert.deepEqual(f.data.participants, ["alice"]);
  assert.equal(f.calls.at(-1).components[0].title, "Joined Giveaway");
  await handleEntry(f.interaction("alice"), f.deps);
  assert.deepEqual(f.data.participants, []);
  assert.equal(f.calls.at(-1).components[0].title, "Left Giveaway");
});
test("concurrent entries survive and counter contains both users", async () => {
  const f = fixture();
  await Promise.all([handleEntry(f.interaction("alice"), f.deps), handleEntry(f.interaction("bob"), f.deps)]);
  assert.deepEqual(f.data.participants, ["alice", "bob"]);
  const raw = render(f.data).toJSON();
  assert.match(raw.components[2].content, /<:arrow:\d+> \*\*Entries:\*\* 2/);
  assert.equal(raw.components[4].components[0].label, "Enter Giveaway");
  assert.equal(raw.components[4].components[1].label, "2");
  assert.ok(raw.components[4].components[2].emoji);
  assert.equal(raw.components[4].components[2].label, undefined);
  assert.match(raw.components[0].content, /^## <:gift:.* GIVEAWAY/);
  assert.match(raw.components.at(-1).content, /Hosted by/);
});
test("expired and role-restricted giveaways reject entry without saving", async () => {
  for (const change of [{ endTime: Date.now() - 1 }, { ended: true }, { cancelled: true }, { requireRole: "required" }]) {
    const f = fixture(); Object.assign(f.data, change);
    await handleEntry(f.interaction("alice"), f.deps);
    assert.deepEqual(f.data.participants, []);
    assert.equal(f.calls.includes("save"), false);
    assert.equal(f.calls.at(-1).components[0].type, "error");
  }
});
