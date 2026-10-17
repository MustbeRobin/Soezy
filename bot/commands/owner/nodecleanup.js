"use strict";
const { SlashCommandBuilder } = require("discord.js");
module.exports = {
  category: "owner",
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName("nodecleanup")
    .setDescription("(Owner) Clean stale Lavalink node/player runtime state"),
};
