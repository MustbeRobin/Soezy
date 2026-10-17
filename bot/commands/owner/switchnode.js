"use strict";
const { SlashCommandBuilder } = require("discord.js");
module.exports = {
  category: "owner",
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName("switchnode")
    .setDescription("(Owner) Move a guild player to a healthier Lavalink node")
    .addStringOption(o => o.setName("guild").setDescription("Guild ID; defaults to current guild")),
};
