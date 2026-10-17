const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("confess")
    .setDescription("Manage the anonymous confession system")
    .addSubcommand(s => s.setName("config").setDescription("Open the confession system configuration panel"))
    .addSubcommand(s => s
      .setName("post")
      .setDescription("Anonymously post a confession")
      .addStringOption(o => o.setName("message").setDescription("Your anonymous confession").setRequired(true).setMaxLength(1000)))
};
