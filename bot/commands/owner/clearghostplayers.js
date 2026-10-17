"use strict";
const { SlashCommandBuilder } = require("discord.js");
module.exports = {
  category: "owner",
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName("clearghostplayers")
    .setDescription("(Owner) Remove orphaned players, voice states, and stale queues"),
};
