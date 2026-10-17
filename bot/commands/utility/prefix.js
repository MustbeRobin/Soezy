const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "utility",
  data: new SlashCommandBuilder()
    .setName("prefix")
    .setDescription("View or change the bot command prefix for this server")
    .addStringOption(o => o.setName("new_prefix").setDescription("New prefix to set for this server"))
};
