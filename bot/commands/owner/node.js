const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "owner",
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName("node")
    .setDescription("Manage Lavalink nodes")
    .addSubcommand(s => s
      .setName("status")
      .setDescription("Show Lavalink node status"))
    .addSubcommand(s => s
      .setName("reconnect")
      .setDescription("Reconnect a Lavalink node, or all nodes")
      .addStringOption(o => o.setName("node").setDescription("Node name, or all").setRequired(false)))
    .addSubcommand(s => s
      .setName("restart")
      .setDescription("Restart a Lavalink node, or all nodes")
      .addStringOption(o => o.setName("node").setDescription("Node name, or all").setRequired(false)))
    .addSubcommand(s => s
      .setName("switch")
      .setDescription("Recover a guild player onto a healthy node")
      .addStringOption(o => o.setName("node").setDescription("Guild ID to recover").setRequired(false)))
    .addSubcommand(s => s
      .setName("players")
      .setDescription("Show tracked music players"))
};
