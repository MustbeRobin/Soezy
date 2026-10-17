"use strict";
const { SlashCommandBuilder } = require("discord.js");
module.exports = {
  category: "owner",
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName("reconnectnode")
    .setDescription("(Owner) Reconnect one Lavalink node and restore affected players")
    .addStringOption(o => o.setName("node").setDescription("Lavalink node name").setRequired(true)),
};
