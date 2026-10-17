function getShardIdForGuild(guildId, shardCount = process.env.SHARD_COUNT || 1) {
  try {
    return Number((BigInt(guildId) >> 22n) % BigInt(Number(shardCount) || 1));
  } catch {
    return 0;
  }
}

async function shardBroadcast(client, payload) {
  if (!client?.shard) return [payload];
  return client.shard.broadcastEval(
    (c, context) => {
      globalThis.__soezyLastShardBroadcast = context;
      return { shardId: c.shard?.ids?.[0] ?? 0, ok: true };
    },
    { context: payload }
  );
}

async function syncPremiumAcrossShards(client, guildIdOrUserId) {
  invalidatePremiumData?.(guildIdOrUserId);
  if (!client?.shard) return false;
  await shardBroadcast(client, { type: "premium:invalidate", id: guildIdOrUserId }).catch(() => null);
  return true;
}

async function syncMusicAcrossShards(client, guildId, state) {
  soezyCaches?.musicState?.set(`music:${guildId}`, state, 3 * 60 * 1000);
  if (!client?.shard) return false;
  await shardBroadcast(client, { type: "music:update", guildId, state }).catch(() => null);
  return true;
}

Object.assign(globalThis, {
  getShardIdForGuild,
  shardBroadcast,
  syncPremiumAcrossShards,
  syncMusicAcrossShards,
});

module.exports = {
  getShardIdForGuild,
  shardBroadcast,
  syncPremiumAcrossShards,
  syncMusicAcrossShards,
};
