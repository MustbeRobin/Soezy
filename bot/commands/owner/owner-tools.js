const { SlashCommandBuilder } = require("discord.js");

module.exports = [
  new SlashCommandBuilder().setName("ownerhelp").setDescription("Owner-only command menu"),
  new SlashCommandBuilder().setName("memory").setDescription("Owner-only memory and runtime usage"),
  new SlashCommandBuilder().setName("runtime").setDescription("Owner-only runtime cache summary"),
  new SlashCommandBuilder().setName("diagnostics").setDescription("Owner-only diagnostics summary"),
  new SlashCommandBuilder().setName("collectors").setDescription("Owner-only collector summary"),
  new SlashCommandBuilder().setName("cache").setDescription("Owner-only cache summary"),
  new SlashCommandBuilder().setName("ratelimits").setDescription("Owner-only rate limit summary"),
  new SlashCommandBuilder().setName("queues").setDescription("Owner-only queue summary"),
  new SlashCommandBuilder().setName("eval").setDescription("Owner-only eval; disabled unless SOEZY_ENABLE_EVAL=1")
    .addStringOption(o => o.setName("code").setDescription("JavaScript to evaluate").setRequired(true)),
  new SlashCommandBuilder().setName("refreshconfig").setDescription("Refresh a guild's runtime config")
    .addStringOption(o => o.setName("guild").setDescription("Guild ID; defaults to current guild")),
  new SlashCommandBuilder().setName("refreshcache").setDescription("Rebuild runtime cache from database"),
  new SlashCommandBuilder().setName("clearcollectors").setDescription("Stop stale collectors")
    .addStringOption(o => o.setName("guild").setDescription("Optional guild ID")),
  new SlashCommandBuilder().setName("panelrefresh").setDescription("Invalidate config panel sessions")
    .addStringOption(o => o.setName("guild").setDescription("Guild ID; defaults to current guild")),
  new SlashCommandBuilder().setName("clearqueues").setDescription("Clear all active music queues"),
  new SlashCommandBuilder().setName("forcedbsave").setDescription("Force save database and sync runtime state"),
  new SlashCommandBuilder().setName("blacklistuser").setDescription("Manage globally blacklisted users")
    .addSubcommand(s => s.setName("add").setDescription("Globally blacklist a user")
      .addUserOption(o => o.setName("user").setDescription("User to blacklist").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason")))
    .addSubcommand(s => s.setName("list").setDescription("List globally blacklisted users")
      .addIntegerOption(o => o.setName("page").setDescription("Page number").setMinValue(1))),
  new SlashCommandBuilder().setName("unblacklistuser").setDescription("Remove a user from all blacklist paths")
    .addUserOption(o => o.setName("user").setDescription("User to unblacklist").setRequired(true)),
  new SlashCommandBuilder().setName("blacklistserver").setDescription("Manage blacklisted servers")
    .addSubcommand(s => s.setName("add").setDescription("Blacklist a server and leave it")
      .addStringOption(o => o.setName("guild").setDescription("Guild ID").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason")))
    .addSubcommand(s => s.setName("remove").setDescription("Remove a server from the blacklist")
      .addStringOption(o => o.setName("guild").setDescription("Guild ID").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("List blacklisted servers")
      .addIntegerOption(o => o.setName("page").setDescription("Page number").setMinValue(1))),
].map(data => ({ category: "owner", ownerOnly: true, data }));
