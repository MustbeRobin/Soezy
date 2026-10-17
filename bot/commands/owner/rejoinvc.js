"use strict";
const { SlashCommandBuilder } = require("discord.js");
module.exports = {
  category: "owner",
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName("rejoinvc")
    .setDescription("(Owner) Force leave/rejoin voice and resume playback safely")
    .addStringOption(o => o.setName("guild").setDescription("Guild ID; defaults to current guild")),
};
