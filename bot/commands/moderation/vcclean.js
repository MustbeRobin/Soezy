const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("vcclean")
    .setDescription("Delete messages from voice channel chats with configurable delay")
    .addChannelOption(o => 
      o.setName("channel")
        .setDescription("Voice channel to clean (defaults to your current VC)")
        .setRequired(false)
    )
    .addStringOption(o =>
      o.setName("scope")
        .setDescription("Messages to delete")
        .addChoices(
          { name: "All messages", value: "all" },
          { name: "Chat messages", value: "chat" },
          { name: "Images and attachments", value: "images" },
        )
        .setRequired(false)
    )
    .addIntegerOption(o => 
      o.setName("delay")
        .setDescription("Delay between deletions in milliseconds (50-5000, default 100)")
        .setMinValue(50)
        .setMaxValue(5000)
        .setRequired(false)
    )
    .addIntegerOption(o => 
      o.setName("limit")
        .setDescription("Max messages to delete (1-1000, default 1000)")
        .setMinValue(1)
        .setMaxValue(1000)
        .setRequired(false)
    )
};
