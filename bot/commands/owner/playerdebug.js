"use strict";
const { SlashCommandBuilder } = require("discord.js");
module.exports = {
  category: "owner",
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName("playerdebug")
    .setDescription("(Owner) Show detailed active player recovery state"),
};
