const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("joindm")
    .setDescription("Manage join DM messages sent to new members")
    .addSubcommand(s => s.setName("config").setDescription("Open the join DM configuration panel"))
};
