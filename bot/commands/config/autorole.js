const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("Manage automatic role assignment on join")
    .addSubcommand(s => s.setName("config").setDescription("Open the autorole configuration panel"))
    .addSubcommand(s => s.setName("list").setDescription("List all configured auto roles"))
};
