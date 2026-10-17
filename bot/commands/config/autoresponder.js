const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("autoresponder")
    .setDescription("Manage automatic responses to trigger words")
    .addSubcommand(s => s.setName("list").setDescription("List all autoresponders"))
    .addSubcommand(s => s.setName("add").setDescription("Add an autoresponder")
      .addStringOption(o => o.setName("trigger").setDescription("Trigger text").setRequired(true))
      .addStringOption(o => o.setName("response").setDescription("Response").setRequired(true))
      .addStringOption(o => o.setName("match_mode").setDescription("How the trigger should match").addChoices(
        { name: "Contains", value: "contains" },
        { name: "Exact", value: "exact" },
        { name: "Starts With", value: "starts_with" },
        { name: "Ends With", value: "ends_with" },
      ))
      .addStringOption(o => o.setName("reply_mode").setDescription("How to send the response").addChoices(
        { name: "Reply", value: "reply" },
        { name: "Send", value: "send" },
      ))
      .addIntegerOption(o => o.setName("cooldown").setDescription("Cooldown in seconds").setMinValue(0).setMaxValue(86400))
      .addBooleanOption(o => o.setName("case_sensitive").setDescription("Match case-sensitive text")))
    .addSubcommand(s => s.setName("edit").setDescription("Edit an autoresponder")
      .addStringOption(o => o.setName("trigger").setDescription("Existing trigger").setRequired(true))
      .addStringOption(o => o.setName("new_trigger").setDescription("New trigger"))
      .addStringOption(o => o.setName("response").setDescription("New response").setRequired(true))
      .addStringOption(o => o.setName("match_mode").setDescription("How the trigger should match").addChoices(
        { name: "Contains", value: "contains" },
        { name: "Exact", value: "exact" },
        { name: "Starts With", value: "starts_with" },
        { name: "Ends With", value: "ends_with" },
      ))
      .addStringOption(o => o.setName("reply_mode").setDescription("How to send the response").addChoices(
        { name: "Reply", value: "reply" },
        { name: "Send", value: "send" },
      ))
      .addIntegerOption(o => o.setName("cooldown").setDescription("Cooldown in seconds").setMinValue(0).setMaxValue(86400))
      .addBooleanOption(o => o.setName("case_sensitive").setDescription("Match case-sensitive text")))
    .addSubcommand(s => s.setName("remove").setDescription("Remove an autoresponder").addStringOption(o => o.setName("trigger").setDescription("Trigger text").setRequired(true)))
};
