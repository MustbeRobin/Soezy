const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription("Configure security whitelist users, roles, and channels")
    .addSubcommand(s => s.setName("config").setDescription("Open whitelist configuration panel")),
};
