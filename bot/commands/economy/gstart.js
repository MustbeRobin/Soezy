const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "economy",
  data: new SlashCommandBuilder()
    .setName("gstart")
    .setDescription("Start a new giveaway in this channel")
    .addStringOption(o => o.setName("prize").setDescription("What are you giving away?").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("How long? e.g. 30m, 2h, 1d, 2:30 (H:MM)").setRequired(true))
    .addIntegerOption(o => o.setName("winners").setDescription("Number of winners (default: 1)").setMinValue(1).setMaxValue(20))
    .addUserOption(o => o.setName("donor").setDescription("Who is donating the prize?"))
};
