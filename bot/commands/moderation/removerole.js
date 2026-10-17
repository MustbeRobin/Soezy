const { SlashCommandBuilder } = require("discord.js");

module.exports = [
  {
    category: "moderation",
    data: new SlashCommandBuilder()
      .setName("removerole")
      .setDescription("Remove a role from one member")
      .addUserOption(option => option.setName("member").setDescription("Member to update").setRequired(true))
      .addRoleOption(option => option.setName("role").setDescription("Role to remove").setRequired(true)),
  },
];
