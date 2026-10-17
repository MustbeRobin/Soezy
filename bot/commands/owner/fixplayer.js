"use strict";
const { SlashCommandBuilder } = require("discord.js");
module.exports = {
  category: "owner",
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName("fixplayer")
    .setDescription("(Owner) Recover a stuck player and preserve its queue")
    .addStringOption(o => o.setName("guild").setDescription("Guild ID; defaults to current guild")),
};
