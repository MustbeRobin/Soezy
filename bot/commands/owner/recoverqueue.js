"use strict";
const { SlashCommandBuilder } = require("discord.js");
module.exports = {
  category: "owner",
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName("recoverqueue")
    .setDescription("(Owner) Rebuild or restore a guild music queue")
    .addStringOption(o => o.setName("guild").setDescription("Guild ID; defaults to current guild")),
};
