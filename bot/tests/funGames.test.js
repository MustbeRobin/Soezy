"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const discord = require("discord.js");
const source = fs.readFileSync(path.join(__dirname, "../utils/funGames.js"), "utf8");

class TestMap extends Map {
  constructor() { super(); }
}

function harness() {
  const context = vmContext();
  return context;
}

function vmContext() {
  const vm = require("node:vm");
  const context = vm.createContext({
    ...discord,
    ManagedMap: TestMap,
    guildData: () => ({ fun: { enabled: true } }),
    createErrorContainer: (title, description) => ({ title, description }),
    require,
  });
  vm.runInContext(source, context);
  return context;
}

function fakeChannel() {
  const collectors = [], sent = [];
  return {
    id: "channel-1", collectors, sent,
    createMessageCollector(options) {
      const collector = new EventEmitter();
      collector.options = options;
      collector.stop = reason => collector.emit("end", new Map(), reason);
      collectors.push(collector);
      return collector;
    },
    async send(payload) { sent.push(payload); return { id: "sent-1" }; },
  };
}

test("fast type prompts with a word and ends after the first exact match or 15 seconds", async () => {
  const ctx = harness(), channel = fakeChannel(), prompt = { id: "prompt-1" };
  const result = await ctx.soezyFunGames.startFastType({
    guildId: "guild-1", channel, user: { id: "host" }, sendPrompt: async payload => { prompt.payload = payload; return prompt; },
  });
  assert.equal(result, prompt);
  assert.equal(channel.collectors[0].options.time, 15000);
  const word = prompt.payload.embeds[0].toJSON().description.match(/\*\*(\w+)\*\*/)[1];
  assert.equal(channel.collectors[0].options.filter({ author: { bot: false }, content: word }), true);
  assert.equal(channel.collectors[0].options.filter({ author: { bot: false }, content: `${word}!` }), false);
});

test("number guess has host-controlled start/stop buttons and collects guesses in-channel", async () => {
  const ctx = harness(), channel = fakeChannel();
  let updated;
  const prompt = { async edit(payload) { updated = payload; } };
  await ctx.soezyFunGames.startNumberGuess({
    guildId: "guild-1", channel, user: { id: "host" }, sendPrompt: async payload => { prompt.initial = payload; return prompt; },
  });
  const initial = prompt.initial.components[0].toJSON();
  const buttons = initial.components.find(component => component.type === discord.ComponentType.ActionRow).components;
  assert.deepEqual(buttons.map(button => button.label), ["Start Game", "Stop Game"]);
  const startId = buttons[0].custom_id;
  const interaction = {
    customId: startId, channelId: channel.id, channel, user: { id: "host" },
    memberPermissions: { has: () => false },
    async update(payload) { this.updated = payload; },
  };
  await ctx.soezyFunGames.handleNumberGuessButton(interaction);
  assert.equal(channel.collectors[0].options.time, 120000);
  assert.match(interaction.updated.components[0].toJSON().components[0].content, /Game started/);

  const game = [...ctx.numberGuessGames.values()][0];
  let replyPayload;
  channel.collectors[0].emit("collect", {
    author: { id: "player", bot: false }, content: String(game.number),
    reply: async payload => { replyPayload = payload; },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ctx.numberGuessGames.size, 0);
  assert.match(updated.components[0].toJSON().components[0].content, /got it right/);
  assert.match(replyPayload.components[0].toJSON().components[0].content, /finished in \*\*1\*\* attempt/);
});
