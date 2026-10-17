const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("Manage or set birthdays")
    .addSubcommand(s => s.setName("config").setDescription("Open the birthday system configuration panel (Manage Server only)"))
    .addSubcommand(s =>
      s.setName("set")
        .setDescription("Set your birthday or a member's birthday")
        .addStringOption(o => o.setName("date").setDescription("Birthday date (YYYY-MM-DD)").setRequired(true))
        .addUserOption(o => o.setName("user").setDescription("The user to set the birthday for (requires Manage Server)").setRequired(false))
    )
    .addSubcommand(s =>
      s.setName("add")
        .setDescription("Add your birthday or a member's birthday")
        .addStringOption(o => o.setName("date").setDescription("Birthday date (YYYY-MM-DD)").setRequired(true))
        .addUserOption(o => o.setName("user").setDescription("The user to add the birthday for (requires Manage Server)").setRequired(false))
    )
};
