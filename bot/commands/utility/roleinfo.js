const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "utility",
  data: new SlashCommandBuilder()
    .setName("roleinfo")
    .setDescription("View detailed information about a role")
    .addRoleOption(o => o.setName("role").setDescription("The role to get information about").setRequired(true))
};
