const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "utility",
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show the help menu with all available commands")
    .addStringOption(o => o.setName("command").setDescription("Specific command to get detailed help for"))
};
