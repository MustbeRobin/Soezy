"use strict";
const { SlashCommandBuilder } = require("discord.js");
module.exports = {
  category: "owner",
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName("forcereconnect")
    .setDescription("(Owner) Force Lavalink reconnect and session restoration"),
};
