const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "utility",
  data: new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Set a reminder for yourself")
    .addStringOption(o => o.setName("time").setDescription("When to remind you (e.g. 10m, 1h, 1d)").setRequired(true))
    .addStringOption(o => o.setName("message").setDescription("What to remind you about").setRequired(true))
    .addStringOption(o => o.setName("repeat").setDescription("Repeat every (e.g. 10m, 19h, 1d)").setRequired(false))
};
