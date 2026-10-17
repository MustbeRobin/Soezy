"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const discord = require("discord.js");
const source = fs.readFileSync(path.join(__dirname, "../events/messageCreate.js"), "utf8");
const start = source.indexOf('    if ((cmd === "snipe" || cmd === "s") && !isSnipeAllCommand)');
const end = source.indexOf("/* ================= SNIPE ALL COMMAND", start);
const currentId = "111111111111111111";
const otherId = "222222222222222222";

async function run(args, options = {}) {
  const guild = { id: "guild", members: { me: {} }, channels: {} };
  const channel = id => ({ id, guild, isTextBased: () => true,
    permissionsFor: () => ({ has: () => !options.denied }), toString: () => `<#${id}>` });
  const current = channel(currentId);
  const other = channel(otherId);
  guild.channels.fetch = async id => id === otherId && !options.missing ? other : null;
  let reply;
  const context = { ...discord, cmd: options.alias || "snipe", args, isSnipeAllCommand: false, PREFIX: ",",
    msg: { guild, channel: current, member: {}, reply: payload => { reply = payload; } },
    snipedMessages: new Map([[currentId, { content: "current" }], [otherId, { content: "other" }]]),
    channelSnipeHistory: new Map([[otherId, [{ content: "first" }, { content: "second" }]]]),
    buildSnipeContainer: (message, label) => ({ message, label }),
    createErrorContainer: (title, description) => ({ title, description }) };
  if (options.empty) context.snipedMessages.clear(), context.channelSnipeHistory.clear();
  await vm.runInNewContext(`(async () => { ${source.slice(start, end)} })()`, context);
  return reply.components[0];
}

test("snipe defaults to the current channel", async () => {
  assert.equal((await run([])).message.content, "current");
});
test("snipe channel mention and ID select the requested channel, including alias", async () => {
  for (const argument of [`<#${otherId}>`, otherId]) {
    assert.equal((await run([argument], { alias: "s" })).message.content, "other");
  }
});
test("snipe accepts a history number before or after the channel", async () => {
  for (const args of [[`<#${otherId}>`, "2"], ["2", `<#${otherId}>`]]) {
    assert.equal((await run(args)).message.content, "second");
  }
});
test("snipe refuses malformed arguments and uses the server prefix", async () => {
  for (const args of [["0"], ["-1"], ["1.5"], ["abc"], ["channel"], ["2", "3"]]) {
    assert.match((await run(args)).description, /,snipe/);
  }
});
test("snipe refuses inaccessible or missing channels, including legacy channel syntax", async () => {
  for (const args of [[`<#${otherId}>`], ["channel", `<#${otherId}>`]]) {
    assert.equal((await run(args, { denied: true })).title, "Missing Permissions");
    assert.equal((await run(args, { missing: true })).title, "That's Not a Channel, Bestie");
  }
});
test("snipe handles empty history and out-of-range indexes", async () => {
  assert.equal((await run([], { empty: true })).title, "Nothing to Snipe");
  assert.equal((await run([otherId, "3"])).title, "Invalid Index");
});
