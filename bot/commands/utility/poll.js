const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "utility",
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a poll with up to 10 options")
    .addStringOption(o => o.setName("question").setDescription("The poll question").setRequired(true))
    .addStringOption(o => o.setName("options").setDescription("Options separated by | (e.g. Yes | No | Maybe)").setRequired(true))
};
