const { ChannelType, SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("goodbye")
    .setDescription("Manage the goodbye message system")
    .addSubcommand(s => s.setName("config").setDescription("Open the goodbye system configuration panel"))
    .addSubcommand(s => s.setName("set-channel").setDescription("Set the goodbye message channel")
      .addChannelOption(o => o.setName("channel").setDescription("Channel for goodbye messages").setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand(s => s.setName("remove-channel").setDescription("Remove the goodbye channel and disable goodbye"))
    .addSubcommand(s => s.setName("show-channel").setDescription("Show the configured goodbye channel"))
    .addSubcommand(s => s.setName("enable").setDescription("Enable goodbye messages"))
    .addSubcommand(s => s.setName("disable").setDescription("Disable goodbye messages"))
};
