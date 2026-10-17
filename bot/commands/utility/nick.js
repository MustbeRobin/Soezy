const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  category: "utility",
  aliases: ["nickname", "setnick", "changenick"],
  requiredPermissions: ["ManageNicknames"],
  data: new SlashCommandBuilder()
    .setName("nick")
    .setDescription("Change a member's server nickname")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption(o => o.setName("user").setDescription("Member to rename").setRequired(true))
    .addStringOption(o => o.setName("nickname").setDescription("New nickname").setRequired(true).setMaxLength(32))
};
