"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Collection, ChannelType } = require("discord.js");
const { rankedGuilds, handleServerDirectory, buildServerPage, handleServerPage } = require("../utils/serverDirectory");
function fixture() {
  let payload, invites = 0;
  const guilds = new Collection();
  for (const [id, memberCount] of [["2", 100], ["1", 100], ["3", 500]]) {
    guilds.set(id, { id, name: `Server ${id}`, memberCount, members: { me: {} }, channels: { fetch: async () => new Collection([["ch", { type: ChannelType.GuildText, permissionsFor: () => ({ has: () => true }), createInvite: async options => { invites++; assert.equal(options.maxUses, 1); return { url: "https://discord.gg/test" }; } }]]) } });
  }
  const client = { guilds: { cache: guilds } };
  const msg = { author: { id: "owner" }, reply: async p => { payload = p; } };
  return { client, msg, config: { ownerIds: ["owner"] }, text: () => JSON.stringify(payload), invites: () => invites };
}
test("server ranking sorts descending with deterministic ties and does not create invites", async () => {
  const f = fixture();
  assert.deepEqual(rankedGuilds(f.client).map(g => g.id), ["3", "1", "2"]);
  await handleServerDirectory(f.msg, [], ",", f);
  assert.match(f.text(), /#1 Server 3/);
  assert.match(f.text(), /,link server/);
  assert.equal(f.invites(), 0);
});
test("ranked invite targets one server and rejects invalid ranks and non-owners", async () => {
  const f = fixture();
  await handleServerDirectory(f.msg, ["server", "1"], ",", { ...f, invite: true });
  assert.match(f.text(), /#1 Server 3/);
  assert.equal(f.invites(), 1);
  for (const rank of ["0", "-1", "1x", "99"]) await handleServerDirectory(f.msg, ["server", rank], ",", { ...f, invite: true });
  assert.equal(f.invites(), 1);
  f.msg.author.id = "other";
  await handleServerDirectory(f.msg, ["server", "1"], ",", { ...f, invite: true });
  assert.match(f.text(), /Access Denied/);
  assert.equal(f.invites(), 1);
});
test("ranking paginates and invite failures are handled", async () => {
  const f = fixture();
  for (let i = 4; i <= 40; i++) f.client.guilds.cache.set(String(i), { id: String(i), name: "Extra", memberCount: 1 });
  await handleServerDirectory(f.msg, ["2"], ",", f);
  assert.match(f.text(), /Page 2\/3/);
  assert.match(f.text(), /#16/);
  f.client.guilds.cache.get("3").channels.fetch = async () => { throw Error("forbidden"); };
  await handleServerDirectory(f.msg, ["server", "1"], ",", { ...f, invite: true });
  assert.match(f.text(), /Invite Unavailable/);
});

test("page buttons update the original container and enforce ownership", async () => {
  const f = fixture();
  for (let i = 4; i <= 40; i++) f.client.guilds.cache.set(String(i), { id: String(i), name: "Extra", memberCount: 1 });
  const buttons = page => buildServerPage(f.client, "owner", page, ",").components[0].toJSON().components.at(-1).components;
  assert.equal(buttons(1)[0].disabled, true);
  assert.equal(buttons(1)[2].disabled, false);
  assert.equal(buttons(3)[2].disabled, true);
  assert.equal(new Set(buttons(1).map(b => b.custom_id)).size, 3);
  let updated, denied;
  const interaction = { customId: "serverpage_owner_2", user: { id: "owner" }, update: async p => { updated = p; }, reply: async p => { denied = p; } };
  await handleServerPage(interaction, { ...f, prefix: "," });
  assert.match(JSON.stringify(updated), /#16/);
  assert.equal(denied, undefined);
  updated = undefined;
  interaction.user.id = "other";
  await handleServerPage(interaction, { ...f, prefix: "," });
  assert.equal(updated, undefined);
  assert.ok(denied);
  interaction.user.id = "owner";
  f.config.ownerIds = [];
  await handleServerPage(interaction, { ...f, prefix: "," });
  assert.equal(updated, undefined);
});
