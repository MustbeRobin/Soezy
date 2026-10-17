"use strict";
const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "owner",
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName("reconnectnodeall")
    .setDescription("(Owner) Reconnect every Lavalink node and restore affected players"),
};
