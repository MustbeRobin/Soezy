const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("autojail")
    .setDescription("Configure automatic jailing")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub
      .setName("config")
      .setDescription("Open the Auto-Jail configuration panel")
    ),
};
