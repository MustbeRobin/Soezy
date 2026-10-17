const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("Manage the anti-raid protection system")
    .addSubcommand(s => s.setName("config").setDescription("Open the anti-raid configuration panel"))
};
