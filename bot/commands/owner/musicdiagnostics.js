"use strict";
const { SlashCommandBuilder } = require("discord.js");
module.exports = {
  category: "owner",
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName("musicdiagnostics")
    .setDescription("(Owner) Show Lavalink, player, queue, and websocket diagnostics"),
};
