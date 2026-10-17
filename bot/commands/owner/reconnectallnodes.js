"use strict";
const { SlashCommandBuilder } = require("discord.js");
module.exports = {
  category: "owner",
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName("reconnectallnodes")
    .setDescription("(Owner) Reconnect every Lavalink node and rebalance players"),
};
