(() => {
  if (client._antiBetrayal) return;
  const { createAntiBetrayal } = require('./utils/antiBetrayal');
  const { securityListLimit } = require('./utils/premiumListLimits');
  client._antiBetrayal = createAntiBetrayal({
    getClient: () => client,
    getDatabase: () => db,
    getRoleLimit: (database, actorId, guildId) => securityListLimit(database, actorId, guildId),
    save: async guildId => {
      if (typeof client._saveDatabase !== 'function' || !await client._saveDatabase(guildId)) throw new Error('Database save unavailable.');
      return true;
    },
    authorize: (guildId, actorId) => globalThis.soezyOwnerManager?.isBotOwner?.(actorId) === true ||
      globalThis.isConfiguredBotOwner?.(actorId) === true || (config.ownerIds || []).includes(actorId) ||
      (db.guilds?.[guildId]?.extraOwners || []).includes(actorId)
  });
  client.on('guildAuditLogEntryCreate', (entry, guild) => {
    client._antiBetrayal.consume(entry, guild).catch(error => console.error('[Anti-Betrayal] Evaluation failed; no retry:', error.message));
  });
})();
