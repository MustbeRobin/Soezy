const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "utility",
  data: new SlashCommandBuilder()
    .setName("translate")
    .setDescription("Translate text to another language")
    .addStringOption(o => o.setName("language").setDescription("Target language (e.g. spanish, french, ja)").setRequired(true))
    .addStringOption(o => o.setName("text").setDescription("Text to translate (leave empty to translate a replied message)"))
};
