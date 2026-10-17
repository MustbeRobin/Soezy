const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("warnpunish")
    .setDescription("Manage warn escalation punishments")
    .addSubcommand(s => s.setName("config").setDescription("Open the warn escalation configuration panel"))
};
