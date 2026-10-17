const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "utility",
  data: new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Set your AFK status")
    .addStringOption(o => o.setName("reason").setDescription("Your AFK reason"))
    .addStringOption(o => o.setName("type").setDescription("AFK type")
      .addChoices(
        { name: "Server", value: "server" },
        { name: "Global", value: "global" }
      ))
};
