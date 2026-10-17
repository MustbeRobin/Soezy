const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: // ========== CONFIG SLASH COMMANDS ==========
  new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Embed builder — create, edit and list custom embeds")
    .addSubcommand(s => s.setName("list").setDescription("Show all saved embeds for this server"))
    .addSubcommand(s => s.setName("settings").setDescription("Show embed command usage and settings"))
    .addSubcommand(s => s
      .setName("create")
      .setDescription("Create a new embed and open the editor")
      .addStringOption(o => o.setName("name").setDescription("Name for the embed (letters, numbers, _ or -)").setRequired(true).setMaxLength(32)))
    .addSubcommand(s => s
      .setName("edit")
      .setDescription("Open the editor for an existing saved embed")
      .addStringOption(o => o.setName("name").setDescription("Name of the saved embed").setRequired(true).setMaxLength(32)))
};
