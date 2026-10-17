"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const discord = require("discord.js");
const containerBuilder = require("../utils/containerBuilder");

const botCross = "<:scross:1559257945030525110>";

test("shared Remaining Setup renderer uses the bot cross emoji for every missing item", () => {
  const previous = globalThis.EMOJIS;
  const previousNoEmoji = globalThis.NO_EMOJI;
  const previousContainerBuilder = globalThis.ContainerBuilder;
  globalThis.EMOJIS = { warning: "<:huh:1502437804129386587>", scross: botCross };
  globalThis.NO_EMOJI = "❌";
  globalThis.ContainerBuilder = discord.ContainerBuilder;
  try {
    const panel = containerBuilder.createRemainingSetupContainer(["Channel", "Message"]).toJSON();
    const content = panel.components.find(component => component.type === discord.ComponentType.TextDisplay).content;
    assert.match(content, /\*\*Missing\*\*/);
    assert.equal((content.match(/<:scross:1559257945030525110>/g) || []).length, 2);
    assert.match(content, /> <:scross:1559257945030525110> Channel/);
    assert.match(content, /> <:scross:1559257945030525110> Message/);
  } finally {
    if (previous === undefined) delete globalThis.EMOJIS;
    else globalThis.EMOJIS = previous;
    if (previousNoEmoji === undefined) delete globalThis.NO_EMOJI;
    else globalThis.NO_EMOJI = previousNoEmoji;
    if (previousContainerBuilder === undefined) delete globalThis.ContainerBuilder;
    else globalThis.ContainerBuilder = previousContainerBuilder;
  }
});
