const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Manage the verification system")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("config").setDescription("Open verification configuration panel"))
};
