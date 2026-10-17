"use strict";
/* ================= CONSOLIDATED MUSIC MANAGER ================= */
(() => {
let redactRecoveryError;
try { ({ redactLavalinkError: redactRecoveryError } = require("./lavalinkConfig")); }
catch { ({ redactLavalinkError: redactRecoveryError } = require("./utils/lavalinkConfig")); }
const nodeHealth = globalThis.__soezyNodeHealth || require("./runtimeManager").nodeHealth;
let metricInc = null;
try { ({ incMetric: metricInc } = require("./metrics")); } catch {}

const destroyLocks = globalThis.__soezyMusicDestroyLocks || (globalThis.__soezyMusicDestroyLocks = new Set());
const panelCollectors = globalThis.__soezyMusicPanelCollectors || (globalThis.__soezyMusicPanelCollectors = new Map());

function getGuildId(input) {
  return typeof input === "string" ? input : input?.guildId || input?.guild?.id || null;
}

function registerMusicCollector(guildId, key, collector, meta = {}) {
  if (!guildId || !key || !collector) return collector;
  const registryKey = `${guildId}:${key}`;
  const existing = panelCollectors.get(registryKey);
  if (existing?.collector && existing.collector !== collector) existing.collector.stop?.("replaced");
  panelCollectors.set(registryKey, { collector, guildId, key, meta, createdAt: Date.now() });
  collector.once?.("end", () => panelCollectors.delete(registryKey));
  return collector;
}

function cleanupMusicCollectors(guildId, reason = "cleanup") {
  let count = 0;
  for (const [key, entry] of panelCollectors.entries()) {
    if (guildId && entry.guildId !== guildId) continue;
    entry.collector?.stop?.(reason);
    panelCollectors.delete(key);
    count++;
  }
  if (typeof cleanupCollectors === "function") {
    try { count += cleanupCollectors(guildId ? { guildId } : { all: true }); } catch {}
  }
  return count;
}

function cleanupIdleTimers(queue) {
  if (!queue) return 0;
  let count = 0;
  if (queue.idleTimer) { clearTimeout(queue.idleTimer); queue.idleTimer = null; count++; }
  if (queue.voiceRecoveryTimer) { clearTimeout(queue.voiceRecoveryTimer); queue.voiceRecoveryTimer = null; count++; }
  if (queue.lyricsTimer) { clearInterval(queue.lyricsTimer); queue.lyricsTimer = null; count++; }
  return count;
}

async function disableMessageComponents(message) {
  if (!message?.edit || !message.components?.length) return false;
  const disabled = message.components.map(row => {
    const json = typeof row.toJSON === "function" ? row.toJSON() : row;
    return {
      ...json,
      components: (json.components || []).map(component => ({ ...component, disabled: true })),
    };
  });
  await message.edit({ components: disabled }).catch(() => null);
  return true;
}

async function cleanupPlayerMessages(queue, options = {}) {
  if (!queue) return 0;
  let count = 0;
  const disableOnly = options.disableOnly !== false;
  if (queue.nowPlayingMsg) {
    if (disableOnly) await disableMessageComponents(queue.nowPlayingMsg);
    else await queue.nowPlayingMsg.delete?.().catch(() => null);
    queue.nowPlayingMsg = null;
    count++;
  }
  if (queue.liveLyricsMsg) {
    await queue.liveLyricsMsg.delete?.().catch(() => null);
    queue.liveLyricsMsg = null;
    count++;
  }
  return count;
}

function cleanupRecoveryCache(guildId, client = null) {
  const db = client?._db || globalThis.db || null;
  let changed = false;
  if (db?.musicQueueStates?.[guildId]) {
    delete db.musicQueueStates[guildId];
    changed = true;
  }
  try { if (typeof cacheMusicState === "function") cacheMusicState(guildId, null); } catch {}
  if (changed && typeof saveDB === "function") {
    try { saveDB(); } catch {}
  }
  return changed;
}

function clearQueueState(queue) {
  if (!queue) return;
  if (Array.isArray(queue.tracks)) queue.tracks.length = 0;
  if (Array.isArray(queue.history)) queue.history.length = 0;
  if (Array.isArray(queue.autoplayHistory)) queue.autoplayHistory.length = 0;
  queue.current = null;
  queue.previousTrack = null;
  queue.loop = "off";
  queue.autoplay = false;
  queue.replay = false;
  queue.recoveryPosition = 0;
}

function cleanupMusicRuntime(guildId, maps = {}) {
  for (const map of Object.values(maps)) {
    if (!map?.delete) continue;
    map.delete(guildId);
    if (map.keys) {
      for (const key of map.keys()) {
        if (String(key).startsWith(`${guildId}:`)) map.delete(key);
      }
    }
  }
  if (maps.pendingPlaylistAdd?.keys) {
    for (const key of maps.pendingPlaylistAdd.keys()) {
      if (String(key).startsWith(`${guildId}_`)) maps.pendingPlaylistAdd.delete(key);
    }
  }
}

async function destroyPlayerSafely({ guildId, queue, shoukaku, reason = "cleanup" } = {}) {
  guildId = guildId || getGuildId(queue);
  if (!guildId) return false;
  if (destroyLocks.has(guildId)) return false;
  destroyLocks.add(guildId);
  try {
    if (queue) {
      queue.destroyed = true;
      clearQueueState(queue);
      try { queue.player?.removeAllListeners?.(); } catch {}
      try { await queue.player?.setPaused?.(false); } catch {}
      try { await queue.player?.stopTrack?.(); } catch {}
      try { await queue.player?.destroy?.(); } catch {}
    }
    try { await shoukaku?.leaveVoiceChannel?.(guildId); } catch {}
    return true;
  } finally {
    setTimeout(() => destroyLocks.delete(guildId), 250).unref?.();
  }
}

Object.assign(globalThis, {
  destroyPlayerSafely,
  cleanupMusicCollectors,
  cleanupMusicRuntime,
  cleanupPlayerMessages,
  cleanupIdleTimers,
  cleanupRecoveryCache,
  clearQueueState,
  registerMusicCollector,
  soezyMusicPanelCollectors: panelCollectors,
  soezyMusicDestroyLocks: destroyLocks,
});


const MUSIC_EDIT_THROTTLE_MS = 5000;
const MUSIC_STATE_TTL_MS = 3 * 60 * 1000;

const musicEditState = globalThis.__soezyMusicEditState || (globalThis.__soezyMusicEditState = new Map());

function getMusicEditKey(message) {
  return message?.id || message?.channelId || "unknown";
}

async function throttledMusicEdit(message, payload, options = {}) {
  if (!message?.edit) return null;
  const key = options.key || getMusicEditKey(message);
  const throttleMs = options.throttleMs || MUSIC_EDIT_THROTTLE_MS;
  const now = Date.now();
  const state = musicEditState.get(key) || { lastAt: 0, timer: null, pending: null };

  const run = async editPayload => {
    state.lastAt = Date.now();
    state.pending = null;
    try {
      if (typeof metricInc === "function") metricInc("api", "music.edit", 1);
      return await message.edit(editPayload);
    } catch (err) {
      if (err?.code !== 10008) console.warn("[MUSIC] Throttled edit failed:", redactRecoveryError(err));
      return null;
    }
  };

  if (now - state.lastAt >= throttleMs) {
    musicEditState.set(key, state);
    return run(payload);
  }

  state.pending = payload;
  if (!state.timer) {
    state.timer = setTimeout(async () => {
      state.timer = null;
      if (state.pending) await run(state.pending);
      if (!state.pending) musicEditState.delete(key);
    }, throttleMs - (now - state.lastAt));
    state.timer.unref?.();
  }
  musicEditState.set(key, state);
  return null;
}

function cacheMusicState(guildId, state) {
  if (!guildId || !globalThis.soezyCaches?.musicState) return;
  globalThis.soezyCaches.musicState.set(`music:${guildId}`, state, MUSIC_STATE_TTL_MS);
}

function cleanupMusicOptimization() {
  const now = Date.now();
  for (const [key, state] of musicEditState) {
    if (!state.timer && now - state.lastAt > MUSIC_STATE_TTL_MS) musicEditState.delete(key);
  }
}

if (!globalThis.__soezyMusicOptimizationCleanupInterval) {
  globalThis.__soezyMusicOptimizationCleanupInterval = setInterval(cleanupMusicOptimization, 60 * 1000);
  globalThis.__soezyMusicOptimizationCleanupInterval.unref?.();
}

Object.assign(globalThis, {
  throttledMusicEdit,
  cacheMusicState,
  cleanupMusicOptimization,
});


function getUserVoiceChannel(member) {
  return member?.voice?.channel || null;
}

function getBotVoiceChannel(guild) {
  return guild?.members?.me?.voice?.channel || null;
}

function isUserInVoice(member) {
  return !!getUserVoiceChannel(member);
}

function isBotInVoice(guild) {
  return !!getBotVoiceChannel(guild);
}

function isSameVoiceChannel(member, guild, queue = null) {
  const userVoiceId = member?.voice?.channelId || null;
  const botVoiceId = queue?.voiceChannelId || guild?.members?.me?.voice?.channelId || null;
  return !!userVoiceId && !!botVoiceId && userVoiceId === botVoiceId;
}

function validateMusicAccess({ member, guild, queue = null, command, mode = null } = {}) {
  const cmd = String(command || "").toLowerCase();
  const botConnected = !!(queue?.voiceChannelId || guild?.members?.me?.voice?.channelId);
  const userInVoice = isUserInVoice(member);
  const sameVoice = isSameVoiceChannel(member, guild, queue);

  const resolvedMode = mode || (() => {
    if (["play", "p", "py", "ps", "playnext", "pn", "join", "j"].includes(cmd)) return "play";
    if (["queue", "q", "np", "nowplaying"].includes(cmd)) return "queue";
    if (["skip", "s", "next", "stop", "pause", "resume", "unpause", "leave", "disconnect", "dc"].includes(cmd)) return "control";
    return "same-if-connected";
  })();

  if (resolvedMode === "play") {
    if (!userInVoice) return { ok: false, code: "USER_NOT_IN_VOICE", message: "Join a voice channel first." };
    if (botConnected && !sameVoice) return { ok: false, code: "DIFFERENT_VOICE", message: `The bot is already connected to <#${queue?.voiceChannelId || guild?.members?.me?.voice?.channelId}>.` };
    return { ok: true };
  }

  if (resolvedMode === "queue") {
    if (botConnected && !sameVoice) return { ok: false, code: "DIFFERENT_VOICE", message: `Join <#${queue?.voiceChannelId || guild?.members?.me?.voice?.channelId}> to use this music command.` };
    return { ok: true };
  }

  if (resolvedMode === "control") {
    if (!botConnected) return { ok: false, code: "BOT_NOT_IN_VOICE", message: "The bot is not connected to a voice channel." };
    if (!sameVoice) return { ok: false, code: "DIFFERENT_VOICE", message: `Join <#${queue?.voiceChannelId || guild?.members?.me?.voice?.channelId}> to control music.` };
    return { ok: true };
  }

  if (botConnected && !sameVoice) return { ok: false, code: "DIFFERENT_VOICE", message: `Join <#${queue?.voiceChannelId || guild?.members?.me?.voice?.channelId}> to use this music command.` };
  return { ok: true };
}

Object.assign(globalThis, {
  isUserInVoice,
  isBotInVoice,
  isSameVoiceChannel,
  validateMusicAccess,
});


class ReconnectManager {
  constructor() {
    this.locks = new Map();
    this.attempts = new Map();
    this.lastRun = new Map();
    this.timers = new Map();
    this.cooldowns = new Map();
  }

  canRun(key, minGapMs = 8_000) {
    const now = Date.now();
    const last = this.lastRun.get(key) || 0;
    if (now - last < minGapMs) return false;
    this.lastRun.set(key, now);
    return true;
  }

  delayFor(key) {
    const backoff = [1_000, 2_000, 5_000, 10_000, 20_000];
    const attempts = (this.attempts.get(key) || 0) + 1;
    this.attempts.set(key, attempts);
    return backoff[Math.min(attempts - 1, backoff.length - 1)];
  }

  attemptCount(key) {
    return this.attempts.get(key) || 0;
  }

  reset(key) {
    this.attempts.delete(key);
    this.cooldowns.delete(key);
    this.lastRun.delete(key);
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
  }

  async runExclusive(key, fn) {
    if (this.locks.has(key)) return this.locks.get(key);
    const job = Promise.resolve().then(fn).finally(() => this.locks.delete(key));
    this.locks.set(key, job);
    return job;
  }

  schedule(key, fn) {
    if (this.timers.has(key) || this.locks.has(key)) return 0;
    if (this.attemptCount(key) >= 5) {
      if (!this.cooldowns.has(key)) {
        this.cooldowns.set(key, Date.now() + 60_000);
        console.warn(`[NODE] Reconnect paused for 60s after 5 attempts key=${key}`);
      }
      if (Date.now() < this.cooldowns.get(key)) return 0;
      this.cooldowns.delete(key);
      this.attempts.delete(key);
    }
    const delay = this.delayFor(key);
    console.log(`[NODE] Attempting reconnect key=${key} in ${delay}ms`);
    const timer = setTimeout(() => {
      // reconnectNode owns the lock; acquiring it here would await itself.
      Promise.resolve().then(async () => {
        const result = await fn();
        if (result?.ok) this.reset(key);
        return result;
      }).catch(err => {
        console.error(`[RECOVERY] ${key} failed:`, redactRecoveryError(err));
      }).finally(() => {
        if (this.timers.get(key) === timer) this.timers.delete(key);
      });
    }, delay);
    this.timers.set(key, timer);
    timer.unref?.();
    return delay;
  }
}

const reconnectManager = globalThis.__soezyReconnectManager || new ReconnectManager();
globalThis.__soezyReconnectManager = reconnectManager;


function cloneTrack(track) {
  if (!track) return null;
  return {
    title: track.title,
    url: track.url,
    duration: track.duration,
    source: track.source,
    searchStr: track.searchStr,
    requestedBy: track.requestedBy,
    encoded: track.encoded,
    _llTrack: track._llTrack,
  };
}

function snapshotQueue(q) {
  return {
    destroyed: Boolean(q?.destroyed),
    current: cloneTrack(q?.current),
    tracks: Array.isArray(q?.tracks) ? q.tracks.map(cloneTrack).filter(Boolean) : [],
    history: Array.isArray(q?.history) ? q.history.map(cloneTrack).filter(Boolean).slice(0, 20) : [],
    loop: q?.loop || "off",
    volume: q?.volume || 80,
    filters: q?.filters || q?.player?.filters || {},
    autoplay: Boolean(q?.autoplay),
    sessionOwnerId: q?.sessionOwnerId || null,
    voiceChannelId: q?.voiceChannelId || null,
    textChannelId: q?.textChannel?.id || null,
    position: q?.player?.position || 0,
    paused: Boolean(q?.player?.paused),
  };
}

async function resolveChannels(client, guildId, snap) {
  const guild = client?.guilds?.cache?.get(guildId);
  if (!guild) return {};
  const voiceChannel = guild.channels.cache.get(snap.voiceChannelId);
  const textChannel = guild.channels.cache.get(snap.textChannelId);
  return { guild, voiceChannel, textChannel };
}

async function recoverPlayer(client, guildId, options = {}) {
  return reconnectManager.runExclusive(`player:${guildId}`, () => rebuildPlayer(client, guildId, options));
}

async function rebuildPlayer(client, guildId, options = {}) {
  const music = options.music || require("../commands/music/music");
  const existing = music.musicGetQueue?.(guildId);
  if (options.expectedQueue && existing !== options.expectedQueue) {
    return { guildId, recovered: false, reason: "queue changed" };
  }
  const shoukaku = music.getShoukaku?.();
  if (existing?.player?.node && !isNodeReady(existing.player.node) &&
      ![...(shoukaku?.nodes?.values?.() || [])].some(isNodeReady)) {
    return { guildId, recovered: false, reason: "waiting for audio server" };
  }
  const snap = options.snapshot || snapshotQueue(existing);
  if (snap.destroyed || existing?.destroyed) {
    return { guildId, recovered: false, reason: "queue was intentionally destroyed" };
  }
  if (!snap.voiceChannelId || (!snap.current && snap.tracks.length === 0)) {
    return { guildId, recovered: false, reason: "missing queue or voice channel" };
  }

  const { voiceChannel, textChannel } = await resolveChannels(client, guildId, snap);
  if (!voiceChannel || !textChannel) {
    await music.musicDestroyQueue?.(guildId, "recovery missing channels");
    return { guildId, recovered: false, reason: "voice/text channel unavailable" };
  }

  if (existing && (existing.destroyed || music.musicGetQueue?.(guildId) !== existing)) {
    return { guildId, recovered: false, reason: "queue changed during recovery" };
  }

  if (existing && !existing.destroyed) {
    try { music.saveQueue?.(guildId); } catch {}
    try { existing.player?.removeAllListeners?.(); } catch {}
  }

  try { await music.getShoukaku?.()?.leaveVoiceChannel?.(guildId); } catch {}
  if (existing && (existing.destroyed || music.musicGetQueue?.(guildId) !== existing)) {
    return { guildId, recovered: false, reason: "queue changed during recovery" };
  }
  music.musicQueues?.delete?.(guildId);
  let q;
  try {
    q = await music.musicJoinAndSetup(guildId, voiceChannel, textChannel);
  } catch (err) {
    if (existing && !existing.destroyed && !music.musicGetQueue?.(guildId)) {
      existing.nodeDisconnected = true;
      music.musicQueues?.set?.(guildId, existing);
    }
    throw err;
  }
  q.loop = snap.loop;
  q.volume = snap.volume;
  q.filters = snap.filters || {};
  q.autoplay = snap.autoplay;
  q.sessionOwnerId = snap.sessionOwnerId;
  q.history = snap.history || [];
  q.recoveredAt = Date.now();
  q.recoveryPosition = snap.position || 0;
  q.recoveryPaused = snap.paused;
  q.tracks.push(...[snap.current, ...snap.tracks].filter(Boolean));
  try { await q.player?.setGlobalVolume?.(q.volume); } catch {}
  try { if (Object.keys(q.filters || {}).length) await q.player?.setFilters?.(q.filters); } catch {}

  await music.musicPlayNext(guildId);
  nodeHealth.markPlayer(guildId, { stale: false, connected: true, recoveredAt: Date.now() });
  console.log(`[PLAYER] Player recovered guild=${guildId}`);
  console.log(`[QUEUE] Queue restored guild=${guildId} tracks=${q.tracks.length + (q.current ? 1 : 0)}`);
  return { guildId, recovered: true, tracks: q.tracks.length + (q.current ? 1 : 0), node: q.player?.node?.name || null };
}

async function recoverAllPlayers(client, options = {}) {
  const music = options.music || require("../commands/music/music");
  const results = [];
  // Recovery replaces map entries; iterating the live map would revisit them.
  for (const [guildId, q] of [...(music.musicQueues || new Map())]) {
    if (options.nodeName && q?.player?.node?.name !== options.nodeName) continue;
    const health = nodeHealth.inspectPlayer(guildId, q);
    if (options.onlyBroken && (!isNodeReady(q?.player?.node) || (health.connected && !health.stale))) continue;
    results.push(await recoverPlayer(client, guildId, { ...options, music, expectedQueue: q, snapshot: snapshotQueue(q) }).catch(err => ({
      guildId,
      recovered: false,
      reason: redactRecoveryError(err),
    })));
  }
  return results;
}


const playerRecovery = { snapshotQueue, recoverPlayer, recoverAllPlayers };

const OWNER_COMMANDS = Object.freeze([
  "node",
  "reconnectnode", "reconnectnodeall", "reconnectallnodes", "switchnode", "fixplayer", "fixplayers",
  "recovermusic", "recoverqueue", "rejoinvc", "forcereconnect", "clearghostplayers",
  "nodecleanup", "playerdebug", "nodestatus", "musicdiagnostics",
]);

function getMusic() {
  return require("../commands/music/music");
}

function isOwner(userId, client) {
  const config = client?._config || globalThis.config || {};
  const configuredOwners = [
    config.ownerId,
    config.ownerID,
    ...(Array.isArray(config.ownerIds) ? config.ownerIds : []),
    ...(Array.isArray(config.owners) ? config.owners : []),
  ].filter(Boolean).map(String);
  return Boolean(
    globalThis.soezyOwnerManager?.isBotOwner?.(userId) ||
    configuredOwners.includes(String(userId || ""))
  );
}

async function mapWithConcurrency(items, limit, mapper) {
  const source = Array.from(items || []);
  const results = new Array(source.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), source.length || 1) }, async () => {
    while (cursor < source.length) {
      const index = cursor++;
      results[index] = await mapper(source[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function getRuntimeShoukaku(client, music = getMusic()) {
  return music.getShoukaku?.() || client?._shoukaku || globalThis.__soezyShoukaku || null;
}

function getConfiguredNodeEntries(client, music = getMusic()) {
  const configured = [
    ...(Array.isArray(client?._config?.lavalinkNodes) ? client._config.lavalinkNodes : []),
    ...(Array.isArray(globalThis.config?.lavalinkNodes) ? globalThis.config.lavalinkNodes : []),
    ...(Array.isArray(music.DEFAULT_LAVALINK_NODES) ? music.DEFAULT_LAVALINK_NODES : []),
  ];
  const byName = new Map();
  for (const node of configured) {
    if (node?.name && !byName.has(node.name)) byName.set(node.name, node);
  }
  return byName;
}

function getConfiguredNode(configuredNodes, nodeName) {
  if (!configuredNodes || !nodeName) return null;
  return configuredNodes.get(nodeName) ||
    [...configuredNodes.entries()].find(([name]) => String(name).toLowerCase() === String(nodeName).toLowerCase())?.[1] ||
    null;
}

function ensureShoukaku(client, music = getMusic()) {
  let shoukaku = getRuntimeShoukaku(client, music);
  if (shoukaku) return shoukaku;
  try {
    shoukaku = music.initShoukaku?.(client) || getRuntimeShoukaku(client, music);
  } catch (error) {
    console.error("[NODE] Shoukaku initialization failed:", redactRecoveryError(error));
    return null;
  }
  return shoukaku;
}

function formatLines(lines) {
  return lines.filter(Boolean).slice(0, 30).join("\n") || "No changes were required.";
}

function buildContainer(title, lines, color = getThemeColor(null)) {
  return new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`### ${title}`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(formatLines(lines)));
}

function payload(title, lines, ephemeral = false) {
  return {
    components: [buildContainer(title, lines)],
    flags: MessageFlags.IsComponentsV2 | (ephemeral ? 64 : 0),
  };
}

function resolveOption(ctx, name, index = 0) {
  if (ctx.interaction) {
    return ctx.interaction.options?.getString?.(name) || ctx.interaction.options?.getInteger?.(name) || null;
  }
  return ctx.args?.[index] || null;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function nodeStateText(node) {
  const states = ["connecting", "connected", "disconnecting", "disconnected"];
  if (!node) return "missing";
  if (typeof node.state === "number") return states[node.state] || `state:${node.state}`;
  return node.connected ? "connected" : (node.state || "unknown");
}

function isNodeReady(node) {
  if (!node) return false;

  const state = node.state;
  const stateText = String(nodeStateText(node)).toLowerCase();
  return node.connected === true || state === 1 || stateText === "connected" || stateText === "ready";
}

function resolveNode(shoukaku, nodeName = null) {
  const nodes = shoukaku?.nodes;
  if (!nodes) return { name: null, node: null };
  if (nodeName && nodeName !== "all") {
    const entries = typeof nodes.entries === "function" ? [...nodes.entries()] : Object.entries(nodes);
    const exact = nodes.get?.(nodeName) || nodes[nodeName] || null;
    if (exact) return { name: nodeName, node: exact };
    const matched = entries.find(([name]) => String(name).toLowerCase() === String(nodeName).toLowerCase());
    return { name: matched?.[0] || nodeName, node: matched?.[1] || null };
  }
  const entries = typeof nodes.entries === "function" ? [...nodes.entries()] : Object.entries(nodes);
  const preferred = entries.find(([, node]) => !isNodeReady(node)) || entries[0] || [];
  return { name: preferred[0] || null, node: preferred[1] || null };
}

async function waitForNodeReady(shoukaku, nodeName, timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const node = resolveNode(shoukaku, nodeName).node;
    if (isNodeReady(node)) return node;
    await wait(250);
  }
  return resolveNode(shoukaku, nodeName).node;
}

function persistPlayerSnapshot(client, guildId, snapshot) {
  const db = client?._db || globalThis.db;
  if (!db || !guildId || !snapshot) return;
  if (!db.guilds) db.guilds = {};
  if (!db.guilds[guildId]) db.guilds[guildId] = {};
  db.guilds[guildId].playerData = {
    queue: snapshot.tracks || [],
    currentTrack: snapshot.current || null,
    position: snapshot.position || 0,
    loop: snapshot.loop || "off",
    volume: snapshot.volume || 80,
    filters: snapshot.filters || {},
    autoplay: !!snapshot.autoplay,
    voiceChannelId: snapshot.voiceChannelId || null,
    textChannelId: snapshot.textChannelId || null,
    savedAt: Date.now(),
  };
  if (!db.musicQueueStates) db.musicQueueStates = {};
  db.musicQueueStates[guildId] = { ...snapshot, savedAt: Date.now() };
  try { if (typeof saveDB === "function") saveDB(); } catch {}
}

async function reply(ctx, title, lines) {
  const data = payload(title, lines, Boolean(ctx.interaction));
  if (ctx.interaction) {
    if (ctx.interaction.deferred || ctx.interaction.replied) return ctx.interaction.editReply(data);
    return ctx.interaction.reply(data);
  }
  return ctx.msg.reply(data);
}

async function reconnectNode(client, nodeName, options = {}) {
  const music = getMusic();
  const shoukaku = ensureShoukaku(client, music);
  if (!shoukaku) return { ok: false, lines: ["`Lavalink` could not be initialized. Check the node configuration and startup logs."] };
  const resolved = resolveNode(shoukaku, nodeName);
  const node = resolved.node;
  nodeName = resolved.name;
  const configuredNodes = getConfiguredNodeEntries(client, music);
  if (!node) {
    const configNode = getConfiguredNode(configuredNodes, nodeName);
    if (!configNode || !shoukaku.addNode) return { ok: false, lines: [`Node \`${nodeName || "unknown"}\` was not found.`] };
    return reconnectManager.runExclusive(`node:${nodeName}`, async () => {
      nodeHealth.recordReconnectAttempt(nodeName);
      nodeHealth.markNode(nodeName, { status: "reconnecting" });
      try {
        shoukaku.addNode(configNode);
        const readyNode = await waitForNodeReady(shoukaku, nodeName);
        if (!isNodeReady(readyNode)) throw new Error(`Node did not become ready (state: ${nodeStateText(readyNode)})`);
        nodeHealth.markNode(nodeName, { status: "ready", lastFailure: null });
        return { ok: true, lines: [`Node \`${nodeName}\` was registered and connected.`, "Affected players: `0`"] };
      } catch (err) {
        const message = redactRecoveryError(err);
        nodeHealth.markNode(nodeName, { status: "error", lastError: message, lastFailure: Date.now(), failures: 1 });
        return { ok: false, lines: [`Node \`${nodeName}\` reconnect failed: \`${message}\``] };
      }
    });
  }

  return reconnectManager.runExclusive(`node:${nodeName}`, async () => {
    if (options.automatic && (isNodeReady(node) || node.state === 0 || node.state === 2)) {
      return { ok: true, lines: ["Node is already connected or reconnecting."] };
    }
    nodeHealth.recordReconnectAttempt(nodeName);
    console.warn(`[NODE] Attempting reconnect node=${nodeName}`);
    const affected = options.automatic ? [] : [...(music.musicQueues || new Map()).entries()]
      .filter(([, q]) => !q?.destroyed && q?.player?.node?.name === nodeName)
      .map(([guildId, q]) => {
        const snapshot = playerRecovery.snapshotQueue(q);
        persistPlayerSnapshot(client, guildId, snapshot);
        return { guildId, snapshot };
      });

    nodeHealth.markNode(nodeName, { status: "reconnecting" });
    try {
      if (!options.automatic) {
        node.disconnect?.(1000, "Soezy node reconnect");
        await wait(300);
      }
      if (typeof node.connect === "function") {
        await Promise.resolve(node.connect());
      } else if (shoukaku.removeNode && shoukaku.addNode) {
        const configNode = getConfiguredNode(configuredNodes, nodeName);
        try { shoukaku.removeNode(nodeName); } catch {}
        shoukaku.addNode(configNode || node.options || node);
      } else {
        try { node.ws?.close?.(1000, "Soezy node reconnect"); } catch {}
      }
      const readyNode = await waitForNodeReady(shoukaku, nodeName);
      if (!isNodeReady(readyNode)) {
        throw new Error(`Node did not become ready (state: ${nodeStateText(readyNode)})`);
      }
    } catch (err) {
      const message = redactRecoveryError(err);
      nodeHealth.markNode(nodeName, { status: "error", lastError: message, lastFailure: Date.now(), failures: 1 });
      console.error(`[NODE] Reconnect failed node=${nodeName}:`, message);
      return { ok: false, lines: [`Node \`${nodeName}\` reconnect failed: \`${message}\``] };
    }

    const recovered = options.automatic ? [] : await mapWithConcurrency(affected, 3, async item => {
      return playerRecovery.recoverPlayer(client, item.guildId, { music, snapshot: item.snapshot }).catch(err => ({
        guildId: item.guildId,
        recovered: false,
        reason: redactRecoveryError(err),
      }));
    });

    const liveNode = resolveNode(shoukaku, nodeName).node || node;
    nodeHealth.markNode(nodeName, { status: isNodeReady(liveNode) ? "ready" : nodeStateText(liveNode), lastFailure: null });
    console.log(`[NODE] Reconnected successfully node=${nodeName}`);
    return {
      ok: true,
      lines: [
        `Node \`${nodeName}\` reconnected.`,
        `Affected players: \`${affected.length}\``,
        `Recovered players: \`${recovered.filter(r => r.recovered).length}/${recovered.length}\``,
        options.reason ? `Reason: \`${options.reason}\`` : null,
      ],
    };
  });
}

async function reconnectAllNodes(client) {
  const music = getMusic();
  const shoukaku = ensureShoukaku(client, music);
  const configuredNodes = getConfiguredNodeEntries(client, music);
  const liveEntries = shoukaku?.nodes
    ? (typeof shoukaku.nodes.entries === "function" ? [...shoukaku.nodes.entries()] : Object.entries(shoukaku.nodes))
    : [];
  const names = [...new Set([
    ...configuredNodes.keys(),
    ...liveEntries.map(([name]) => name).filter(Boolean),
    ...nodeHealth.nodeEntries().map(([name]) => name).filter(Boolean),
  ])];
  if (!names.length) return { ok: false, lines: ["No Lavalink nodes are registered."] };
  const results = await mapWithConcurrency(names, 2, name => reconnectNode(client, name, { reason: "all nodes" }));
  return {
    ok: true,
    lines: [
      `Reconnect requested for \`${names.length}\` node(s).`,
      ...results.flatMap((r, i) => `${names[i]}: ${r.ok ? "queued" : "failed"}`),
    ],
  };
}

async function switchNode(client, guildId) {
  const music = getMusic();
  const q = music.musicGetQueue?.(guildId);
  if (!q) return { ok: false, lines: [`No active player for guild \`${guildId}\`.`] };
  const currentNode = q.player?.node?.name || null;
  const best = nodeHealth.getHealthiestNode(currentNode);
  const result = await playerRecovery.recoverPlayer(client, guildId, { music });
  return {
    ok: result.recovered,
    lines: [
      `Guild \`${guildId}\` moved away from \`${currentNode || "unknown"}\`.`,
      best ? `Target preference: \`${best.name}\`` : "Used Shoukaku ideal-node selection.",
      `Queue preserved tracks: \`${result.tracks || 0}\``,
    ],
  };
}

async function recoverQueue(client, guildId) {
  const music = getMusic();
  const db = client._db || {};
  const saved = db.musicQueueStates?.[guildId];
  if (saved) {
    await music.restoreQueueStates?.(client, 0);
    return { ok: true, lines: [`Recovered persisted queue state for guild \`${guildId}\`.`] };
  }
  const q = music.musicGetQueue?.(guildId);
  if (!q) return { ok: false, lines: [`No saved or live queue found for guild \`${guildId}\`.`] };
  music.saveQueue?.(guildId);
  return { ok: true, lines: [`Rebuilt queue cache for guild \`${guildId}\`.`, `Live tracks: \`${(q.tracks?.length || 0) + (q.current ? 1 : 0)}\``] };
}

async function clearGhostPlayers(client) {
  const music = getMusic();
  let cleared = 0;
  for (const [guildId, q] of [...(music.musicQueues || new Map())]) {
    const guild = client.guilds.cache.get(guildId);
    const voice = guild?.channels?.cache?.get(q?.voiceChannelId);
    if (!guild || !voice || q.destroyed || (!q.current && (!q.tracks || q.tracks.length === 0))) {
      await music.musicDestroyQueue?.(guildId, "ghost cleanup");
      try { await music.getShoukaku?.()?.leaveVoiceChannel?.(guildId); } catch {}
      cleared++;
    }
  }
  return { ok: true, lines: [`Ghost cleanup completed.`, `Removed \`${cleared}\` invalid player/session(s).`] };
}

function scheduleNodeReconnect(client, nodeName, options = {}) {
  if (!nodeName) return 0;
  return reconnectManager.schedule(`node:${nodeName}`, () => {
    const shoukaku = getMusic().getShoukaku?.();
    if (isNodeReady(resolveNode(shoukaku, nodeName).node)) return { ok: true };
    return reconnectNode(client, nodeName, { automatic: true, reason: options.reason || "auto reconnect" });
  });
}

async function diagnostics(client) {
  const music = getMusic();
  const snap = await nodeHealth.scan("diagnostics");
  const fmtBytes = bytes => {
    const n = Number(bytes || 0);
    if (!n) return "n/a";
    if (n >= 1024 * 1024 * 1024) return `${Math.round(n / 1024 / 1024 / 1024)}GB`;
    return `${Math.round(n / 1024 / 1024)}MB`;
  };
  const fmtUptime = ms => {
    const n = Number(ms || 0);
    if (!n) return "n/a";
    const s = Math.floor(n / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m`;
  };
  const liveNodes = new Map(nodeHealth.nodeEntries());
  const nodeLines = snap.nodes.map(n => {
    const node = liveNodes.get(n.name);
    const stats = node?.stats || {};
    const mem = stats.memory ? `${fmtBytes(stats.memory.used)} / ${fmtBytes(stats.memory.reservable || stats.memory.allocated)}` : "n/a";
    const cpu = stats.cpu?.systemLoad != null ? `${Math.round(stats.cpu.systemLoad * 100)}%` : (n.load != null ? `${Math.round(n.load * 100)}%` : "n/a");
    const icon = ["ready", "connected"].includes(String(n.status).toLowerCase()) ? "🟢" : "🔴";
    return `${icon} **${n.name}**\nPing: \`${n.ping ?? "n/a"}ms\`\nPlayers: \`${n.activePlayers || stats.players || 0}\`\nCPU: \`${cpu}\`\nMemory: \`${mem}\`\nUptime: \`${fmtUptime(stats.uptime || n.uptime)}\``;
  });
  const playerLines = [...(music.musicQueues || new Map()).entries()].slice(0, 12).map(([guildId, q]) => {
    const mark = nodeHealth.inspectPlayer(guildId, q);
    return `\`${guildId}\` node=\`${q.player?.node?.name || "unknown"}\` stale=\`${mark.stale}\` queue=\`${(q.tracks?.length || 0) + (q.current ? 1 : 0)}\``;
  });
  return {
    ok: true,
    lines: [
      "**Lavalink Tools**",
      ...(nodeLines.length ? nodeLines : ["No nodes tracked yet."]),
      "",
      "**Player Recovery**",
      ...(playerLines.length ? playerLines : ["No active players."]),
    ],
  };
}

async function execute(command, ctx) {
  const client = ctx.client || ctx.msg?.client || ctx.interaction?.client;
  const userId = ctx.userId || ctx.msg?.author?.id || ctx.interaction?.user?.id;
  if (!isOwner(userId, client)) {
    if (ctx.isNoPrefix) return true;
    await reply(ctx, "Access Denied", ["Only bot owners can use music recovery tools."]);
    return true;
  }

  const key = `owner:${userId}:${command}`;
  if (!reconnectManager.canRun(key, 5_000)) {
    await reply(ctx, "Recovery Cooldown", ["This recovery command is cooling down for a few seconds."]);
    return true;
  }

  console.log(`[OWNER] Recovery command executed command=${command} user=${userId}`);
  let result;
  const guildId = resolveOption(ctx, "guild", 0) || ctx.guildId || ctx.msg?.guild?.id || ctx.interaction?.guildId;
  const nodeSubcommand = ctx.interaction?.options?.getSubcommand?.(false) || ctx.args?.[0]?.toLowerCase?.() || "status";
  const nodeTarget = ctx.interaction?.options?.getString?.("node") || ctx.args?.[1] || null;

  if (command === "node") {
    if (nodeSubcommand === "reconnect" || nodeSubcommand === "connect") {
      result = nodeTarget === "all" ? await reconnectAllNodes(client) : await reconnectNode(client, nodeTarget, { reason: "node command" });
    } else if (nodeSubcommand === "restart") {
      result = nodeTarget === "all" ? await reconnectAllNodes(client) : await reconnectNode(client, nodeTarget, { reason: "node restart" });
    } else if (nodeSubcommand === "switch") {
      result = await switchNode(client, nodeTarget || guildId);
    } else if (nodeSubcommand === "players" || nodeSubcommand === "status" || nodeSubcommand === "list") {
      result = await diagnostics(client);
    } else {
      result = { ok: true, lines: ["`node status`", "`node reconnect [node|all]`", "`node restart [node|all]`", "`node switch [guildId]`", "`node players`"] };
    }
  }
  else if (command === "reconnectnode") result = await reconnectNode(client, resolveOption(ctx, "node", 0), { reason: "owner command" });
  else if (command === "reconnectallnodes" || command === "reconnectnodeall" || command === "forcereconnect") result = await reconnectAllNodes(client);
  else if (command === "switchnode" || command === "rejoinvc") result = await switchNode(client, guildId);
  else if (command === "fixplayer") result = { lines: [(await playerRecovery.recoverPlayer(client, guildId, { music: getMusic() })).recovered ? `Player recovered for \`${guildId}\`.` : `Player recovery failed for \`${guildId}\`.`], ok: true };
  else if (command === "fixplayers") result = { ok: true, lines: (await playerRecovery.recoverAllPlayers(client, { music: getMusic(), onlyBroken: true })).map(r => `\`${r.guildId}\` recovered=\`${r.recovered}\` ${r.reason || ""}`) };
  else if (command === "recovermusic") {
    const cleaned = await clearGhostPlayers(client);
    const fixed = await playerRecovery.recoverAllPlayers(client, { music: getMusic(), onlyBroken: true });
    result = { ok: true, lines: [...cleaned.lines, `Recovered broken players: \`${fixed.filter(r => r.recovered).length}/${fixed.length}\``] };
  } else if (command === "recoverqueue") result = await recoverQueue(client, guildId);
  else if (command === "clearghostplayers" || command === "nodecleanup") result = await clearGhostPlayers(client);
  else if (command === "nodestatus" || command === "musicdiagnostics" || command === "playerdebug") result = await diagnostics(client);
  else result = { ok: false, lines: [`Unknown recovery command \`${command}\`.`] };

  console.log(`[RECOVERY] Music recovery executed command=${command} ok=${result.ok}`);
  await reply(ctx, result.ok ? "Music Recovery" : "Recovery Failed", result.lines);
  return true;
}

function installAutomaticRecovery(client, music) {
  nodeHealth.start(client, music);
  nodeHealth.bindShoukaku(music.getShoukaku?.());
  if (client.__soezyAutoMusicRecovery) return;
  client.__soezyAutoMusicRecovery = true;

  setInterval(() => {
    const scan = nodeHealth.snapshot();
    for (const node of scan.nodes) {
      const unhealthy = !["ready", "connected"].includes(String(node.status).toLowerCase());
      if (!unhealthy) continue;
      scheduleNodeReconnect(client, node.name, { reason: "auto health check" });
    }
    playerRecovery.recoverAllPlayers(client, { music, onlyBroken: true }).catch(err => {
      console.error("[RECOVERY] Automatic player recovery failed:", redactRecoveryError(err));
    });
  }, 45_000).unref?.();
}


const musicManagerApi = {
  destroyPlayerSafely,
  cleanupMusicCollectors,
  cleanupMusicRuntime,
  cleanupPlayerMessages,
  cleanupIdleTimers,
  cleanupRecoveryCache,
  clearQueueState,
  registerMusicCollector,
  throttledMusicEdit,
  cacheMusicState,
  cleanupMusicOptimization,
  isUserInVoice,
  isBotInVoice,
  isSameVoiceChannel,
  validateMusicAccess,
  reconnectManager,
  nodeHealth,
  snapshotQueue,
  recoverPlayer,
  recoverAllPlayers,
  OWNER_COMMANDS,
  execute,
  installAutomaticRecovery,
  reconnectNode,
  reconnectAllNodes,
  scheduleNodeReconnect,
  switchNode,
  recoverQueue,
  clearGhostPlayers,
  diagnostics,
  panelCollectors,
  destroyLocks,
};

Object.assign(globalThis, musicManagerApi, { soezyMusicManager: musicManagerApi, soezyMusicRecovery: musicManagerApi });
module.exports = musicManagerApi;
})();
