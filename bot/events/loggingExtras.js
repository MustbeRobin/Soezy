/* Event families not covered by the legacy logging listeners. */
(() => {
const events = [
  "threadCreate", "threadDelete", "threadUpdate",
  "stageInstanceCreate", "stageInstanceDelete", "stageInstanceUpdate",
  "guildScheduledEventCreate", "guildScheduledEventDelete", "guildScheduledEventUpdate",
  "guildIntegrationsUpdate", "applicationCommandPermissionsUpdate", "inviteCreate", "inviteDelete",
];
for (const event of events) {
  client.on(event, async (...args) => {
    try {
      if (event === "threadCreate" && args[1] !== true) return;
      const updating = ["threadUpdate", "stageInstanceUpdate", "guildScheduledEventUpdate"].includes(event);
      const item = updating ? args[1] : args[0];
      const guild = item?.guild || (event === "guildIntegrationsUpdate" ? item : client.guilds.cache.get(item?.guildId));
      if (!guild) return;
      const lg = guildData(guild.id).logging;
      if (!lg?.enabled || !lg.events?.[event]) return;
      const fields = [{ name: "ID", value: String(item.id || item.code || guild.id) }];
      const properties = ["name", "topic", "archived", "locked", "status", "channelId", "applicationId", "scheduledStartTimestamp", "scheduledEndTimestamp"];
      for (const key of properties) {
        const value = item[key];
        if (value === undefined || value === null) continue;
        if (updating && args[0]?.[key] === value) continue;
        fields.push({ name: key, value: updating ? `${String(args[0]?.[key] ?? "Unknown").slice(0, 400)} -> ${String(value).slice(0, 400)}` : String(value).slice(0, 900) });
      }
      await sendConfiguredLogging(guild, event, {
        title: event.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()), fields,
      });
    } catch (error) { console.warn(`[LOGGING] ${event} failed (${error.code || error.name})`); }
  });
}
})();
