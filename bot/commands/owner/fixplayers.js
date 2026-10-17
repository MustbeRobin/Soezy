"use strict";
const { SlashCommandBuilder } = require("discord.js");
module.exports = {
  category: "owner",
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName("fixplayers")
    .setDescription("(Owner) Scan and recover broken music players"),
};
