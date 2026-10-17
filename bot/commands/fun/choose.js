const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "fun",
  data: new SlashCommandBuilder()
    .setName("choose")
    .setDescription("Let the bot choose between options")
    .addStringOption(o => o.setName("options").setDescription("Options separated by | (e.g. Pizza | Burger | Tacos)").setRequired(true))
};
