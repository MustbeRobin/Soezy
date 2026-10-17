const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("autoreact")
    .setDescription("Manage automatic reactions to messages")
    .addSubcommand(s => s.setName("list").setDescription("List all autoreact rules"))
    .addSubcommand(s => s.setName("add").setDescription("Add an autoreact trigger")
      .addStringOption(o => o.setName("trigger").setDescription("Trigger text").setRequired(true))
      .addStringOption(o => o.setName("emoji").setDescription("Emoji or space-separated emojis").setRequired(true))
      .addStringOption(o => o.setName("match_mode").setDescription("How the trigger should match").addChoices(
        { name: "Contains", value: "contains" },
        { name: "Exact", value: "exact" },
        { name: "Starts With", value: "starts_with" },
        { name: "Ends With", value: "ends_with" },
      ))
      .addIntegerOption(o => o.setName("cooldown").setDescription("Cooldown in seconds").setMinValue(0).setMaxValue(86400)))
    .addSubcommand(s => s.setName("edit").setDescription("Edit an autoreact trigger")
      .addStringOption(o => o.setName("trigger").setDescription("Existing trigger").setRequired(true))
      .addStringOption(o => o.setName("new_trigger").setDescription("New trigger"))
      .addStringOption(o => o.setName("emoji").setDescription("Emoji or space-separated emojis").setRequired(true))
      .addStringOption(o => o.setName("match_mode").setDescription("How the trigger should match").addChoices(
        { name: "Contains", value: "contains" },
        { name: "Exact", value: "exact" },
        { name: "Starts With", value: "starts_with" },
        { name: "Ends With", value: "ends_with" },
      ))
      .addIntegerOption(o => o.setName("cooldown").setDescription("Cooldown in seconds").setMinValue(0).setMaxValue(86400)))
    .addSubcommand(s => s.setName("remove").setDescription("Remove an autoreact trigger").addStringOption(o => o.setName("trigger").setDescription("Trigger text").setRequired(true)))
};
