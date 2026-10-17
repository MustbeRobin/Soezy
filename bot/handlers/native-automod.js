/* Native rules are reconciled after saved settings change, never per message. */
(() => {
  const service = require("./utils/nativeAutomodService");
  const fingerprints = new Map();
  const timers = new Map();
  const deps = { guildData, saveDB, words: { badWords, nsfwWords, badWordEnabled: badWordFilter.enabled } };
  globalThis.soezyNativeAutomodDeps = deps;
  const fingerprint = gd => JSON.stringify([gd.nativeAutomod?.protections, Object.fromEntries(Object.entries(gd).filter(([key]) => /^(badWord|nsfw|customBad|customNsfw|automod|antilink|security|whitelist|immune)/.test(key)))]);
  globalThis.scheduleNativeAutomod = id => {
    const guild = client.guilds.cache.get(String(id));
    if (!guild || !client.isReady()) return;
    const gd = guildData(id);
    if (!gd.nativeAutomod?.syncEnabled) return;
    const value = fingerprint(gd);
    if (fingerprints.get(id) === value) return;
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(async () => {
      timers.delete(id);
      if (!gd.nativeAutomod?.syncEnabled) return;
      fingerprints.set(id, value);
      try {
        await service.syncFilters(guild, deps);
        saveDB(id);
      } catch (error) {
        fingerprints.delete(id);
        gd.nativeAutomod.lastError = service.apiError(error);
        console.error(`[NATIVE AUTOMOD] guild=${id}: ${gd.nativeAutomod.lastError}`);
      }
    }, 1500));
  };
  client.once("clientReady", () => {
    for (const guild of client.guilds.cache.values()) globalThis.scheduleNativeAutomod(guild.id);
  });
  client.on("channelCreate", channel => { fingerprints.delete(channel.guildId); globalThis.scheduleNativeAutomod(channel.guildId); });
  client.on("channelDelete", channel => { fingerprints.delete(channel.guildId); globalThis.scheduleNativeAutomod(channel.guildId); });
})();
