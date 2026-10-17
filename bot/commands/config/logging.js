const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("logging")
    .setDescription("Manage the server event logging system")
    .addSubcommand(s => s.setName("config").setDescription("Open the logging configuration panel"))
    .addSubcommand(s => s.setName("enable").setDescription("Enable logging and create missing log channels")
      .addStringOption(o => o.setName("category").setDescription("Logging category to enable (defaults to all)").setRequired(false)
        .addChoices(
          { name: "all", value: "all" }, { name: "vc", value: "vc" }, { name: "message", value: "message" },
          { name: "alert", value: "alert" }, { name: "moderation", value: "moderation" }, { name: "join", value: "join" },
          { name: "leave", value: "leave" }, { name: "system", value: "system" }, { name: "role", value: "role" },
          { name: "member", value: "member" }, { name: "thread", value: "thread" }, { name: "stage", value: "stage" },
          { name: "channel", value: "channel" }, { name: "server", value: "server" }, { name: "event", value: "event" },
          { name: "webhook", value: "webhook" }, { name: "application", value: "application" }
        )))
    .addSubcommand(s => s.setName("disable").setDescription("Disable logging without deleting channels")
      .addStringOption(o => o.setName("category").setDescription("Logging category to disable (defaults to all)").setRequired(false)
        .addChoices(
          { name: "all", value: "all" }, { name: "vc", value: "vc" }, { name: "message", value: "message" },
          { name: "alert", value: "alert" }, { name: "moderation", value: "moderation" }, { name: "join", value: "join" },
          { name: "leave", value: "leave" }, { name: "system", value: "system" }, { name: "role", value: "role" },
          { name: "member", value: "member" }, { name: "thread", value: "thread" }, { name: "stage", value: "stage" },
          { name: "channel", value: "channel" }, { name: "server", value: "server" }, { name: "event", value: "event" },
          { name: "webhook", value: "webhook" }, { name: "application", value: "application" }
        )))
};
