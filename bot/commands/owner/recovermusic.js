"use strict";
const { SlashCommandBuilder } = require("discord.js");
module.exports = {
  category: "owner",
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName("recovermusic")
    .setDescription("(Owner) Run global music recovery and ghost cleanup"),
};
