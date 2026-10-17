const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("infect")
    .setDescription("Send a user an infect choice")
    .addSubcommand(sub => sub
      .setName("config")
      .setDescription("Configure Infect"))
    .addSubcommand(sub => sub
      .setName("user")
      .setDescription("Send an Infect choice to a user")
      .addUserOption(option => option.setName("user").setDescription("Target user").setRequired(true))),
};
