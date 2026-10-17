const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("antinuke")
    .setDescription("Manage the anti-nuke protection system")
    .addSubcommand(s => s.setName("config").setDescription("Open the anti-nuke configuration panel"))
};
