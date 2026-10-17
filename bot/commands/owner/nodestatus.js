"use strict";
const { SlashCommandBuilder } = require("discord.js");
module.exports = {
  category: "owner",
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName("nodestatus")
    .setDescription("(Owner) Show Lavalink node health and reconnect attempts"),
};
