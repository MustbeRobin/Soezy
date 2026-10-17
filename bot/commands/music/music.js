// ══════════════════════════════════════════════════════════════════════════════
//  MUSIC SYSTEM  ·  Lavalink v4 + Shoukaku v4  ·  YouTube · Spotify · SoundCloud
//  Production-grade: concurrency locks, safe destroy, retry system, zero leaks.
//  Exports: { initShoukaku, handleMusicCommand, handleMusicInteraction,
//             handleVoiceStateUpdate, handleGuildDelete, musicQueues, musicDestroyQueue, musicGetQueue }
// ══════════════════════════════════════════════════════════════════════════════

"use strict";

const {
  ContainerBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  escapeMarkdown,
} = require("discord.js");
const { getThemeColor } = require("../../utils/theme");
const { roastStatusMessage } = require("../../utils/statusRoasts");
let sharp = null;
try {
  sharp = require("sharp");
} catch {
  sharp = null;
}
let getVoiceConnection = null;
try {
  ({ getVoiceConnection } = require("@discordjs/voice"));
} catch {
  getVoiceConnection = null;
}

const {
  destroyPlayerSafely,
  cleanupMusicCollectors,
  cleanupMusicRuntime,
  cleanupPlayerMessages,
  cleanupIdleTimers,
  cleanupRecoveryCache,
  clearQueueState,
} = require("../../utils/musicManager");
const { validateMusicAccess } = require("../../utils/musicManager");
const { safeReply, safeEdit, safeUpdate, safeFollowUp, safeDefer, safeDeferUpdate } = require("../../utils/interactionManager");
const { getLavalinkConfiguration, redactLavalinkError } = require("../../utils/lavalinkConfig");
const { getRedisLatency } = require("../../utils/redis");

let Shoukaku, ShoukakuConnectors;
try {
  const s              = require("shoukaku");
  Shoukaku             = s.Shoukaku;
  ShoukakuConnectors   = s.Connectors;
} catch {
  console.warn("[MUSIC] shoukaku not installed — run: npm install shoukaku");
}

// ── Config ────────────────────────────────────────────────────────────────────
const DEFAULT_LAVALINK_NODES = getLavalinkConfiguration().nodes;

// ── Module-level state ────────────────────────────────────────────────────────
let shoukaku              = null;
const musicQueues         = new Map(); // guildId → queue object
const pendingSearches     = new Map(); // guildId -> { tracks, msg, userId, voiceCh, textChannel }
const pendingLyrics       = new Map(); // guildId → { pages, page, displayTitle, hasLive, msgId }
const pendingPlaylistAdd  = new Map(); // `${guildId}_${userId}` → { track, plKeys[], expiresAt }
const voteskipSessions    = new Map(); // guildId → Set<userId>
const activeMusicInteractionLocks = new Map(); // `${guildId}:${userId}:${action}` -> expiresAt
const musicAutoLeaveTimers = globalThis.__soezyMusicAutoLeaveTimers || (globalThis.__soezyMusicAutoLeaveTimers = new Map());
let musicRecovery = null;

function getMusicRecovery() {
  if (!musicRecovery) {
    try { musicRecovery = require("../../utils/musicManager"); } catch { musicRecovery = null; }
  }
  return musicRecovery;
}

function getMusicPrefix(client, guildId) {
  // Music runs outside the legacy VM, so read the shared client database.
  const stored = String(client?._db?.prefixes?.[guildId] || "").trim();
  return stored || String(client?._config?.prefix || "!").trim() || "!";
}

function getGuildMusicSettings(guildId) {
  const rootDb = globalThis.db || globalThis.client?._db || {};
  if (!rootDb.guilds) rootDb.guilds = {};
  if (!rootDb.guilds[guildId]) rootDb.guilds[guildId] = {};
  if (!rootDb.guilds[guildId].music || typeof rootDb.guilds[guildId].music !== "object") rootDb.guilds[guildId].music = { enabled: true };
  const music = rootDb.guilds[guildId].music;
  if (music.twentyFourSeven === undefined) music.twentyFourSeven = false;
  if (!music.autoLeaveTimeoutMs) music.autoLeaveTimeoutMs = 180000;
  return music;
}

function isTwentyFourSevenEnabled(guildId) {
  return getGuildMusicSettings(guildId).twentyFourSeven === true;
}

function setTwentyFourSevenMode(guildId, enabled) {
  const music = getGuildMusicSettings(guildId);
  music.twentyFourSeven = enabled === true;
  if (typeof saveDB === "function") saveDB();
  return music.twentyFourSeven;
}

function clearMusicAutoLeaveTimer(guildId) {
  const timer = musicAutoLeaveTimers.get(guildId);
  if (timer) clearTimeout(timer);
  musicAutoLeaveTimers.delete(guildId);
}

function countHumanListeners(channel, botUserId = null) {
  if (!channel?.members) return 0;
  return channel.members.filter(member => {
    if (!member?.user || member.user.id === botUserId) return false;
    if (member.user.bot) return false;
    return true;
  }).size;
}

function getMusicVoiceChannel(guild, q = null) {
  const voiceId = q?.voiceChannelId || guild?.members?.me?.voice?.channelId || null;
  return voiceId ? guild?.channels?.cache?.get(voiceId) || null : null;
}

function scheduleMusicAutoLeave(guild, reason = "empty voice channel") {
  const guildId = guild?.id || guild;
  if (!guildId || isTwentyFourSevenEnabled(guildId)) {
    clearMusicAutoLeaveTimer(guildId);
    return false;
  }
  const q = musicGetQueue(guildId);
  const resolvedGuild = guild?.id ? guild : q?.textChannel?.guild || q?.textChannel?.client?.guilds?.cache?.get(guildId);
  const voiceChannel = getMusicVoiceChannel(resolvedGuild, q);
  const botId = resolvedGuild?.members?.me?.id || q?.textChannel?.client?.user?.id || null;
  if (!voiceChannel || countHumanListeners(voiceChannel, botId) > 0) {
    clearMusicAutoLeaveTimer(guildId);
    return false;
  }
  if (musicAutoLeaveTimers.has(guildId)) return true;
  const timeoutMs = Math.max(30000, Number(getGuildMusicSettings(guildId).autoLeaveTimeoutMs || 180000));
  const timer = setTimeout(async () => {
    musicAutoLeaveTimers.delete(guildId);
    if (isTwentyFourSevenEnabled(guildId)) return;
    const liveQ = musicGetQueue(guildId);
    const liveGuild = resolvedGuild || liveQ?.textChannel?.guild || liveQ?.textChannel?.client?.guilds?.cache?.get(guildId);
    const liveVoice = getMusicVoiceChannel(liveGuild, liveQ);
    const liveBotId = liveGuild?.members?.me?.id || liveQ?.textChannel?.client?.user?.id || null;
    if (liveVoice && countHumanListeners(liveVoice, liveBotId) > 0) return;
    await destroyMusicSession(liveGuild || guildId, `auto leave: ${reason}`).catch(err => console.error("[MUSIC] Auto leave failed:", err.message));
  }, timeoutMs);
  timer.unref?.();
  musicAutoLeaveTimers.set(guildId, timer);
  return true;
}

// ── Concurrency lock system ───────────────────────────────────────────────────
// Prevents musicPlayNext from running concurrently per guild (race condition fix).
const playLocks = new Map(); // guildId → Promise (current running lock)

/**
 * Executes fn() exclusively per guildId. If a lock is already held,
 * waits for it to finish before running. Prevents duplicate playback triggers.
 */
async function withPlayLock(guildId, fn) {
  const current = playLocks.get(guildId) ?? Promise.resolve();
  let release;
  const next = new Promise(res => { release = res; });
  const pending = current.then(() => next);
  playLocks.set(guildId, pending);
  try {
    await current;
    return await fn();
  } finally {
    release();
    // Clean up resolved lock chain so the Map doesn't grow indefinitely
    if (playLocks.get(guildId) === pending) playLocks.delete(guildId);
  }
}

// ── Emojis ────────────────────────────────────────────────────────────────────
const MUSIC_ARR        = "<a:BlackDot:1502262177808257125>";
const MUSIC_EMOJI_ICON = "<:smusic:1486304838978375730>";
const MUSIC_NOTE       = "<a:musiclistening:1487777319144656987>";
const MUSIC_QUEUED     = "<a:hello:1559656128017731607>";
const MUSIC_QUEUE      = "<:slisten:1487777225691365436>";
const MUSIC_QUEUE_END  = "<a:steddycry:1559656146472538112>";
const MUSIC_SEARCH     = "<a:thinking:1559656266261995620>";
const MUSIC_SKIP       = "<a:swish:1487769306816188487>";
const MUSIC_LOOP       = "<a:situps:1487777726051127446>";
const MUSIC_AUTO       = "<a:spaz:1487769511581974689>";
const MUSIC_PLAYLIST   = "<:playlist:1500792270889287772>";
const VC_EMOJI_YOUTUBE = "<a:youtube:1559133166088884294>";
const VC_EMOJI_SPOTIFY = "<a:spotify:1559133162377052300>";

// ── Status emojis ─────────────────────────────────────────────────────────────
const STATUS = {
  success: "<:ok:1500971034575241236>",
  error:   "<:no:1500970979273343027>",
  warning: "<:sad:1500964884190461976>",
  info:    "<a:heart:1500970723127328979>",
  loading: "<a:loading:1559133110472286298>",
  tick:    "<:tick:1559236522711187577>",
  cross:   "<:scross:1559257945030525110>",
  arrow:   "<a:BlackDot:1502262177808257125>",
};

// ── Spotify token ─────────────────────────────────────────────────────────────
const DEFAULT_GUILD_COLOR = getThemeColor(null);
// Fallback for legacy helper scopes; live command paths store the actual guild color on the queue.
const guildColor = DEFAULT_GUILD_COLOR;

function normalizeGuildColor(color) {
  const parsed = typeof color === "string" ? parseInt(color.replace(/^#/, ""), 16) : Number(color);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 0xFFFFFF ? parsed : DEFAULT_GUILD_COLOR;
}

function getGuildColor(client, guildId) {
  const db = client?._db || {};
  return normalizeGuildColor(
    db?.guilds?.[guildId]?.theme?.color ??
    db?.guildSettings?.[guildId]?.themeColor ??
    db?.guildSettings?.[guildId]?.color
  );
}

let _spotifyToken = null, _spotifyExpiry = 0;
async function getSpotifyToken(config) {
  if (_spotifyToken && Date.now() < _spotifyExpiry) return _spotifyToken;
  const { spotifyClientId: id, spotifyClientSecret: secret } = config;
  if (!id || !secret) return null;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64") },
    body:    "grant_type=client_credentials",
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.access_token) return null;
  _spotifyToken  = data.access_token;
  _spotifyExpiry = Date.now() + (data.expires_in - 30) * 1000;
  return _spotifyToken;
}

async function resolveSpotifyTrack(url, config) {
  const match = url.match(/spotify\.com\/track\/([A-Za-z0-9]+)/);
  if (!match) return null;
  const token = await getSpotifyToken(config);
  if (!token) return null;
  const res = await fetch(`https://api.spotify.com/v1/tracks/${match[1]}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!res?.ok) return null;
  const t = await res.json().catch(() => null);
  if (!t?.name) return null;
  const artists = t.artists?.map(a => a.name).join(", ") || "";
  return { title: `${artists} - ${t.name}`, artist: artists, searchStr: `${artists} ${t.name}`, duration: Math.floor((t.duration_ms || 0) / 1000), source: "spotify", url };
}

async function resolveSpotifyPlaylist(url, config) {
  const cleanUrl = url.split("?")[0];
  const match    = cleanUrl.match(/spotify\.com\/playlist\/([A-Za-z0-9]+)/);
  if (!match) return [];
  const token = await getSpotifyToken(config);
  if (!token) return [];
  const allItems = [];
  let nextUrl = `https://api.spotify.com/v1/playlists/${match[1]}/tracks?limit=100&fields=next,items(track(name,duration_ms,artists,external_urls,type,is_local))`;
  while (nextUrl && allItems.length < 500) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    if (!res?.ok) break;
    const data = await res.json().catch(() => null);
    if (!data) break;
    allItems.push(...(data.items || []));
    nextUrl = data.next || null;
  }
  return allItems.map(item => {
    const t = item?.track;
    if (!t || t.type === "episode" || item.is_local || !t.name) return null;
    const artists = t.artists?.map(a => a.name).join(", ") || "";
    return { title: `${artists} - ${t.name}`.trim().replace(/^\s*-\s*/, ""), artist: artists, searchStr: `${artists} ${t.name}`, duration: Math.floor((t.duration_ms || 0) / 1000), source: "spotify", url: t.external_urls?.spotify || url };
  }).filter(Boolean);
}

async function resolveSpotifyAlbum(url, config) {
  const match = url.match(/spotify\.com\/album\/([A-Za-z0-9]+)/);
  if (!match) return [];
  const token = await getSpotifyToken(config);
  if (!token) return [];
  const res = await fetch(`https://api.spotify.com/v1/albums/${match[1]}/tracks?limit=50`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!res?.ok) return [];
  const data = await res.json().catch(() => null);
  return (data?.items || []).map(t => {
    if (!t) return null;
    const artists = t.artists?.map(a => a.name).join(", ") || "";
    return { title: `${artists} - ${t.name}`, artist: artists, searchStr: `${artists} ${t.name}`, duration: Math.floor((t.duration_ms || 0) / 1000), source: "spotify", url: t.external_urls?.spotify || url };
  }).filter(Boolean);
}

async function searchSpotifyTrack(query, config) {
  const token = await getSpotifyToken(config);
  if (!token) return null;
  const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json().catch(() => null);
  const t = data?.tracks?.items?.[0];
  if (!t) return null;
  const artists = t.artists?.map(a => a.name).join(", ") || "";
  return { title: `${artists} - ${t.name}`, artist: artists, searchStr: `${artists} ${t.name}`, duration: Math.floor((t.duration_ms || 0) / 1000), source: "spotify", url: t.external_urls?.spotify || "" };
}

// ── Lavalink helpers ──────────────────────────────────────────────────────────
function getBestNode() {
  if (!shoukaku) throw new Error("Lavalink is unavailable. Ask an administrator to check the local audio server.");
  const node = shoukaku.getIdealNode?.();
  if (!node) throw new Error("No Lavalink nodes are available right now.");
  return node;
}

function normaliseLLResult(result) {
  if (!result) return null;
  const lt = result.loadType;
  if (!lt || lt === "error" || lt === "NO_MATCHES" || lt === "empty") return null;
  if (result.data !== undefined) {
    const tracks = Array.isArray(result.data)
      ? result.data
      : result.data?.tracks ?? (result.data?.encoded ? [result.data] : []);
    return { loadType: lt, tracks: tracks.filter(track => !musicIsPreviewTrack(track)),
      previewCount: tracks.filter(musicIsPreviewTrack).length };
  }
  const tracks = result.tracks || [];
  return { loadType: lt, tracks: tracks.filter(track => !musicIsPreviewTrack(track)),
    previewCount: tracks.filter(musicIsPreviewTrack).length };
}

async function lavalinkResolve(identifier) {
  const node = getBestNode();
  const raw  = await node.rest.resolve(identifier);
  const result = normaliseLLResult(raw);
  if (result?.previewCount && !result.tracks.length && !/^(?:ytm?search|scsearch(?:\[\d+,\d+\])?):/i.test(identifier)) {
    throw new Error("Only a short preview is available for this track. Provide a full-length playable link.");
  }
  return result;
}

async function lavalinkSearchOne(query, source = "scsearch") {
  // Similar metadata on another service does not establish recording identity.
  const result = await lavalinkResolve(`${source}:${query}`);
  const track = result?.tracks?.[0];
  if (!track) return null;
  return {
    title:    track.info.title || query,
    artist:   track.info.author || track.info.artist || "",
    url:      track.info.uri,
    duration: Math.floor((track.info.length || 0) / 1000),
    source:   source === "scsearch" ? "soundcloud" : "youtube",
    encoded:  track.encoded,
    _llTrack: track,
  };
}

// ── Queue helpers ─────────────────────────────────────────────────────────────
function musicGetQueue(guildId) {
  return musicQueues.get(guildId) || null;
}

async function setVcStatus(q, status) {
  try {
    const client = q?.textChannel?.client;
    if (!client || !q.voiceChannelId) return;
    await client.rest.put(`/channels/${q.voiceChannelId}/voice-status`, { body: { status } });
  } catch { /* best-effort */ }
}

// ── SAFE DESTROY ──────────────────────────────────────────────────────────────
// Sets q.destroyed = true FIRST so any in-flight event handlers see it
// immediately, then removes all player listeners before tearing down state.
async function musicDestroyQueue(guildId, reason = "manual destroy") {
  clearMusicAutoLeaveTimer(guildId);
  const q = musicQueues.get(guildId);
  if (!q) {
    await destroyPlayerSafely({ guildId, shoukaku, reason });
    cleanupRecoveryCache(guildId);
    try {
      const db = globalThis.client?._db || globalThis.db;
      if (db?.musicQueueStates?.[guildId]) {
        delete db.musicQueueStates[guildId];
        if (typeof saveDB === "function") saveDB();
      }
    } catch { /* silent */ }
    return false;
  }
  if (q.__destroyCleanupDone) {
    await destroyPlayerSafely({ guildId, queue: q, shoukaku, reason });
    cleanupRecoveryCache(guildId, q.textChannel?.client);
    musicQueues.delete(guildId);
    return true;
  }
  q.__destroyCleanupDone = true;

  // ── 1. Mark destroyed immediately — event handlers check this flag first ──
  q.destroyed = true;
  clearQueueState(q);

  // ── 2. Remove ALL player listeners so no ghost events fire after destroy ──
  try { q.player?.removeAllListeners(); } catch { /* ignore */ }

  // ── 3. Clear timers ───────────────────────────────────────────────────────
  cleanupIdleTimers(q);
  cleanupMusicCollectors(guildId, reason);

  // ── 4. Clean up messages ──────────────────────────────────────────────────
  await cleanupPlayerMessages(q, { disableOnly: false });

  // ── 5. Persist session play-counts ────────────────────────────────────────
  try {
    const client = q.textChannel?.client;
    const db     = client?._db;
    if (db && Object.keys(q.mostPlayed || {}).length) {
      if (!db.mostPlayed) db.mostPlayed = {};
      if (!db.mostPlayed[guildId]) db.mostPlayed[guildId] = {};
      for (const [title, count] of Object.entries(q.mostPlayed)) {
        db.mostPlayed[guildId][title] = (db.mostPlayed[guildId][title] || 0) + count;
      }
      if (typeof saveDB === "function") saveDB();
    }
  } catch { /* silent */ }

  // Remove any persisted restart state immediately. A leave/disconnect command
  // should not resurrect the same queue after a process restart.
  try {
    const db = q.textChannel?.client?._db;
    if (db?.musicQueueStates?.[guildId]) delete db.musicQueueStates[guildId];
    cleanupRecoveryCache(guildId, q.textChannel?.client);
  } catch { /* silent */ }

  // ── 6. Clean up session maps ──────────────────────────────────────────────
  cleanupMusicRuntime(guildId, { voteskipSessions, pendingSearches, pendingLyrics, playLocks, pendingPlaylistAdd, activeMusicInteractionLocks });

  // ── 7. Stop player and leave VC ──────────────────────────────────────────
  await setVcStatus(q, "").catch(() => {});
  await destroyPlayerSafely({ guildId, queue: q, shoukaku, reason });

  // ── 8. Remove from map ────────────────────────────────────────────────────
  musicQueues.delete(guildId);
  console.log(`[MUSIC] Queue destroyed for guild ${guildId} (${reason})`);
  return true;
}

async function destroyMusicSession(guild, reason = "manual destroy") {
  const guildId = typeof guild === "string" ? guild : guild?.id || guild?.guildId || null;
  if (!guildId) return false;
  clearMusicAutoLeaveTimer(guildId);
  try {
    const q = musicQueues.get(guildId);
    if (q) {
      if (Array.isArray(q.tracks)) q.tracks.length = 0;
      if (typeof q.destroy === "function") await q.destroy();
    }

    await musicDestroyQueue(guildId, reason);

    const connection = typeof getVoiceConnection === "function" ? getVoiceConnection(guildId) : null;
    if (connection) connection.destroy();

    musicQueues.delete(guildId);
    cleanupMusicRuntime(guildId, {
      voteskipSessions,
      pendingSearches,
      pendingLyrics,
      playLocks,
      pendingPlaylistAdd,
      activeMusicInteractionLocks,
    });
    getMusicRecovery()?.reconnectManager?.reset?.(`guild:${guildId}`);
    return true;
  } catch (err) {
    console.error("Music destroy failed:", err);
    return false;
  }
}
globalThis.destroyMusicSession = destroyMusicSession;

// ── LRC / lyrics helpers ──────────────────────────────────────────────────────
function parseLRC(lrcText) {
  if (!lrcText) return [];
  const lines = [];
  for (const raw of lrcText.split("\n")) {
    const m = raw.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/);
    if (!m || !m[4].trim()) continue;
    const ms = (parseInt(m[1]) * 60 + parseInt(m[2])) * 1000 + parseInt(m[3].padEnd(3, "0").slice(0, 3));
    lines.push({ time: ms, text: m[4].trim() });
  }
  return lines.sort((a, b) => a.time - b.time);
}

function normalizeLyricsQuery(query = "") {
  return String(query || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bmaahi\b/g, "mahi")
    .replace(/\b(official|video|audio|lyric|lyrics|song|full|hd|4k|visualizer|remix|slowed|reverb|sped up|lofi|status|whatsapp|trending)\b/g, " ")
    .replace(/\b(from|movie|film|album|feat|ft|featuring|prod|by)\b.*$/g, " ")
    .replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, " ")
    .replace(/[^a-z0-9\u0900-\u097f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lyricsQueryVariants(query = "") {
  const normalized = normalizeLyricsQuery(query);
  const dash = String(query || "").split(/\s+-\s+|\s+by\s+/i).map(part => normalizeLyricsQuery(part)).filter(Boolean);
  const cleanNoArtist = normalized.replace(/\b(official|audio|video|lyrics?)\b/g, " ").replace(/\s+/g, " ").trim();
  const known = {
    kesariya: ["kesariya brahmastra", "kesariya arijit singh"],
    heeriye: ["heeriye jasleen royal arijit singh"],
    sahiba: ["sahiba jasleen royal", "sahiba aditya rikhari"],
    husn: ["husn anuv jain"],
    "o mahi": ["o maahi arijit singh dunki", "o mahi arijit singh"],
    "apna bana le": ["apna bana le arijit singh bhediya"],
    "excuses": ["excuses ap dhillon gurinder gill"],
    "brown munde": ["brown munde ap dhillon gurinder gill shinda kahlon"],
    "with you": ["with you ap dhillon"],
    "295": ["295 sidhu moose wala"],
    "pasoori": ["pasoori ali sethi shae gill"],
    "raataan lambiyan": ["raataan lambiyan jubin nautiyal asees kaur"],
  };
  const knownVariants = known[normalized] || [];
  return [...new Set([
    ...knownVariants,
    normalized,
    cleanNoArtist,
    ...dash,
    dash.length >= 2 ? `${dash[1]} ${dash[0]}` : "",
    dash.length >= 2 ? `${dash[0]} ${dash[1]}` : "",
    normalized.replace(/\bo mahi\b/g, "o maahi"),
    normalized.replace(/\bmahi\b/g, "maahi"),
    normalized.replace(/\btera\b/g, "teri"),
    normalized.replace(/\btere\b/g, "teri"),
  ].filter(Boolean))];
}

function stringSimilarity(a = "", b = "") {
  a = normalizeLyricsQuery(a);
  b = normalizeLyricsQuery(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const aWords = new Set(a.split(" "));
  const bWords = new Set(b.split(" "));
  const overlap = [...aWords].filter(w => bWords.has(w)).length;
  const tokenScore = overlap / Math.max(aWords.size, bWords.size, 1);
  const maxLen = Math.max(a.length, b.length);
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  const editScore = 1 - (dp[a.length][b.length] / Math.max(maxLen, 1));
  return Math.max(tokenScore, editScore);
}

function getLyricsConfigValue(...keys) {
  const cfg = globalThis.config || globalThis.__soezyConfig || globalThis.client?._config || {};
  for (const key of keys) {
    if (cfg?.[key]) return cfg[key];
  }
  return null;
}

async function fetchJsonSafe(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "SoezyBot/1.0", ...(options.headers || {}) },
      signal: AbortSignal.timeout(options.timeoutMs || 5000),
    });
    if (!res?.ok) return null;
    const type = res.headers?.get?.("content-type") || "";
    if (type && !/json|javascript|text\/plain/i.test(type)) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

function pickBestLyricsHit(query, hits = []) {
  const normalized = normalizeLyricsQuery(query);
  let best = null;
  let bestScore = 0;
  for (const hit of hits.filter(Boolean)) {
    const title = [hit.trackName, hit.name, hit.title, hit.artistName, hit.artist_name, hit.artist_names].filter(Boolean).join(" ");
    const score = stringSimilarity(normalized, title);
    if (score > bestScore) {
      best = hit;
      bestScore = score;
    }
  }
  return bestScore >= 0.34 ? best : hits[0] || null;
}

async function searchGenius(query) {
  const token = process.env.GENIUS_ACCESS_TOKEN || process.env.GENIUS_TOKEN || getLyricsConfigValue("geniusToken", "geniusAccessToken");
  if (token) {
    const data = await fetchJsonSafe(`https://api.genius.com/search?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: 2500,
    });
    return (data?.response?.hits || []).map(h => h.result).filter(Boolean);
  }
  const web = await fetchJsonSafe(`https://genius.com/api/search/song?q=${encodeURIComponent(query)}`, { timeoutMs: 2500 });
  return (web?.response?.sections || [])
    .flatMap(s => s.hits || [])
    .map(h => h.result)
    .filter(Boolean);
}

async function fetchLyricsFromLrclib(query) {
  const variants = lyricsQueryVariants(query);
  for (const variant of variants) {
    const data = await fetchJsonSafe(`https://lrclib.net/api/search?q=${encodeURIComponent(variant)}`, {
      headers: { "Lrclib-Client": "SoezyBot/1.0" },
      timeoutMs: 2500,
    });
    const hits = Array.isArray(data) ? data : [];
    const hit = pickBestLyricsHit(variant, hits);
    const lyrics = hit?.plainLyrics || hit?.syncedLyrics;
    if (lyrics) {
      return {
        lyrics,
        title: hit.trackName || variant,
        artist: hit.artistName || "",
        source: "lrclib",
      };
    }
  }
  return null;
}

async function fetchLyricsFromLyricsOvh(query, hints = []) {
  const candidates = [];
  for (const hint of hints) {
    const artist = hint.artist_names || hint.artistName || hint.artist_name || hint.primary_artist?.name || "";
    const title = hint.title || hint.name || hint.full_title || "";
    if (artist && title) candidates.push({ artist, title });
  }
  const raw = normalizeLyricsQuery(query);
  const dash = String(query).split(/\s+-\s+|\s+by\s+/i);
  if (dash.length >= 2) {
    const first = dash[0].trim();
    const second = dash.slice(1).join(" ").trim();
    candidates.push({ artist: first, title: second }, { artist: second, title: first });
  }
  if (raw) candidates.push({ artist: raw, title: raw });

  for (const item of candidates) {
    const data = await fetchJsonSafe(`https://api.lyrics.ovh/v1/${encodeURIComponent(item.artist)}/${encodeURIComponent(item.title)}`, { timeoutMs: 2500 });
    if (data?.lyrics) {
      return { lyrics: data.lyrics, title: item.title, artist: item.artist, source: "lyrics.ovh" };
    }
  }
  return null;
}

async function fetchLyricsFromMusixmatch(query) {
  const key = process.env.MUSIXMATCH_API_KEY || getLyricsConfigValue("musixmatchKey", "musixmatchApiKey");
  if (!key) return null;
  for (const variant of lyricsQueryVariants(query)) {
    const data = await fetchJsonSafe(`https://api.musixmatch.com/ws/1.1/matcher.lyrics.get?q_track=${encodeURIComponent(variant)}&apikey=${encodeURIComponent(key)}`, { timeoutMs: 2500 });
    const body = data?.message?.body;
    const lyrics = body?.lyrics?.lyrics_body;
    if (lyrics) return { lyrics: lyrics.replace(/\*{7}.*$/s, "").trim(), title: variant, artist: "", source: "musixmatch" };
  }
  return null;
}

async function fetchLyricsMultiSource(query) {
  const variants = lyricsQueryVariants(query);
  const geniusHints = [];

  const musixmatch = await fetchLyricsFromMusixmatch(query);
  if (musixmatch?.lyrics) return musixmatch;

  const geniusResults = await Promise.all(variants.map(async variant => ({
    variant,
    hits: await searchGenius(variant),
  })));

  for (const { variant, hits } of geniusResults) {
    geniusHints.push(...hits);
    const best = pickBestLyricsHit(variant, hits);
    if (best?.primary_artist?.name && best?.title) {
      const ovh = await fetchLyricsFromLyricsOvh(`${best.primary_artist.name} - ${best.title}`, [best]);
      if (ovh?.lyrics) return { ...ovh, source: "genius+lyrics.ovh" };
    }
  }

  const lrclib = await fetchLyricsFromLrclib(query);
  if (lrclib?.lyrics) return lrclib;

  const ovh = await fetchLyricsFromLyricsOvh(query, geniusHints);
  if (ovh?.lyrics) return ovh;

  return null;
}

const LYRIC_LANGUAGE_ALIASES = new Map([
  ["english", "english"],
  ["eng", "english"],
  ["en", "english"],
  ["hinglish", "hinglish"],
  ["hindi-english", "hinglish"],
  ["hin", "hinglish"],
  ["hi", "hinglish"],
  ["hindi", "hinglish"],
  ["punjabi", "original"],
  ["panjabi", "original"],
  ["pa", "original"],
  ["original", "original"],
  ["orig", "original"],
  ["auto", "original"],
]);

function parseLyricsRequest(rawInput = "", currentTrack = null) {
  let raw = String(rawInput || "").replace(/\s+/g, " ").trim();
  let language = "original";
  const langMatch = raw.match(/(?:^|\s)(english|eng|en|hinglish|hindi-english|hin|hi|original|orig|auto)$/i);
  if (langMatch) {
    language = LYRIC_LANGUAGE_ALIASES.get(langMatch[1].toLowerCase()) || "original";
    raw = raw.slice(0, langMatch.index).trim();
  }

  const fallbackMeta = currentTrack ? splitTrackCardMeta(currentTrack) : null;
  const query = raw || (currentTrack?.title || [fallbackMeta?.artist, fallbackMeta?.title].filter(Boolean).join(" - "));
  let displayTitle = fallbackMeta?.title || query || "Lyrics";
  let displayArtist = fallbackMeta?.artist || "";

  if (raw) {
    const dash = raw.match(/^(.+?)\s+-\s+(.+)$/);
    if (dash) {
      displayTitle = dash[1].trim();
      displayArtist = dash[2].trim();
    } else {
      displayTitle = raw;
    }
  }

  return { query, language, displayTitle, displayArtist };
}

function lyricLanguageLabel(language) {
  if (language === "english") return "English";
  if (language === "hinglish") return "Hinglish";
  return "Original";
}

function chunkLyricsText(text, limit = 2400) {
  const chunks = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const line of String(text || "").split(/\r?\n/)) {
    if (line.length > limit) {
      push();
      for (let i = 0; i < line.length; i += limit) chunks.push(line.slice(i, i + limit));
      continue;
    }
    const next = current ? `${current}\n${line}` : line;
    if (next.length > limit) {
      push();
      current = line;
    } else {
      current = next;
    }
  }
  push();
  return chunks;
}

function splitLyricsPages(text, maxChars = 1750) {
  return chunkLyricsText(text, maxChars);
}

function parseGoogleTranslate(data) {
  if (!Array.isArray(data?.[0])) return "";
  return data[0].map(part => Array.isArray(part) ? (part[0] || "") : "").join("").trim();
}

function parseGoogleRomanization(data) {
  if (!Array.isArray(data?.[0])) return "";
  return data[0].map(part => Array.isArray(part) ? (part[3] || part[2] || "") : "").join("").trim();
}

const DEVANAGARI_VOWELS = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au",
  "ऋ": "ri", "ॠ": "ri", "ऑ": "o",
};
const DEVANAGARI_SIGNS = {
  "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ृ": "ri", "ॉ": "o",
};
const DEVANAGARI_CONSONANTS = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v",
  "श": "sh", "ष": "sh", "स": "s", "ह": "h", "ळ": "l", "क्ष": "ksh", "त्र": "tr", "ज्ञ": "gy",
};

function transliterateHindiToLatin(text = "") {
  let out = "";
  const chars = Array.from(String(text || ""));
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const two = ch + (chars[i + 1] || "");
    if (DEVANAGARI_CONSONANTS[two]) {
      out += DEVANAGARI_CONSONANTS[two];
      i++;
      continue;
    }
    if (DEVANAGARI_VOWELS[ch]) out += DEVANAGARI_VOWELS[ch];
    else if (DEVANAGARI_CONSONANTS[ch]) {
      const next = chars[i + 1] || "";
      out += DEVANAGARI_CONSONANTS[ch] + (next && (DEVANAGARI_SIGNS[next] || next === "्") ? "" : "a");
    } else if (DEVANAGARI_SIGNS[ch]) out += DEVANAGARI_SIGNS[ch];
    else if (ch === "्") out = out.replace(/a$/, "");
    else if (ch === "ं" || ch === "ँ") out += "n";
    else if (ch === "ः") out += "h";
    else out += ch;
  }
  return out.replace(/\s+/g, " ").replace(/\n\s+/g, "\n").trim();
}

async function translateChunkGoogle(text, targetLanguage) {
  const target = targetLanguage === "hinglish" ? "hi" : "en";
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&dt=rm&q=${encodeURIComponent(text)}`;
  const data = await fetchJsonSafe(url, { timeoutMs: 6000 });
  if (!data) return null;
  if (targetLanguage === "hinglish") {
    const romanized = parseGoogleRomanization(data);
    const translated = parseGoogleTranslate(data);
    return romanized || transliterateHindiToLatin(translated) || translated;
  }
  return parseGoogleTranslate(data);
}

async function translateLyricsIfNeeded(lyrics, language) {
  if (!lyrics || language === "original") return lyrics;
  const chunks = chunkLyricsText(lyrics, 1800);
  const translated = [];
  for (const chunk of chunks) {
    const out = await translateChunkGoogle(chunk, language);
    translated.push(out || chunk);
  }
  return translated.join("\n\n").trim();
}

async function fetchSyncedLyrics(title, artist = "") {
  try {
    const clean = s => s.replace(/\(.*?\)|\[.*?\]/g, "").trim();
    const t = clean(title), a = clean(artist);
    const url = a
      ? `https://lrclib.net/api/search?artist_name=${encodeURIComponent(a)}&track_name=${encodeURIComponent(t)}`
      : `https://lrclib.net/api/search?q=${encodeURIComponent(t)}`;
    const res  = await fetch(url, { headers: { "Lrclib-Client": "DiscordBot/1.0" } });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const hit  = Array.isArray(data) ? data[0] : null;
    if (!hit) return null;
    const synced = parseLRC(hit.syncedLyrics || "");
    return { synced, plain: hit.plainLyrics || null };
  } catch { return null; }
}

function getLiveLines(q) {
  const lines = q.syncedLyrics;
  if (!lines?.length) return null;
  const pos = q.player?.position ?? 0;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= pos) idx = i;
    else break;
  }
  if (idx < 0) idx = 0;
  return { prev: lines[idx - 1]?.text || null, current: lines[idx]?.text || null, next: lines[idx + 1]?.text || null };
}

function musicFmtDuration(secs) {
  if (!secs || secs <= 0) return "Live";
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
}

function musicSourceLabel(src) {
  if (src === "spotify")    return `${VC_EMOJI_SPOTIFY} Spotify`;
  if (src === "soundcloud") return `${MUSIC_EMOJI_ICON} SoundCloud`;
  return `${VC_EMOJI_YOUTUBE} YouTube`;
}

function musicDetectSource(input) {
  if (/spotify\.com\/(track|album|playlist)\//i.test(input)) return "spotify";
  if (/youtu\.be\/|youtube\.com\/(watch|playlist|shorts)/i.test(input)) return "youtube";
  if (/soundcloud\.com\//i.test(input)) return "soundcloud";
  return "search";
}

function trackLink(track) {
  if (track?.url) return `[${track.title}](${track.url})`;
  return `**${track?.title || "Unknown"}**`;
}

function getTrackThumbnail(track) {
  if (!track?.url) return null;
  const m = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (m) return `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg`;
  return null;
}

const CUPID_PLAYER_ACCENT = 0xff9fbd;
const CUPID_CARD_WIDTH = 760;
const CUPID_CARD_HEIGHT = 900;
const CUPID_CARD_CACHE_LIMIT = 80;
const cupidCoverCache = new Map();

function hexToRgb(hex) {
  const clean = String(hex || "").replace(/^#/, "");
  const n = parseInt(clean.length === 3 ? clean.split("").map(ch => ch + ch).join("") : clean, 16);
  if (!Number.isInteger(n)) return { r: 217, g: 139, b: 165 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

function mixHex(a, b, weight = 0.5) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const w = clampNumber(weight, 0, 1);
  return rgbToHex({
    r: ca.r * (1 - w) + cb.r * w,
    g: ca.g * (1 - w) + cb.g * w,
    b: ca.b * (1 - w) + cb.b * w,
  });
}

function colorToHex(color, fallback = CUPID_PLAYER_ACCENT) {
  const n = normalizeGuildColor(color ?? fallback);
  return `#${n.toString(16).padStart(6, "0")}`;
}

function themeTextColor(accentHex) {
  const c = hexToRgb(accentHex);
  const luminance = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  return luminance > 0.62 ? mixHex(accentHex, "#2b1a22", 0.78) : mixHex(accentHex, "#2b1a22", 0.45);
}

function buildSoezyThemePalette(color) {
  const accent = colorToHex(color);
  return {
    accent,
    border: mixHex(accent, "#8a5267", 0.32),
    strong: mixHex(accent, "#8a5267", 0.12),
    bg: mixHex(accent, "#ffffff", 0.78),
    shell: mixHex(accent, "#ffffff", 0.84),
    panel: mixHex(accent, "#ffffff", 0.91),
    panel2: mixHex(accent, "#ffffff", 0.96),
    button: mixHex(accent, "#ffffff", 0.72),
    text: themeTextColor(accent),
    muted: mixHex(themeTextColor(accent), "#ffffff", 0.32),
    progress: mixHex(accent, "#ffffff", 0.22),
    softProgress: mixHex(accent, "#ffffff", 0.62),
  };
}

function applySoezyTheme(svg, palette) {
  return String(svg)
    .replace(/#f8d4df/gi, palette.bg)
    .replace(/#ffe8f0/gi, palette.shell)
    .replace(/#ffdbe8/gi, palette.panel)
    .replace(/#fff9fc/gi, palette.panel2)
    .replace(/#fff4f8/gi, palette.panel2)
    .replace(/#fff2f7/gi, palette.panel)
    .replace(/#ffe4ee/gi, palette.panel)
    .replace(/#ffeaf1/gi, palette.button)
    .replace(/#ff9fbd/gi, palette.strong)
    .replace(/#d98ba5/gi, palette.border)
    .replace(/#f6a9bf/gi, palette.progress)
    .replace(/#e6a7b8/gi, palette.softProgress)
    .replace(/#a76378/gi, palette.text)
    .replace(/#6e4153/gi, palette.text)
    .replace(/#a17686/gi, palette.muted)
    .replace(/#8b6071/gi, palette.muted);
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function ellipsize(value, maxChars) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function wrapCardText(value, maxChars, maxLines = 2) {
  const text = String(value || "Unknown").replace(/\s+/g, " ").trim();
  if (!text) return ["Unknown"];
  const words = text.split(" ");
  const lines = [];
  let line = "";
  let overflow = false;

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word.length > maxChars ? ellipsize(word, maxChars) : word;
    if (lines.length >= maxLines) {
      overflow = true;
      break;
    }
  }

  if (!overflow && line) lines.push(line);
  if (lines.length > maxLines) overflow = true;
  const finalLines = lines.slice(0, maxLines);
  if (overflow || words.join(" ").length > finalLines.join(" ").length) {
    finalLines[finalLines.length - 1] = ellipsize(finalLines[finalLines.length - 1], maxChars);
  }
  return finalLines.length ? finalLines : ["Unknown"];
}

function svgTextLines(lines, x, y, options = {}) {
  const size = options.size || 24;
  const weight = options.weight || 500;
  const fill = options.fill || "#5f3a4a";
  const lineHeight = options.lineHeight || Math.round(size * 1.18);
  const anchor = options.anchor || "start";
  const family = options.family || "'Trebuchet MS','Segoe UI',Arial,sans-serif";
  return lines.map((line, index) =>
    `<text x="${x}" y="${y + index * lineHeight}" text-anchor="${anchor}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`
  ).join("");
}

function starPoints(cx, cy, outer, inner) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    points.push(`${(cx + Math.cos(angle) * radius).toFixed(1)},${(cy + Math.sin(angle) * radius).toFixed(1)}`);
  }
  return points.join(" ");
}

function heartPath(cx, cy, size) {
  const s = size;
  return [
    `M ${cx} ${cy + s * 0.35}`,
    `C ${cx - s * 0.9} ${cy - s * 0.15}, ${cx - s * 0.7} ${cy - s * 0.85}, ${cx - s * 0.18} ${cy - s * 0.62}`,
    `C ${cx} ${cy - s * 1.0}, ${cx + s * 0.72} ${cy - s * 0.86}, ${cx + s * 0.74} ${cy - s * 0.22}`,
    `C ${cx + s * 0.75} ${cy + s * 0.26}, ${cx + s * 0.27} ${cy + s * 0.62}, ${cx} ${cy + s}`,
    `C ${cx - s * 0.18} ${cy + s * 0.73}, ${cx - s * 0.5} ${cy + s * 0.52}, ${cx} ${cy + s * 0.35}`,
    "Z",
  ].join(" ");
}

function musicSourceName(src) {
  if (src === "spotify") return "Spotify";
  if (src === "soundcloud") return "SoundCloud";
  return "YouTube";
}

function cleanCardSongTitle(value) {
  return String(value || "")
    .replace(/\([^)]*\b(official|lyrical?|video|song|audio|hd|4k)\b[^)]*\)/ig, " ")
    .replace(/\[[^\]]*\b(official|lyrical?|video|song|audio|hd|4k)\b[^\]]*\]/ig, " ")
    .replace(/\b(official|lyrical?|video|song|audio|hd|4k)\b/ig, " ")
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitTrackCardMeta(track) {
  const raw = String(track?.resolvedTitle || track?.title || "Unknown Track").replace(/\s+/g, " ").trim();
  const explicitArtist = String(track?.artist || track?.author || track?._llTrack?.info?.author || "").trim();
  const pipeParts = raw.split(/\s*\|\s*/).map(part => part.trim()).filter(Boolean);
  if (pipeParts.length > 1) {
    const title = cleanCardSongTitle(pipeParts[0]) || pipeParts[0];
    const artist = explicitArtist || pipeParts.slice(1).reverse().find(part => /[A-Za-z\u0900-\u097f]/.test(part)) || pipeParts[1];
    return { title, artist };
  }
  const dash = raw.match(/^(.{1,80}?)\s+-\s+(.+)$/);
  if (dash) return { artist: explicitArtist || dash[1].trim(), title: cleanCardSongTitle(dash[2]) || dash[2].trim() || raw };
  const by = raw.match(/^(.+?)\s+\bby\b\s+(.+)$/i);
  if (by) return { title: cleanCardSongTitle(by[1]) || by[1].trim(), artist: explicitArtist || by[2].trim() };
  return {
    title: cleanCardSongTitle(raw) || raw,
    artist: explicitArtist || (track?.requestedBy && track.requestedBy !== "Autoplay"
      ? track.requestedBy
      : musicSourceName(track?.source)),
  };
}

function cupidCardFileName(guildId) {
  return `soezy-cupid-now-playing-${guildId}.png`;
}

async function fetchCupidCoverDataUrl(imageUrl) {
  if (!sharp || !imageUrl || typeof fetch !== "function") return null;
  const url = String(imageUrl);
  const cached = cupidCoverCache.get(url);
  if (cached) {
    cached.usedAt = Date.now();
    return cached.dataUrl;
  }

  let dataUrl = null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Soezy/1.0" } });
    const contentType = res?.headers?.get?.("content-type") || "";
    if (res?.ok && /^image\//i.test(contentType)) {
      const raw = Buffer.from(await res.arrayBuffer());
      if (raw.length <= 4 * 1024 * 1024) {
        const cover = await sharp(raw)
          .resize(160, 160, { fit: "cover", position: "centre" })
          .png()
          .toBuffer();
        dataUrl = `data:image/png;base64,${cover.toString("base64")}`;
      }
    }
  } catch {
    dataUrl = null;
  }

  if (dataUrl) {
    cupidCoverCache.set(url, { dataUrl, usedAt: Date.now() });
    if (cupidCoverCache.size > CUPID_CARD_CACHE_LIMIT) {
      const oldest = [...cupidCoverCache.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt)[0];
      if (oldest) cupidCoverCache.delete(oldest[0]);
    }
  }
  return dataUrl;
}

function buildAlbumCoverSvg(coverDataUrl, coverLabel) {
  if (coverDataUrl) {
    return `
      <rect x="116" y="688" width="116" height="116" rx="8" fill="#513247" stroke="#a86f80" stroke-width="3"/>
      <image href="${coverDataUrl}" x="120" y="692" width="108" height="108" preserveAspectRatio="xMidYMid slice" clip-path="url(#coverClip)"/>
    `;
  }

  const lines = wrapCardText(coverLabel || "Soezy", 9, 2);
  return `
    <rect x="116" y="688" width="116" height="116" rx="8" fill="url(#coverGradient)" stroke="#a86f80" stroke-width="3"/>
    <circle cx="174" cy="746" r="36" fill="#231923"/>
    <circle cx="174" cy="746" r="13" fill="#f48fb1"/>
    ${svgTextLines(lines, 174, 828, { size: 14, weight: 700, fill: "#7b4b5d", anchor: "middle", lineHeight: 16 })}
  `;
}

function buildCupidThumbSvg(coverDataUrl, x, y, size, coverLabel, clipId, radius = 10) {
  if (coverDataUrl) {
    return `
      <rect x="${x - 3}" y="${y - 3}" width="${size + 6}" height="${size + 6}" rx="${radius + 3}" fill="#ffeaf1" stroke="#d98ba5" stroke-width="3"/>
      <image href="${coverDataUrl}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>
    `;
  }

  const cx = x + size / 2;
  const cy = y + size / 2;
  const lines = coverLabel === false ? [] : wrapCardText(coverLabel || "Soezy", 9, 2);
  return `
    <rect x="${x - 3}" y="${y - 3}" width="${size + 6}" height="${size + 6}" rx="${radius + 3}" fill="#ffeaf1" stroke="#d98ba5" stroke-width="3"/>
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="url(#coverGradient)"/>
    <circle cx="${cx}" cy="${cy}" r="${size * 0.32}" fill="#19131b"/>
    <circle cx="${cx}" cy="${cy}" r="${size * 0.12}" fill="#ff8fb1"/>
    ${lines.length ? svgTextLines(lines, cx, y + size + 20, { size: 13, weight: 700, fill: "#7b4b5d", anchor: "middle", lineHeight: 15 }) : ""}
  `;
}

function buildSoezySeparatedPlayerSvg(q, coverDataUrl) {
  const track = q.current || {};
  const palette = buildSoezyThemePalette(q?.guildColor ?? CUPID_PLAYER_ACCENT);
  const meta = splitTrackCardMeta(track);
  const titleLines = wrapCardText(meta.title, 24, 2);
  const artistLines = wrapCardText(`by ${meta.artist}`, 30, 1);
  const positionSecs = Math.max(0, Math.floor((q.player?.position || 0) / 1000));
  const durationSecs = Math.max(0, track.duration || 0);
  const progress = durationSecs > 0 ? clampNumber(positionSecs / durationSecs, 0, 1) : 0.5;
  const progressX = 116 + progress * 528;
  const isPaused = q.player?.paused ?? false;
  const sourceName = musicSourceName(track.source);
  const requester = track.requestedBy || "Unknown";
  const footer = `${sourceName} | Queue: ${q.tracks.length} remaining | Requested by ${requester}`;
  const discCover = coverDataUrl
    ? `<image href="${coverDataUrl}" x="336" y="282" width="88" height="88" preserveAspectRatio="xMidYMid slice" clip-path="url(#discCoverClip)"/>`
    : `<circle cx="380" cy="326" r="44" fill="#ff8fb1"/><circle cx="380" cy="326" r="13" fill="#fff8fb"/>`;
  const infoCover = buildCupidThumbSvg(coverDataUrl, 96, 516, 92, false, "infoCoverClip", 10);

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${CUPID_CARD_WIDTH}" height="${CUPID_CARD_HEIGHT}" viewBox="0 0 ${CUPID_CARD_WIDTH} ${CUPID_CARD_HEIGHT}">
  <defs>
    <linearGradient id="roomGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7a315d"/>
      <stop offset="0.55" stop-color="#4f2649"/>
      <stop offset="1" stop-color="#25192f"/>
    </linearGradient>
    <linearGradient id="panelGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff9fc"/>
      <stop offset="1" stop-color="#ffe4ee"/>
    </linearGradient>
    <linearGradient id="coverGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4b253c"/>
      <stop offset="0.48" stop-color="#c55277"/>
      <stop offset="1" stop-color="#191722"/>
    </linearGradient>
    <radialGradient id="discGlow" cx="45%" cy="34%" r="68%">
      <stop offset="0" stop-color="#5f3a4e"/>
      <stop offset="0.45" stop-color="#111016"/>
      <stop offset="1" stop-color="#050408"/>
    </radialGradient>
    <clipPath id="discCoverClip"><circle cx="380" cy="326" r="44"/></clipPath>
    <clipPath id="infoCoverClip"><rect x="96" y="516" width="92" height="92" rx="10"/></clipPath>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="5" stdDeviation="2" flood-color="#9c6072" flood-opacity="0.28"/>
    </filter>
    <filter id="buttonGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#ff9fbd" flood-opacity="0.65"/>
    </filter>
  </defs>

  <rect width="${CUPID_CARD_WIDTH}" height="${CUPID_CARD_HEIGHT}" fill="#f8d4df"/>
  <rect x="36" y="38" width="688" height="842" rx="18" fill="#ffe8f0" stroke="#d98ba5" stroke-width="4" filter="url(#softShadow)"/>
  <rect x="50" y="52" width="660" height="820" fill="none" stroke="#f6a9bf" stroke-width="5"/>
  <rect x="59" y="61" width="642" height="800" fill="none" stroke="#fff8fb" stroke-width="3"/>

  <path d="M354 32 C324 12 302 29 304 54 C323 50 340 47 360 48 Z" fill="#ffb8cc" stroke="#a76378" stroke-width="3"/>
  <path d="M406 32 C436 12 458 29 456 54 C437 50 420 47 400 48 Z" fill="#ffb8cc" stroke="#a76378" stroke-width="3"/>
  <rect x="364" y="28" width="32" height="36" rx="7" fill="#f48aaa" stroke="#a76378" stroke-width="3"/>
  <path d="M336 48 H298 L286 58 H330 Z" fill="#ffe5ed" stroke="#a76378" stroke-width="2"/>
  <path d="M424 48 H462 L474 58 H430 Z" fill="#ffe5ed" stroke="#a76378" stroke-width="2"/>
  <path d="${heartPath(64, 139, 18)}" fill="#ff9eb9" stroke="#a76378" stroke-width="3"/>
  <path d="${heartPath(696, 139, 18)}" fill="#ff9eb9" stroke="#a76378" stroke-width="3"/>
  <path d="${heartPath(65, 826, 18)}" fill="#ffbfd0" stroke="#a76378" stroke-width="3"/>
  <path d="${heartPath(696, 826, 18)}" fill="#ffbfd0" stroke="#a76378" stroke-width="3"/>

  <rect x="76" y="82" width="608" height="76" rx="14" fill="#ffdbe8" stroke="#d98ba5" stroke-width="4"/>
  <text x="108" y="129" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="33" font-weight="800" fill="#6e4153">Soezy Player</text>
  <rect x="500" y="99" width="146" height="44" rx="14" fill="#ff9fbd" stroke="#a76378" stroke-width="4" filter="url(#buttonGlow)"/>
  <text x="573" y="127" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="17" font-weight="800" fill="#6e4153">Stop Music</text>

  <rect x="76" y="178" width="608" height="300" rx="12" fill="url(#roomGradient)" stroke="#d98ba5" stroke-width="4"/>
  <path d="M86 412 H674 M86 365 H674 M206 178 V412 M512 178 V412" stroke="#44213a" stroke-width="4" opacity="0.45"/>
  <rect x="518" y="206" width="104" height="126" fill="#171b36" stroke="#b9738a" stroke-width="5"/>
  <path d="M558 234 A28 28 0 1 0 590 270 A21 21 0 1 1 558 234" fill="#ffd77a"/>
  <circle cx="540" cy="230" r="3" fill="#fff4bf"/><circle cx="606" cy="247" r="2.5" fill="#fff4bf"/><circle cx="570" cy="307" r="2.5" fill="#fff4bf"/>
  <rect x="580" y="358" width="58" height="80" rx="24" fill="#60435f" stroke="#2f2031" stroke-width="4"/>
  <path d="M594 355 C591 323 604 307 619 292 M611 356 C621 323 637 310 651 296" stroke="#315032" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="${heartPath(620, 287, 13)}" fill="#ff9eb7" stroke="#8f4c61" stroke-width="3"/>
  <path d="${heartPath(651, 296, 12)}" fill="#ff8aa8" stroke="#8f4c61" stroke-width="3"/>

  <ellipse cx="380" cy="439" rx="170" ry="32" fill="#1b1020" opacity="0.25"/>
  <rect x="230" y="398" width="300" height="48" rx="10" fill="#fac2c9" stroke="#6e4153" stroke-width="4"/>
  <circle cx="380" cy="326" r="134" fill="#08060a" stroke="#050306" stroke-width="6"/>
  <circle cx="380" cy="326" r="112" fill="url(#discGlow)" stroke="#2f1d2a" stroke-width="5"/>
  <circle cx="380" cy="326" r="80" fill="none" stroke="#241720" stroke-width="7"/>
  ${discCover}
  <circle cx="380" cy="326" r="12" fill="#fff8fb" stroke="#6e4153" stroke-width="3"/>
  <path d="M276 240 C320 202 399 193 458 223" fill="none" stroke="#f6b4ca" stroke-width="10" stroke-linecap="round" opacity="0.32"/>
  <path d="M475 250 C529 303 524 389 465 433" fill="none" stroke="#fff8fb" stroke-width="12" stroke-linecap="round" opacity="0.5"/>
  <path d="M276 412 C242 368 240 292 276 248" fill="none" stroke="#5a384c" stroke-width="8" stroke-linecap="round"/>
  <path d="M478 284 C520 305 536 352 509 395" stroke="#fff3ee" stroke-width="9" fill="none" stroke-linecap="round"/>
  <path d="M505 390 L532 415" stroke="#6e4153" stroke-width="10" stroke-linecap="round"/>
  <circle cx="540" cy="407" r="14" fill="#d98ba5" stroke="#6e4153" stroke-width="4"/>
  <text x="151" y="456" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="15" font-weight="800" fill="#ffd6e4">spinning</text>

  <rect x="76" y="496" width="608" height="130" rx="12" fill="url(#panelGradient)" stroke="#d98ba5" stroke-width="4"/>
  <path d="${heartPath(98, 508, 11)}" fill="#ffb4ca" stroke="#a76378" stroke-width="2"/>
  <path d="${heartPath(666, 508, 11)}" fill="#ffb4ca" stroke="#a76378" stroke-width="2"/>
  ${infoCover}
  ${svgTextLines(["now playing..."], 216, 539, { size: 20, weight: 700, fill: "#a17686", family: "'Consolas','Courier New',monospace" })}
  ${svgTextLines(titleLines, 216, 579, { size: titleLines.length > 1 ? 29 : 35, weight: 500, fill: "#6e4153", lineHeight: 33, family: "'Consolas','Courier New',monospace" })}
  ${svgTextLines(artistLines, 216, 616, { size: 22, weight: 500, fill: "#8b6071", family: "'Consolas','Courier New',monospace" })}

  <rect x="76" y="646" width="608" height="76" rx="12" fill="#fff2f7" stroke="#d98ba5" stroke-width="4"/>
  <line x1="116" y1="683" x2="644" y2="683" stroke="#e6a7b8" stroke-width="8" stroke-linecap="round"/>
  <line x1="116" y1="683" x2="${progressX.toFixed(1)}" y2="683" stroke="#d98ba5" stroke-width="8" stroke-linecap="round"/>
  <polygon points="${starPoints(progressX, 683, 20, 9)}" fill="#fff0a8" stroke="#a76378" stroke-width="3"/>
  <text x="116" y="710" font-family="'Consolas','Courier New',monospace" font-size="19" fill="#6e4153">${escapeXml(musicFmtDuration(positionSecs))}</text>
  <text x="644" y="710" text-anchor="end" font-family="'Consolas','Courier New',monospace" font-size="19" fill="#6e4153">${escapeXml(musicFmtDuration(durationSecs))}</text>

  <rect x="76" y="740" width="608" height="106" rx="12" fill="#fff4f8" stroke="#d98ba5" stroke-width="4"/>
  <rect x="108" y="756" width="102" height="44" rx="12" fill="#ffeaf1" stroke="#d98ba5" stroke-width="4"/>
  <text x="159" y="784" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="17" font-weight="800" fill="#6e4153">Prev</text>
  <rect x="230" y="756" width="102" height="44" rx="12" fill="#ffeaf1" stroke="#d98ba5" stroke-width="4"/>
  <text x="281" y="784" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="17" font-weight="800" fill="#6e4153">${isPaused ? "Play" : "Pause"}</text>
  <rect x="352" y="756" width="102" height="44" rx="12" fill="#ffeaf1" stroke="#d98ba5" stroke-width="4"/>
  <text x="403" y="784" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="17" font-weight="800" fill="#6e4153">Next</text>
  <rect x="474" y="756" width="102" height="44" rx="12" fill="#ffeaf1" stroke="#d98ba5" stroke-width="4"/>
  <text x="525" y="784" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="17" font-weight="800" fill="#6e4153">Like</text>
  <rect x="154" y="809" width="128" height="36" rx="11" fill="#ffeaf1" stroke="#d98ba5" stroke-width="4"/>
  <text x="218" y="833" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="16" font-weight="800" fill="#6e4153">Autoplay</text>
  <rect x="316" y="809" width="112" height="36" rx="11" fill="#ffeaf1" stroke="#d98ba5" stroke-width="4"/>
  <text x="372" y="833" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="16" font-weight="800" fill="#6e4153">Replay</text>
  <rect x="462" y="809" width="106" height="36" rx="11" fill="#ffeaf1" stroke="#d98ba5" stroke-width="4"/>
  <text x="515" y="833" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="16" font-weight="800" fill="#6e4153">Loop</text>

  <rect x="98" y="850" width="564" height="24" rx="12" fill="#ffeaf1" opacity="0.85"/>
  <rect x="134" y="854" width="24" height="16" rx="4" fill="#ff0033"/>
  <polygon points="143,858 143,866 151,862" fill="#fff8fb"/>
  <text x="380" y="869" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="16" font-weight="800" fill="#6e4153">${escapeXml(footer)}</text>
</svg>
`;
  return applySoezyTheme(svg, palette);
}

function buildCupidNowPlayingSvg(q, coverDataUrl) {
  const track = q.current || {};
  const meta = splitTrackCardMeta(track);
  const titleLines = wrapCardText(meta.title, 24, 2);
  const artistLines = wrapCardText(`by ${meta.artist}`, 30, 1);
  const positionSecs = Math.max(0, Math.floor((q.player?.position || 0) / 1000));
  const durationSecs = Math.max(0, track.duration || 0);
  const progress = durationSecs > 0 ? clampNumber(positionSecs / durationSecs, 0, 1) : 0.5;
  const progressX = 116 + progress * 528;
  const isPaused = q.player?.paused ?? false;
  const sourceName = musicSourceName(track.source);
  const requester = track.requestedBy || "Unknown";
  const discCenter = coverDataUrl
    ? `<image href="${coverDataUrl}" x="235" y="298" width="82" height="82" preserveAspectRatio="xMidYMid slice" clip-path="url(#discCoverClip)"/>`
    : `<circle cx="276" cy="339" r="41" fill="#ff8fb1"/><circle cx="276" cy="339" r="14" fill="#ffeaf1"/>`;
  const infoCover = buildCupidThumbSvg(coverDataUrl, 100, 532, 88, false, "infoCoverClip", 10);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${CUPID_CARD_WIDTH}" height="${CUPID_CARD_HEIGHT}" viewBox="0 0 ${CUPID_CARD_WIDTH} ${CUPID_CARD_HEIGHT}">
  <defs>
    <linearGradient id="roomGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c315d"/>
      <stop offset="0.55" stop-color="#54284b"/>
      <stop offset="1" stop-color="#24192f"/>
    </linearGradient>
    <linearGradient id="panelGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff8fb"/>
      <stop offset="1" stop-color="#ffe4ee"/>
    </linearGradient>
    <linearGradient id="coverGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4b253c"/>
      <stop offset="0.5" stop-color="#c55277"/>
      <stop offset="1" stop-color="#191722"/>
    </linearGradient>
    <radialGradient id="discGlow" cx="45%" cy="34%" r="66%">
      <stop offset="0" stop-color="#74435f"/>
      <stop offset="0.45" stop-color="#171016"/>
      <stop offset="1" stop-color="#070509"/>
    </radialGradient>
    <clipPath id="discCoverClip"><circle cx="276" cy="339" r="41"/></clipPath>
    <clipPath id="infoCoverClip"><rect x="100" y="532" width="88" height="88" rx="10"/></clipPath>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="5" stdDeviation="2" flood-color="#9c6072" flood-opacity="0.28"/>
    </filter>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="${CUPID_CARD_WIDTH}" height="${CUPID_CARD_HEIGHT}" fill="#f8d4df"/>
  <rect x="36" y="38" width="688" height="842" rx="18" fill="#ffe8f0" stroke="#d98ba5" stroke-width="4" filter="url(#softShadow)"/>
  <rect x="50" y="52" width="660" height="820" fill="none" stroke="#f6a9bf" stroke-width="5"/>
  <rect x="59" y="61" width="642" height="800" fill="none" stroke="#fff8fb" stroke-width="3"/>

  <path d="${heartPath(64, 139, 18)}" fill="#ff9eb9" stroke="#a76378" stroke-width="3"/>
  <path d="${heartPath(696, 139, 18)}" fill="#ff9eb9" stroke="#a76378" stroke-width="3"/>
  <path d="${heartPath(65, 826, 18)}" fill="#ffbfd0" stroke="#a76378" stroke-width="3"/>
  <path d="${heartPath(696, 826, 18)}" fill="#ffbfd0" stroke="#a76378" stroke-width="3"/>

  <path d="M354 32 C324 12 302 29 304 54 C323 50 340 47 360 48 Z" fill="#ffb8cc" stroke="#a76378" stroke-width="3"/>
  <path d="M406 32 C436 12 458 29 456 54 C437 50 420 47 400 48 Z" fill="#ffb8cc" stroke="#a76378" stroke-width="3"/>
  <rect x="364" y="28" width="32" height="36" rx="7" fill="#f48aaa" stroke="#a76378" stroke-width="3"/>
  <path d="M336 48 H298 L286 58 H330 Z" fill="#ffe5ed" stroke="#a76378" stroke-width="2"/>
  <path d="M424 48 H462 L474 58 H430 Z" fill="#ffe5ed" stroke="#a76378" stroke-width="2"/>

  <rect x="72" y="76" width="616" height="70" rx="10" fill="#ffd6e4" stroke="#d98ba5" stroke-width="4"/>
  <text x="104" y="121" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="32" font-weight="700" fill="#6e4153">Soezy Player</text>
  <circle cx="558" cy="112" r="12" fill="none" stroke="#6e4153" stroke-width="4"/>
  <path d="M558 91 V101 M558 123 V134 M537 112 H547 M569 112 H580 M544 98 L551 105 M572 98 L565 105 M544 126 L551 119 M572 126 L565 119" stroke="#6e4153" stroke-width="4" stroke-linecap="round"/>
  <rect x="592" y="94" width="42" height="40" rx="7" fill="#ffeaf1" stroke="#d98ba5" stroke-width="4"/>
  <path d="M603 122 H623" stroke="#6e4153" stroke-width="4"/>
  <rect x="646" y="94" width="42" height="40" rx="7" fill="#ffeaf1" stroke="#d98ba5" stroke-width="4"/>
  <path d="M657 104 L677 124 M677 104 L657 124" stroke="#6e4153" stroke-width="4" stroke-linecap="round"/>

  <rect x="74" y="158" width="612" height="340" rx="8" fill="url(#roomGradient)" stroke="#d98ba5" stroke-width="4"/>
  <path d="M84 430 H676 M84 366 H676 M204 158 V430 M420 158 V430" stroke="#44213a" stroke-width="4" opacity="0.55"/>
  <rect x="95" y="179" width="360" height="296" rx="8" fill="#000" opacity="0.06"/>
  <rect x="332" y="198" width="102" height="120" fill="#161933" stroke="#b9738a" stroke-width="5"/>
  <path d="M369 225 A28 28 0 1 0 400 263 A21 21 0 1 1 369 225" fill="#ffd77a"/>
  <circle cx="354" cy="224" r="3" fill="#fff4bf"/><circle cx="419" cy="238" r="2.5" fill="#fff4bf"/><circle cx="379" cy="293" r="2.5" fill="#fff4bf"/>
  <rect x="396" y="333" width="58" height="94" rx="24" fill="#60435f" stroke="#2f2031" stroke-width="4"/>
  <path d="M410 331 C407 297 420 283 435 268 M426 332 C435 299 451 288 466 273" stroke="#315032" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="${heartPath(436, 263, 14)}" fill="#ff9eb7" stroke="#8f4c61" stroke-width="3"/>
  <path d="${heartPath(466, 273, 13)}" fill="#ff8aa8" stroke="#8f4c61" stroke-width="3"/>

  <ellipse cx="276" cy="418" rx="146" ry="42" fill="#1b1020" opacity="0.28"/>
  <rect x="126" y="383" width="300" height="54" rx="10" fill="#fac2c9" stroke="#6e4153" stroke-width="4"/>
  <circle cx="276" cy="339" r="128" fill="#100b11" stroke="#050306" stroke-width="5"/>
  <circle cx="276" cy="339" r="108" fill="none" stroke="#34202d" stroke-width="5"/>
  <circle cx="276" cy="339" r="76" fill="url(#discGlow)"/>
  ${discCenter}
  <circle cx="276" cy="339" r="11" fill="#ffeaf1" stroke="#6e4153" stroke-width="3"/>
  <path d="M193 253 C238 215 309 210 354 244" fill="none" stroke="#f7b5cb" stroke-width="10" stroke-linecap="round" opacity="0.3"/>
  <path d="M333 246 C393 282 406 366 366 416" fill="none" stroke="#fff8fb" stroke-width="12" stroke-linecap="round" opacity="0.52"/>
  <path d="M374 306 C411 318 426 356 405 394" stroke="#fff3ee" stroke-width="9" fill="none" stroke-linecap="round"/>
  <path d="M402 390 L426 412" stroke="#6e4153" stroke-width="10" stroke-linecap="round"/>
  <circle cx="436" cy="402" r="14" fill="#d98ba5" stroke="#6e4153" stroke-width="4"/>

  <rect x="486" y="180" width="176" height="296" rx="14" fill="#fff1f6" stroke="#d98ba5" stroke-width="4" opacity="0.96"/>
  <text x="574" y="213" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="18" font-weight="800" fill="#6e4153">controls</text>
  <rect x="510" y="232" width="128" height="48" rx="14" fill="#ff9fbd" stroke="#a76378" stroke-width="4" filter="url(#glow)"/>
  <text x="574" y="263" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="17" font-weight="800" fill="#6e4153">Stop Music</text>
  <rect x="510" y="294" width="128" height="42" rx="13" fill="#ffeaf1" stroke="#d98ba5" stroke-width="3"/>
  <text x="574" y="321" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="16" font-weight="700" fill="#6e4153">Queue</text>
  <rect x="510" y="348" width="128" height="42" rx="13" fill="#ffeaf1" stroke="#d98ba5" stroke-width="3"/>
  <text x="574" y="375" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="16" font-weight="700" fill="#6e4153">Replay</text>
  <rect x="510" y="402" width="128" height="42" rx="13" fill="#ffeaf1" stroke="#d98ba5" stroke-width="3"/>
  <text x="574" y="429" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="16" font-weight="700" fill="#6e4153">Loop</text>
  <path d="${heartPath(648, 452, 13)}" fill="#ffb4ca" stroke="#a76378" stroke-width="2"/>

  <rect x="74" y="514" width="612" height="124" rx="12" fill="url(#panelGradient)" stroke="#d98ba5" stroke-width="4"/>
  <path d="${heartPath(96, 526, 11)}" fill="#ffb4ca" stroke="#a76378" stroke-width="2"/>
  <path d="${heartPath(666, 526, 11)}" fill="#ffb4ca" stroke="#a76378" stroke-width="2"/>
  ${infoCover}
  ${svgTextLines(["now playing..."], 216, 555, { size: 20, weight: 700, fill: "#a17686", family: "'Consolas','Courier New',monospace" })}
  ${svgTextLines(titleLines, 216, 592, { size: titleLines.length > 1 ? 29 : 35, weight: 500, fill: "#6e4153", lineHeight: 34, family: "'Consolas','Courier New',monospace" })}
  ${svgTextLines(artistLines, 216, 627, { size: 22, weight: 500, fill: "#8b6071", family: "'Consolas','Courier New',monospace" })}

  <rect x="118" y="660" width="96" height="50" rx="12" fill="#ffeaf1" stroke="#d98ba5" stroke-width="4"/>
  <text x="166" y="692" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="18" font-weight="800" fill="#6e4153">Prev</text>
  <rect x="238" y="660" width="96" height="50" rx="12" fill="#ffeaf1" stroke="#d98ba5" stroke-width="4"/>
  <text x="286" y="692" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="18" font-weight="800" fill="#6e4153">${isPaused ? "Play" : "Pause"}</text>
  <rect x="358" y="660" width="96" height="50" rx="12" fill="#ffeaf1" stroke="#d98ba5" stroke-width="4"/>
  <text x="406" y="692" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="18" font-weight="800" fill="#6e4153">Next</text>
  <rect x="478" y="660" width="96" height="50" rx="12" fill="#ffeaf1" stroke="#d98ba5" stroke-width="4"/>
  <text x="526" y="692" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="18" font-weight="800" fill="#6e4153">Like</text>
  <rect x="154" y="728" width="128" height="48" rx="12" fill="#ffeaf1" stroke="#d98ba5" stroke-width="4"/>
  <text x="218" y="759" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="18" font-weight="800" fill="#6e4153">Autoplay</text>
  <rect x="316" y="728" width="112" height="48" rx="12" fill="#ffeaf1" stroke="#d98ba5" stroke-width="4"/>
  <text x="372" y="759" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="18" font-weight="800" fill="#6e4153">Replay</text>
  <rect x="462" y="728" width="106" height="48" rx="12" fill="#ffeaf1" stroke="#d98ba5" stroke-width="4"/>
  <text x="515" y="759" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="18" font-weight="800" fill="#6e4153">Loop</text>

  <line x1="116" y1="810" x2="644" y2="810" stroke="#e6a7b8" stroke-width="8" stroke-linecap="round"/>
  <line x1="116" y1="810" x2="${progressX.toFixed(1)}" y2="810" stroke="#d98ba5" stroke-width="8" stroke-linecap="round"/>
  <polygon points="${starPoints(progressX, 810, 20, 9)}" fill="#fff0a8" stroke="#a76378" stroke-width="3"/>
  <text x="116" y="842" font-family="'Consolas','Courier New',monospace" font-size="20" fill="#6e4153">${escapeXml(musicFmtDuration(positionSecs))}</text>
  <text x="644" y="842" text-anchor="end" font-family="'Consolas','Courier New',monospace" font-size="20" fill="#6e4153">${escapeXml(musicFmtDuration(durationSecs))}</text>
  <path d="${heartPath(380, 831, 18)}" fill="#ff9fbd" stroke="#a76378" stroke-width="3"/>

  <text x="380" y="866" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI',Arial,sans-serif" font-size="17" font-weight="700" fill="#6e4153">${escapeXml(sourceName)} | Queue: ${q.tracks.length} remaining | Requested by ${escapeXml(requester)}</text>
</svg>
`;
}

async function renderCupidNowPlayingCard(q) {
  if (!sharp || !q?.current) return null;
  try {
    const thumbUrl = getTrackThumbnail({ url: q.current.streamUrl || q.current.url });
    const coverDataUrl = await fetchCupidCoverDataUrl(thumbUrl);
    return await sharp(Buffer.from(buildSoezySeparatedPlayerSvg(q, coverDataUrl))).png().toBuffer();
  } catch (err) {
    console.warn("[MUSIC] Cupid now playing card render failed:", err?.message || err);
    return null;
  }
}

function buildNpControlRows(q, guildId) {
  const isPaused = q.player?.paused ?? false;
  const loopLabel = q.loop === "track" ? "Loop: Track" : q.loop === "queue" ? "Loop: Queue" : "Loop";
  const hasPrev = !!q.previousTrack;
  const hasNext = q.tracks.length > 0 || q.autoplay;
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`music_prev_${guildId}`).setLabel("Prev").setStyle(ButtonStyle.Secondary).setDisabled(!hasPrev),
    new ButtonBuilder().setCustomId(`music_pauseplay_${guildId}`).setLabel(isPaused ? "Play" : "Pause").setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`music_skip_${guildId}`).setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(!hasNext),
    new ButtonBuilder().setCustomId(`music_addplaylist_${guildId}`).setLabel("Like").setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`music_autoplay_${guildId}`).setLabel("Autoplay").setStyle(q.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`music_replay_${guildId}`).setLabel("Replay").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`music_loop_${guildId}`).setLabel(loopLabel).setStyle(q.loop !== "off" ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`music_stop_${guildId}`).setLabel("Stop Music").setStyle(ButtonStyle.Danger),
  );
  return { row1, row2, row3 };
}

// ── UI container helpers ──────────────────────────────────────────────────────
function createErrorContainer(title, desc, guildColor = getThemeColor(null)) {
  return new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`### ${STATUS.error} ${title}`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(`> ${STATUS.cross} ${roastStatusMessage("error", title, desc)}`));
}

function createSuccessContainer(title, desc, guildColor = getThemeColor(null)) {
  return new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`### ${STATUS.success} ${title}`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(`> ${STATUS.tick} ${roastStatusMessage("success", title, desc)}`));
}

// Builds the "Hope you enjoyed" end-of-queue container.
// Used to EDIT the existing Now Playing message in place instead of sending a new one.
function buildHopeYouEnjoyedContainer(q, prefix = ".") {
  const botId = q?.textChannel?.client?.user?.id;
  const inviteLink = botId
    ? `https://discord.com/oauth2/authorize?client_id=${botId}&permissions=8&scope=bot%20applications.commands`
    : null;
  const communityLinks = inviteLink
    ? `Join our [**support server**](https://discord.gg/PJfTdSu95y) or [**add me**](${inviteLink}) for more features and updates!`
    : "Join our [**support server**](https://discord.gg/PJfTdSu95y) for more features and updates!";
  return new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${MUSIC_QUEUE_END} **Hope you enjoyed your music!**`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(
      `> ${communityLinks}\n` +
      `-# Use \`${prefix}play <song>\` to start a new session.`
    ));
}

function buildNpContainer(q, guildId) {
  const track    = q.current;
  const meta     = splitTrackCardMeta(track);
  const isPaused = q.player?.paused ?? false;
  const thumbUrl = getTrackThumbnail({ url: track.streamUrl || track.url });
  const loopLabel  = q.loop === "track" ? "Loop: Track" : q.loop === "queue" ? "Loop: Queue" : "Loop";
  const hasPrev    = !!q.previousTrack;
  const hasNext    = q.tracks.length > 0 || q.autoplay;
  const titleLine  = track?.url ? `[${meta.title || track.title || "Unknown"}](${track.url})` : `**${meta.title || track.title || "Unknown"}**`;
  const artistLine = meta.artist ? `\n-# by ${meta.artist}` : "";
  // ── Row 1: Prev · Pause/Resume · Next · Like ────────────────────────────
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`music_prev_${guildId}`).setLabel("Prev").setStyle(ButtonStyle.Secondary).setDisabled(!hasPrev),
    new ButtonBuilder().setCustomId(`music_pauseplay_${guildId}`).setLabel(isPaused ? "Resume" : "Pause").setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`music_skip_${guildId}`).setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(!hasNext),
    new ButtonBuilder().setCustomId(`music_addplaylist_${guildId}`).setLabel("Like").setStyle(ButtonStyle.Secondary),
  );
  // ── Row 2: Autoplay · Replay · Loop ─────────────────────────────────────
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`music_autoplay_${guildId}`).setLabel("Autoplay").setStyle(q.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`music_replay_${guildId}`).setLabel("Replay").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`music_loop_${guildId}`).setLabel(loopLabel).setStyle(q.loop !== "off" ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
  
  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${MUSIC_NOTE} Now Playing`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  if (thumbUrl) {
    container.addSectionComponents(section =>
      section.addTextDisplayComponents(t => t.setContent(`> ${titleLine}${artistLine}`)).setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl).setDescription(meta.title || track.title))
    );
  } else {
    container.addTextDisplayComponents(t => t.setContent(`> ${titleLine}${artistLine}`));
  }
  container
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(
      `${STATUS.arrow} **Duration:** \`${musicFmtDuration(track.duration)}\`\n` +
      `${STATUS.arrow} **Source:** ${musicSourceLabel(track.source)}\n` +
      `${STATUS.arrow} **Loop:** \`${q.loop}\`  **Vol:** \`${q.volume}%\`  **Queue:** \`${q.tracks.length} remaining\``
    ))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(row1)
    .addActionRowComponents(row2)
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t => t.setContent(`-# Requested by ${track.requestedBy || "Unknown"}`));
  return container;
}

async function buildNpMessagePayload(q, guildId, options = {}) {
  const payload = { components: [buildNpContainer(q, guildId)], flags: MessageFlags.IsComponentsV2 };
  if (options.replaceAttachments) payload.attachments = [];
  return payload;
}

async function refreshNowPlaying(guildId) {
  const q = musicGetQueue(guildId);
  if (!q?.nowPlayingMsg || !q?.current || q.destroyed) return;
  try {
    q.guildColor = q.guildColor ?? getGuildColor(q.textChannel?.client, guildId);
    const payload = await buildNpMessagePayload(q, guildId, { replaceAttachments: true });
    if (typeof throttledMusicEdit === "function") {
      await throttledMusicEdit(q.nowPlayingMsg, payload, { key: `np:${guildId}` });
    } else {
      await q.nowPlayingMsg.edit(payload);
    }
  } catch { /* message may have been deleted */ }
}

function buildLyricsPageContainer(pages, pageIdx, displayTitle, guildId, hasLive) {
  const pageCount = pages.length;
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`music_lyricspage_prev_${guildId}`).setLabel("◀ Prev").setStyle(ButtonStyle.Secondary).setDisabled(pageIdx === 0),
    new ButtonBuilder().setCustomId(`music_lyricspage_next_${guildId}`).setLabel("Next ▶").setStyle(ButtonStyle.Secondary).setDisabled(pageIdx === pageCount - 1),
    ...(hasLive ? [new ButtonBuilder().setCustomId(`music_lyricslive_${guildId}`).setEmoji({ id: "1487769302462501046", name: "sthinking" }).setLabel("Live Mode").setStyle(ButtonStyle.Success)] : []),
  );
  return new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Lyrics`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(displayTitle))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(pages[pageIdx]))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(navRow)
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t => t.setContent(`-# Page ${pageIdx + 1}/${pageCount}`));
}

function buildLiveLyricsContainer(q) {
  const live        = getLiveLines(q);
  const lyricsLines = [];
  if (live?.prev)    lyricsLines.push(`*${live.prev}*`);
  if (live?.current) lyricsLines.push(`**→ ${live.current}**`);
  if (live?.next)    lyricsLines.push(`*${live.next}*`);
  return new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Live Lyrics`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(`*${q.current?.title || ""}*`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(lyricsLines.length ? lyricsLines.join("\n") : "*…*"))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t => t.setContent(`-# Live · synced · updating`));
}

async function refreshLiveLyrics(guildId) {
  const q = musicGetQueue(guildId);
  if (!q?.liveLyricsMsg || !q?.current || !q?.syncedLyrics?.length || q.destroyed) return;
  try {
    const lc = buildLiveLyricsContainer(q);
    if (typeof throttledMusicEdit === "function") {
      await throttledMusicEdit(q.liveLyricsMsg, { components: [lc], flags: MessageFlags.IsComponentsV2 }, { key: `lyrics:${guildId}`, throttleMs: 4000 });
    } else {
      await q.liveLyricsMsg.edit({ components: [lc], flags: MessageFlags.IsComponentsV2 });
    }
  } catch { /* message may have been deleted */ }
}

// ── RESOLVE TRACK ─────────────────────────────────────────────────────────────
// Resolves a track's encoded field via Lavalink if not already present.
// Returns the encoded string on success, throws on failure.
async function resolveTrack(track) {
  if (track.encoded) return track.encoded;
  const searchQuery  = track.searchStr || track.title;
  const searchPrefix = track.source === "soundcloud" ? "scsearch" : "ytsearch";
  let found;
  if (["soundcloud", "youtube"].includes(track.source) && /^https?:\/\//i.test(track.url || "")) {
    // Saved tracks retain their original URL; never replace one with a title match.
    const result = await lavalinkResolve(track.url);
    const exact = result?.tracks?.[0];
    if (exact) found = {
      encoded: exact.encoded,
      duration: Math.floor((exact.info.length || 0) / 1000),
      url: exact.info.uri,
      source: track.source,
      title: exact.info.title,
      _llTrack: exact,
    };
  } else {
    found = await lavalinkSearchOne(searchQuery, searchPrefix);
  }
  if (!found?.encoded) throw new Error(`No results found for "${track.title}" on Lavalink.`);
  // Mutate in-place so callers can read the enriched data
  track.encoded         = found.encoded;
  track.duration        = found.duration;
  track.streamUrl       = found.url;
  track.resolvedSource  = found.source;
  track.resolvedTitle   = found.title;
  track._llTrack        = found._llTrack;
  return found.encoded;
}

// ── SAFE PLAY TRACK ───────────────────────────────────────────────────────────
// Attempts to play a track with up to `maxRetries` attempts.
// Returns true on success, false if all attempts fail.
async function safePlayTrack(q, guildId, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (q.destroyed) return false;

    // Validate encoded — must be a non-empty string
    if (!q.current?.encoded || typeof q.current.encoded !== "string") {
      console.warn(`[MUSIC] safePlayTrack: missing encoded on attempt ${attempt} (guild ${guildId})`);
      if (attempt < maxRetries) {
        // Re-resolve the track and retry
        try { await resolveTrack(q.current); } catch (e) {
          console.error(`[MUSIC] Re-resolve failed:`, e.message);
          return false;
        }
        continue;
      }
      return false;
    }

    try {
      const trackPayload = q.current._llTrack || { encoded: q.current.encoded };
      const recovery = q.recoveryPosition != null
        ? { position: q.recoveryPosition, paused: Boolean(q.recoveryPaused) } : {};
      await q.player.playTrack({ track: trackPayload, ...recovery });
      delete q.recoveryPosition;
      delete q.recoveryPaused;
      try { await q.player.setGlobalVolume(q.volume); } catch { /* non-fatal */ }
      return true;
    } catch (err) {
      console.error(`[MUSIC] playTrack attempt ${attempt} failed (guild ${guildId}):`, err.message);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }
  return false;
}

// ── PLAYER SETUP ──────────────────────────────────────────────────────────────
async function musicJoinAndSetup(guildId, voiceChannel, textChannel) {
  clearMusicAutoLeaveTimer(guildId);
  if (!shoukaku) throw new Error("Lavalink is not initialised — check your node config.");

  // Reuse existing queue if the player's node is healthy
  const existing = musicQueues.get(guildId);
  if (existing?.player && !existing.destroyed) {
    const nodeState = existing.player.node?.state;
    if (nodeState === undefined || nodeState === 1) {
      existing.textChannel = textChannel;
      existing.guildColor = getGuildColor(textChannel?.client || voiceChannel?.client, guildId);
      return existing;
    }
    // Keep the queue intact while the node's resume/reconnect is in progress.
    throw new Error("The audio server is reconnecting. Your queue has been preserved; try again shortly.");
  }

  // Always leave first to clear ghost Shoukaku state
  try { await shoukaku.leaveVoiceChannel(guildId); } catch { /* no existing, ok */ }

  const player = await shoukaku.joinVoiceChannel({
    guildId,
    channelId: voiceChannel.id,
    shardId:   voiceChannel.guild.shardId ?? 0,
    deaf:      true,
  });

  // ── Queue object ──────────────────────────────────────────────────────────
  const guildSettings = voiceChannel.client?._db?.guildSettings?.[guildId] || {};
  const defaultVolume = Math.max(1, Math.min(200, parseInt(guildSettings.defaultVolume) || 80));
  const queueColor = getGuildColor(textChannel?.client || voiceChannel?.client, guildId);
  const q = {
    player,
    tracks:          [],
    current:         null,
    previousTrack:   null,
    loop:            "off",
    volume:          defaultVolume,
    autoplay:        false,
    autoplayHistory: [],
    nowPlayingMsg:   null,
    liveLyricsMsg:   null,
    textChannel,
    guildColor:       queueColor,
    voiceChannelId:  voiceChannel.id,
    idleTimer:       null,
    lyricsTimer:     null,
    syncedLyrics:    undefined,
    filters: {
      nightcore: false, vaporwave: false, slowmo: false, speed: 1.0, pitch: 0,
      vibrato: false, lowpass: false, normalization: false, rotation: false,
      karaoke: false, distortion: false, mono: false,
      soft: false, tv: false, bassboost: false, treble: false, pop: false, rock: false, jazz: false,
      // Extended filters
      bass: false, chimpunk: false, china: false, darthvader: false, daycore: false,
      doubletime: false, earrape: false, electronic: false, lofi: false,
      party: false, treblebass: false, tremolo: false,
    },
    history:        [],
    mostPlayed:     {},
    destroyed:      false,  // ← concurrency safety flag
    sessionOwnerId: null,   // ← user who started this session (set on first play/join)
  };

  musicQueues.set(guildId, q);

  // ── Player event handlers ─────────────────────────────────────────────────
  // Every handler re-fetches the queue from the map and checks the destroyed
  // flag before doing anything — this prevents ghost events after destroy.

  player.on("start", () => {
    const qLive = musicQueues.get(guildId);
    if (!qLive || qLive.destroyed || qLive.player !== player) return;
    console.log(`[MUSIC] Playing: "${qLive.current?.title}" (guild ${guildId})`);
    if (qLive.current) {
      qLive.history.unshift({ ...qLive.current });
      if (qLive.history.length > 20) qLive.history.pop();
      const key = qLive.current.title;
      qLive.mostPlayed[key] = (qLive.mostPlayed[key] || 0) + 1;
    }
  });

  player.on("end", async (data) => {
    const qLive = musicQueues.get(guildId);
    if (!qLive || qLive.destroyed || qLive.player !== player) return;
    if (data?.reason === "replaced") return;   // skip fires before replaced track loads
    if (data?.reason === "loadFailed") return; // exception event handles this
    await musicPlayNext(guildId);
  });

  player.on("exception", data => { void musicHandlePlaybackFailure(guildId, player, data); });

  player.on("stuck", async () => {
    const qLive = musicQueues.get(guildId);
    if (!qLive || qLive.destroyed || qLive.player !== player) return;
    console.warn(`[MUSIC] Track stuck (guild ${guildId}), skipping`);
    await musicPlayNext(guildId);
  });

  player.on("closed", data => musicHandleVoiceClosed(guildId, player, data));

  return q;
}

function musicHandleVoiceClosed(guildId, player, data) {
  const q = musicQueues.get(guildId);
  if (!q || q.destroyed || q.player !== player || q.voiceRecoveryTimer) return;
  console.warn(`[MUSIC] Voice connection closed guild=${guildId} code=${Number(data?.code) || 0}`);
  q.voiceRecoveryTimer = setTimeout(() => {
    q.voiceRecoveryTimer = null;
    if (musicQueues.get(guildId) !== q || q.destroyed || q.player !== player) return;
    getMusicRecovery()?.recoverPlayer?.(q.textChannel?.client, guildId, {
      music: module.exports, expectedQueue: q,
    }).catch(err => console.error(`[MUSIC] Player recovery failed guild=${guildId}:`, redactLavalinkError(err)));
  }, 1500);
  q.voiceRecoveryTimer.unref?.();
}

function musicIsPreviewTrack(track) {
  if (track?.pluginInfo?.isPreview === true || track?.info?.isPreview === true) return true;
  // SoundCloud reports full song length even when the chosen stream is a preview.
  const identifier = String(track?.info?.identifier || "");
  return /\/preview(?:\/|\?|$)/i.test(identifier);
}

function musicPlaybackFailureDetails(data) {
  const message = redactLavalinkError(data?.exception?.message || "Unknown playback error");
  if (data?.exception?.code === "PREVIEW_ONLY") {
    return { code: "PREVIEW_ONLY", description: "Only a short preview is available for this track. Provide a full-length playable link.", summary: "Preview-only stream rejected before playback" };
  }
  const youtube = /yts\.version|youtube|All clients failed/i.test(message);
  const login = /requires login|sign in|sign-in|LOGIN_REQUIRED/i.test(message);
  const code = youtube ? (login ? "YOUTUBE_LOGIN_REQUIRED" : "YOUTUBE_STREAM_UNAVAILABLE") : "TRACK_FAILED";
  const description = youtube
    ? "YouTube did not provide playable audio to this Lavalink server. Skipping this track. Try a SoundCloud link or ask the server owner to check the YouTube source."
    : "The audio source could not play this track. Skipping to the next queued track.";
  const summary = message.split(/\r?\n/)
    .filter(line => line.trim() && !/^\s*(at |Caused by:|Suppressed:)/.test(line))
    .slice(0, 4).join("; ").replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 800);
  return { code, description, summary };
}

async function musicHandlePlaybackFailure(guildId, player, data) {
  const q = musicQueues.get(guildId);
  if (!q || q.destroyed || q.player !== player || !q.current) return;
  const track = q.current;
  if (data?.track?.encoded && track.encoded && data.track.encoded !== track.encoded) return;
  if (q.failedTrack === track) return;
  q.failedTrack = track;
  const details = musicPlaybackFailureDetails(data);

  console.error(`[MUSIC] Playback failed guild=${guildId} code=${details.code}: ${details.summary}`);
  try {
    const title = escapeMarkdown(String(track.title || "this track").replace(/[\r\n]/g, " ").slice(0, 200));
    const sent = q.textChannel?.send({
      components: [createErrorContainer("Playback Error", `Could not play **${title}**.\n> ${details.description}`, q.guildColor ?? guildColor)],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
    sent?.catch(() => {});
  } catch { /* Message permissions must not prevent advancing the queue. */ }
  try {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await musicPlayNext(guildId, { failedTrack: track, player });
  } catch (error) {
    console.error(`[MUSIC] Could not advance after playback failure guild=${guildId}: ${redactLavalinkError(error).slice(0, 300)}`);
  }
}

// ── PLAY NEXT ─────────────────────────────────────────────────────────────────
// Protected by withPlayLock — only one invocation runs at a time per guild.
async function musicPlayNext(guildId, { failedTrack = null, player = null } = {}) {
  return withPlayLock(guildId, async () => {
    const q = musicGetQueue(guildId);
    if (!q || q.destroyed) return;
    // Check after acquiring the lock: a manual skip or reconnect may have won.
    if (failedTrack && (q.current !== failedTrack || q.player !== player)) return;
    const skipFailed = q.current && q.failedTrack === q.current;

    // Clear any residual timers from the previous track
    if (q.idleTimer)   { clearTimeout(q.idleTimer);    q.idleTimer   = null; }
    if (q.lyricsTimer) { clearInterval(q.lyricsTimer); q.lyricsTimer = null; }

    // ── Loop logic ────────────────────────────────────────────────────────────
    if (!skipFailed && q.loop === "track" && q.current) q.tracks.unshift({ ...q.current });
    if (!skipFailed && q.loop === "queue" && q.current) q.tracks.push({ ...q.current });

    // ── Autoplay when queue is empty ──────────────────────────────────────────
    if (q.tracks.length === 0) {
      const seed = q.previousTrack || q.current;
      if (!skipFailed && q.autoplay && seed) {
        try {
          const seedClean  = seed.title.replace(/\(.*?\)|\[.*?\]/g, "").trim();
          const dashIdx    = seedClean.indexOf(" - ");
          const seedArtist = dashIdx !== -1 ? seedClean.slice(0, dashIdx).trim() : "";
          const seedName   = dashIdx !== -1 ? seedClean.slice(dashIdx + 3).trim() : seedClean;

          const queries = seedArtist
            ? [`${seedArtist} songs`, `${seedArtist} music`, `${seedArtist} playlist`]
            : [`${seedName.split(/\s+/).slice(0, 3).join(" ")} music`, `${seedClean.split(/\s+/).slice(0, 3).join(" ")} similar`];

          // Normalise for duplicate detection — strips all non-alphanumeric chars
          const norm     = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
          const normSeed = norm(seed.title);
          if (!q.autoplayHistory) q.autoplayHistory = [];

          let autoTrack = null;
          for (const query of queries) {
            if (q.destroyed) return;
            const candidate = await lavalinkSearchOne(query, "ytsearch");
            if (!candidate) continue;
            const ct = norm(candidate.title);
            // Skip if it's the same as seed or already in the autoplay history
            if (ct === normSeed) continue;
            if (q.autoplayHistory.some(rt => norm(rt) === ct)) continue;
            autoTrack = candidate;
            break;
          }

          if (autoTrack && !q.destroyed) {
            q.autoplayHistory.unshift(autoTrack.title);
            if (q.autoplayHistory.length > 20) q.autoplayHistory.pop();
            autoTrack.requestedBy = "Autoplay";
            q.tracks.push(autoTrack);
            q.textChannel?.send({
              components: [new ContainerBuilder()
                .addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Autoplay`))
                .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(t => t.setContent(`> ${STATUS.tick} Auto-queued: ${trackLink(autoTrack)}\n-# Based on: ${seed.title}`))],
              flags: MessageFlags.IsComponentsV2,
            }).catch(() => {});
          }
        } catch { /* autoplay search failed — fall through to queue-ended */ }
      }

      // ── Queue truly empty — edit the Now Playing message in place ────────────
      if (q.tracks.length === 0) {
        if (q.destroyed) return;
        const prefix = getMusicPrefix(q.textChannel?.client, guildId);
        const endCard = buildHopeYouEnjoyedContainer(q, prefix);
        q.current = null;
        q.failedTrack = null;
        setVcStatus(q, "").catch(() => {});

        // Transform the existing NP message into the "Hope you enjoyed" card.
        // Only fall back to a new message if there is no NP message to edit.
        if (q.nowPlayingMsg) {
          const editEndCard = typeof throttledMusicEdit === "function"
            ? throttledMusicEdit(q.nowPlayingMsg, { components: [endCard], flags: MessageFlags.IsComponentsV2 }, { key: `np:${guildId}`, throttleMs: 1000 })
            : q.nowPlayingMsg.edit({ components: [endCard], flags: MessageFlags.IsComponentsV2 });
          editEndCard.catch(() => {
            q.textChannel?.send({ components: [endCard], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
          });
          q.nowPlayingMsg = null;
        } else {
          q.textChannel?.send({ components: [endCard], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
        if (isTwentyFourSevenEnabled(guildId)) {
          clearMusicAutoLeaveTimer(guildId);
          saveQueue(guildId);
        } else {
          scheduleMusicAutoLeave(q.textChannel?.guild || guildId, "queue ended");
        }
        return;
      }
    }

    if (q.destroyed) return;

    q.previousTrack = q.current ? { ...q.current } : null;
    q.current       = q.tracks.shift();
    q.failedTrack   = null;
    saveQueue(guildId); // persist new current + remaining queue after every track advance

    // ── Resolve encoded string if not already present (Spotify tracks etc.) ──
    if (!q.current.encoded) {
      try {
        await resolveTrack(q.current);
      } catch (err) {
        if (q.destroyed) return;
        // Release the play lock before the delayed advance acquires it again.
        void musicHandlePlaybackFailure(guildId, q.player, { exception: err });
        return;
      }
    }

    if (q.destroyed) return;

    if (musicIsPreviewTrack(q.current._llTrack)) {
      void musicHandlePlaybackFailure(guildId, q.player, { exception: { code: "PREVIEW_ONLY" } });
      return;
    }

    // ── Attempt playback with retry ───────────────────────────────────────────
    const played = await safePlayTrack(q, guildId);
    if (!played) {
      if (q.destroyed) return;
      void musicHandlePlaybackFailure(guildId, q.player, { exception: { message: "Track failed to start after retries" } });
      return;
    }

    if (q.destroyed) return;

    // ── Update VC status ──────────────────────────────────────────────────────
    const vcEmoji = q.current.source === "spotify" ? VC_EMOJI_SPOTIFY : VC_EMOJI_YOUTUBE;
    setVcStatus(q, `${vcEmoji} ${q.current.title}`).catch(() => {});

    // ── Now Playing message ───────────────────────────────────────────────────
    const npPayload = await buildNpMessagePayload(q, guildId);
    if (q.nowPlayingMsg)  { q.nowPlayingMsg.delete().catch(() => {});  q.nowPlayingMsg  = null; }
    if (q.liveLyricsMsg)  { q.liveLyricsMsg.delete().catch(() => {});  q.liveLyricsMsg  = null; }
    pendingLyrics.delete(guildId);
    q.nowPlayingMsg = await q.textChannel?.send(npPayload).catch(() => null);

    // ── Fetch synced lyrics in background ─────────────────────────────────────
    q.syncedLyrics = undefined;
    ;(async () => {
      try {
        const raw         = q.current?.title || "";
        const resolvedRaw = q.current?.resolvedTitle || "";
        const splitDash   = s => { const d = s.indexOf(" - "); return d !== -1 ? [s.slice(0, d).trim(), s.slice(d + 3).trim()] : null; };
        let artist, title;
        const fromTitle    = splitDash(raw);
        const fromResolved = splitDash(resolvedRaw);
        if (fromTitle)         { [artist, title] = fromTitle; }
        else if (fromResolved) { [artist, title] = fromResolved; }
        else if (q.current?.searchStr) {
          const parts = q.current.searchStr.trim().split(/\s+/);
          artist = parts[0]; title = parts.slice(1).join(" ") || parts[0];
        } else { artist = ""; title = raw; }

        const result   = await fetchSyncedLyrics(title, artist);
        const synced   = result?.synced || [];
        // Only write back if the queue is still alive and on the same track
        const qCur     = musicQueues.get(guildId);
        if (!qCur || qCur.destroyed) return;
        qCur.syncedLyrics = synced.length ? synced : null;
      } catch {
        const qCur = musicQueues.get(guildId);
        if (qCur && !qCur.destroyed) qCur.syncedLyrics = null;
      }

      // Start live-lyrics refresh timer using fresh queue lookup — NOT closure
      const qCur = musicQueues.get(guildId);
      if (!qCur || qCur.destroyed) return;
      if (qCur.lyricsTimer) { clearInterval(qCur.lyricsTimer); qCur.lyricsTimer = null; }
      if (qCur.syncedLyrics?.length) {
        qCur.lyricsTimer = setInterval(() => {
          // Always re-fetch from map so we're not holding stale queue refs
          const qLive = musicQueues.get(guildId);
          if (!qLive || qLive.destroyed || !qLive.current) {
            clearInterval(qCur.lyricsTimer);
            qCur.lyricsTimer = null;
            return;
          }
          refreshLiveLyrics(guildId).catch(() => {});
        }, 3000);
      }
    })();
  });
}

// ── Utility helpers ───────────────────────────────────────────────────────────
function parseDuration(str) {
  if (!str) return null;
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  const secs = parseFloat(str);
  return isNaN(secs) ? null : secs * 1000;
}

function hasDjPermission(msg, db) {
  const gs       = db?.guildSettings?.[msg.guild.id] || {};
  const djRoleId = gs.djRole;
  if (!djRoleId) return true;
  if (msg.member?.permissions?.has("ManageGuild")) return true;
  return msg.member?.roles?.cache?.has(djRoleId) ?? false;
}

/**
 * Returns true if the given userId is the session owner (the person who
 * started the music or joined the bot), OR if they have ManageGuild
 * (admins always bypass the restriction).
 */
function isSessionController(userId, member, q) {
  if (!q) return false;
  if (member?.permissions?.has("ManageGuild")) return true;
  if (!q.sessionOwnerId) return true; // no owner set yet — allow anyone
  return q.sessionOwnerId === userId;
}

function isChannelLocked(msg, db) {
  const gs = db?.guildSettings?.[msg.guild.id] || {};
  if (!gs.musicChannel) return false;
  return msg.channel.id !== gs.musicChannel;
}

// ── Queue persistence helpers ─────────────────────────────────────────────────
// Saves the current queue state to the database so it survives bot restarts.
function persistQueueState(guildId, q, db) {
  if (!db) return;
  if (!db.musicQueueStates) db.musicQueueStates = {};
  const fs = require("fs");
  if (!q || q.destroyed || (!q.current && !q.tracks.length)) {
    if (db.musicQueueStates[guildId]) {
      delete db.musicQueueStates[guildId];
      if (typeof cacheMusicState === "function") cacheMusicState(guildId, null);
      if (typeof saveDB === "function") saveDB();
      else try { require("../../utils/redisDatabase").requestSave(); } catch { /* silent */ }
    }
    return;
  }
  const sanitise = t => t ? { title: t.title, url: t.url, duration: t.duration, source: t.source, searchStr: t.searchStr, requestedBy: t.requestedBy } : null;
  db.musicQueueStates[guildId] = {
    current:        sanitise(q.current),
    tracks:         q.tracks.map(sanitise).filter(Boolean),
    loop:           q.loop,
    volume:         q.volume,
    autoplay:       q.autoplay,
    voiceChannelId: q.voiceChannelId,
    textChannelId:  q.textChannel?.id,
    sessionOwnerId: q.sessionOwnerId,
    savedAt:        Date.now(),
  };
  if (typeof cacheMusicState === "function") cacheMusicState(guildId, db.musicQueueStates[guildId]);
  if (typeof saveDB === "function") saveDB();
  else try { require("../../utils/redisDatabase").requestSave(); } catch { /* silent */ }
}

// Convenience wrapper — called from player events and command handlers.
// Reads db from the queue's textChannel client so callers don't need to pass it.
function saveQueue(guildId) {
  const q  = musicQueues.get(guildId);
  if (!q || q.destroyed) return;
  const db = q.textChannel?.client?._db;
  persistQueueState(guildId, q, db);
}

// Attempts to restore queues saved before a restart.
// Call this from your bot's `ready` event AFTER initShoukaku() and after
// Shoukaku has at least one node connected, or pass a delay via the 2nd arg.
async function restoreQueueStates(client, delayMs = 3000) {
  // Give Lavalink nodes time to connect before we try to play
  await new Promise(r => setTimeout(r, delayMs));
  const db     = client._db || {};
  const states = db.musicQueueStates || {};
  for (const [guildId, state] of Object.entries(states)) {
    // Skip stale saves older than 3 hours
    if (state.savedAt && Date.now() - state.savedAt > 3 * 60 * 60 * 1000) {
      delete db.musicQueueStates[guildId]; continue;
    }
    try {
      const guild   = client.guilds.cache.get(guildId);
      if (!guild) { delete db.musicQueueStates[guildId]; continue; }
      const voiceCh = guild.channels.cache.get(state.voiceChannelId);
      const textCh  = guild.channels.cache.get(state.textChannelId);
      if (!voiceCh || !textCh) { delete db.musicQueueStates[guildId]; continue; }

      // Rebuild track list: current first, then the rest
      const allTracks = [];
      if (state.current) allTracks.push(state.current);
      allTracks.push(...(state.tracks || []));
      if (!allTracks.length) { delete db.musicQueueStates[guildId]; continue; }

      const q = await musicJoinAndSetup(guildId, voiceCh, textCh);
      q.loop           = state.loop     || "off";
      q.volume         = state.volume   || 80;
      q.autoplay       = state.autoplay || false;
      q.sessionOwnerId = state.sessionOwnerId || null;
      q.tracks.push(...allTracks);

      delete db.musicQueueStates[guildId];
      await musicPlayNext(guildId);
      textCh.send({
        components: [createSuccessContainer("Queue Restored", `Resumed **${allTracks.length}** track(s) after restart.\n-# Use \`${getMusicPrefix(client, guildId)}leave\` to stop · session owner: ${state.sessionOwnerId ? `<@${state.sessionOwnerId}>` : "anyone"}`)],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    } catch (err) {
      console.error(`[MUSIC] Failed to restore queue for guild ${guildId}:`, err.message);
      delete db.musicQueueStates[guildId];
    }
  }
  try { const fs = require("fs"); require("../../utils/redisDatabase").requestSave(); } catch { /* silent */ }
}

function listActiveFilters(f) {
  const on = [];
  if (f.nightcore)     on.push("Nightcore");
  if (f.vaporwave)     on.push("Vaporwave");
  if (f.slowmo)        on.push("Slow Mo");
  if (f.speed !== 1.0) on.push(`Speed ${f.speed}x`);
  if (f.pitch !== 0)   on.push(`Pitch ${f.pitch > 0 ? "+" : ""}${f.pitch}st`);
  if (f.vibrato)       on.push("Vibrato");
  if (f.lowpass)       on.push("Low Pass");
  if (f.normalization) on.push("Normalization");
  if (f.rotation)      on.push("8D Audio");
  if (f.karaoke)       on.push("Karaoke");
  if (f.distortion)    on.push("Distortion");
  if (f.mono)          on.push("Mono");
  if (f.soft)          on.push("Soft EQ");
  if (f.tv)            on.push("TV EQ");
  if (f.bassboost)     on.push("Bass Boost");
  if (f.treble)        on.push("Treble");
  if (f.pop)           on.push("Pop EQ");
  if (f.rock)          on.push("Rock EQ");
  if (f.jazz)          on.push("Jazz EQ");
  if (f.bass)          on.push("Bass");
  if (f.chimpunk)      on.push("Chipmunk");
  if (f.china)         on.push("China");
  if (f.darthvader)    on.push("Darth Vader");
  if (f.daycore)       on.push("Daycore");
  if (f.doubletime)    on.push("Double Time");
  if (f.earrape)       on.push("Earrape");
  if (f.electronic)    on.push("Electronic");
  if (f.lofi)          on.push("Lofi");
  if (f.party)         on.push("Party");
  if (f.treblebass)    on.push("Treblebass");
  if (f.tremolo)       on.push("Tremolo");
  return on;
}

// ── Filter builder ────────────────────────────────────────────────────────────
async function applyFilters(q) {
  if (q.destroyed) return;
  const f       = q.filters;
  const payload = {};
  const pitchFactor = f.pitch !== 0 ? Math.pow(2, f.pitch / 12) : 1.0;
  if (f.nightcore)             payload.timescale = { speed: 1.2,  pitch: 1.3  * pitchFactor, rate: 1.0 };
  else if (f.vaporwave)        payload.timescale = { speed: 0.75, pitch: 0.85 * pitchFactor, rate: 1.0 };
  else if (f.slowmo)           payload.timescale = { speed: 0.7,  pitch: 1.0  * pitchFactor, rate: 0.8 };
  else if (f.speed !== 1.0 || f.pitch !== 0) payload.timescale = { speed: f.speed, pitch: pitchFactor, rate: 1.0 };
  if (f.vibrato)     payload.vibrato    = { frequency: 4.0, depth: 0.75 };
  if (f.lowpass)     payload.lowPass    = { smoothing: 20.0 };
  if (f.rotation)    payload.rotation   = { rotationHz: 0.2 };
  if (f.karaoke)     payload.karaoke    = { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 };
  if (f.distortion)  payload.distortion = { sinOffset: 0, sinScale: 1, cosOffset: 0, cosScale: 1, tanOffset: 0, tanScale: 1, offset: 0.2, scale: 1.2 };
  if (f.mono)        payload.channelMix = { leftToLeft: 0.5, leftToRight: 0.5, rightToLeft: 0.5, rightToRight: 0.5 };
  if (f.soft)        payload.equalizer  = [{band:0,gain:-0.10},{band:1,gain:-0.10},{band:2,gain:-0.08},{band:3,gain:-0.04},{band:4,gain:0.00},{band:5,gain:0.04},{band:6,gain:0.04},{band:7,gain:0.00},{band:8,gain:-0.04},{band:9,gain:-0.08},{band:10,gain:-0.10},{band:11,gain:-0.12},{band:12,gain:-0.14},{band:13,gain:-0.14},{band:14,gain:-0.14}];
  else if (f.tv)        payload.equalizer = [{band:0,gain:0.00},{band:1,gain:0.00},{band:2,gain:0.00},{band:3,gain:0.00},{band:4,gain:0.00},{band:5,gain:0.10},{band:6,gain:0.10},{band:7,gain:0.10},{band:8,gain:0.10},{band:9,gain:0.10},{band:10,gain:0.10},{band:11,gain:0.10},{band:12,gain:0.00},{band:13,gain:0.00},{band:14,gain:0.00}];
  else if (f.bassboost) payload.equalizer = [{band:0,gain:0.20},{band:1,gain:0.18},{band:2,gain:0.14},{band:3,gain:0.10},{band:4,gain:0.06},{band:5,gain:0.00},{band:6,gain:0.00},{band:7,gain:0.00},{band:8,gain:0.00},{band:9,gain:0.00},{band:10,gain:0.00},{band:11,gain:0.00},{band:12,gain:0.00},{band:13,gain:0.00},{band:14,gain:0.00}];
  else if (f.treble)    payload.equalizer = [{band:0,gain:0.00},{band:1,gain:0.00},{band:2,gain:0.00},{band:3,gain:0.00},{band:4,gain:0.00},{band:5,gain:0.00},{band:6,gain:0.04},{band:7,gain:0.08},{band:8,gain:0.12},{band:9,gain:0.14},{band:10,gain:0.16},{band:11,gain:0.18},{band:12,gain:0.20},{band:13,gain:0.20},{band:14,gain:0.20}];
  else if (f.pop)       payload.equalizer = [{band:0,gain:-0.02},{band:1,gain:0.04},{band:2,gain:0.08},{band:3,gain:0.10},{band:4,gain:0.10},{band:5,gain:0.06},{band:6,gain:0.02},{band:7,gain:-0.02},{band:8,gain:-0.04},{band:9,gain:-0.04},{band:10,gain:-0.02},{band:11,gain:0.00},{band:12,gain:0.00},{band:13,gain:0.00},{band:14,gain:0.00}];
  else if (f.rock)      payload.equalizer = [{band:0,gain:0.16},{band:1,gain:0.12},{band:2,gain:0.04},{band:3,gain:-0.06},{band:4,gain:-0.08},{band:5,gain:-0.04},{band:6,gain:0.00},{band:7,gain:0.04},{band:8,gain:0.10},{band:9,gain:0.14},{band:10,gain:0.16},{band:11,gain:0.14},{band:12,gain:0.10},{band:13,gain:0.06},{band:14,gain:0.02}];
  else if (f.jazz)      payload.equalizer = [{band:0,gain:0.10},{band:1,gain:0.14},{band:2,gain:0.10},{band:3,gain:0.06},{band:4,gain:0.02},{band:5,gain:-0.02},{band:6,gain:-0.04},{band:7,gain:-0.02},{band:8,gain:0.02},{band:9,gain:0.04},{band:10,gain:0.06},{band:11,gain:0.04},{band:12,gain:0.00},{band:13,gain:-0.02},{band:14,gain:-0.04}];
  if (f.normalization) payload.volume = 0.85;
  // Extended filters
  if (!payload.timescale) {
    if (f.chimpunk)    payload.timescale = { speed: 1.5, pitch: 1.6, rate: 1.0 };
    else if (f.darthvader) payload.timescale = { speed: 0.85, pitch: 0.6, rate: 1.0 };
    else if (f.daycore)    payload.timescale = { speed: 0.8, pitch: 0.85, rate: 1.0 };
    else if (f.doubletime) payload.timescale = { speed: 2.0, pitch: 1.0, rate: 1.0 };
    else if (f.lofi)       payload.timescale = { speed: 0.92, pitch: 0.95, rate: 1.0 };
    else if (f.party)      payload.timescale = { speed: 1.1, pitch: 1.05, rate: 1.0 };
  }
  if (f.earrape)     payload.volume = 5.0;
  if (f.tremolo)     payload.tremolo = { frequency: 4.0, depth: 0.75 };
  if (!payload.equalizer) {
    if (f.bass)       payload.equalizer = [{band:0,gain:0.30},{band:1,gain:0.25},{band:2,gain:0.20},{band:3,gain:0.15},{band:4,gain:0.05},{band:5,gain:0.00},{band:6,gain:0.00},{band:7,gain:0.00},{band:8,gain:0.00},{band:9,gain:0.00},{band:10,gain:0.00},{band:11,gain:0.00},{band:12,gain:0.00},{band:13,gain:0.00},{band:14,gain:0.00}];
    else if (f.china) payload.equalizer = [{band:0,gain:0.00},{band:1,gain:0.00},{band:2,gain:0.00},{band:3,gain:0.04},{band:4,gain:0.08},{band:5,gain:0.12},{band:6,gain:0.14},{band:7,gain:0.14},{band:8,gain:0.14},{band:9,gain:0.12},{band:10,gain:0.08},{band:11,gain:0.04},{band:12,gain:0.00},{band:13,gain:0.00},{band:14,gain:0.00}];
    else if (f.electronic) payload.equalizer = [{band:0,gain:0.12},{band:1,gain:0.10},{band:2,gain:0.04},{band:3,gain:-0.04},{band:4,gain:-0.06},{band:5,gain:-0.02},{band:6,gain:0.02},{band:7,gain:0.06},{band:8,gain:0.10},{band:9,gain:0.12},{band:10,gain:0.14},{band:11,gain:0.12},{band:12,gain:0.08},{band:13,gain:0.04},{band:14,gain:0.00}];
    else if (f.lofi)  payload.equalizer = [{band:0,gain:0.06},{band:1,gain:0.10},{band:2,gain:0.08},{band:3,gain:0.04},{band:4,gain:0.00},{band:5,gain:-0.04},{band:6,gain:-0.08},{band:7,gain:-0.10},{band:8,gain:-0.10},{band:9,gain:-0.08},{band:10,gain:-0.06},{band:11,gain:-0.04},{band:12,gain:-0.02},{band:13,gain:0.00},{band:14,gain:0.00}];
    else if (f.treblebass) payload.equalizer = [{band:0,gain:0.20},{band:1,gain:0.18},{band:2,gain:0.08},{band:3,gain:0.00},{band:4,gain:0.00},{band:5,gain:0.00},{band:6,gain:0.04},{band:7,gain:0.08},{band:8,gain:0.12},{band:9,gain:0.14},{band:10,gain:0.16},{band:11,gain:0.18},{band:12,gain:0.20},{band:13,gain:0.20},{band:14,gain:0.20}];
    else if (f.party) payload.equalizer = [{band:0,gain:0.12},{band:1,gain:0.14},{band:2,gain:0.10},{band:3,gain:0.06},{band:4,gain:0.02},{band:5,gain:0.06},{band:6,gain:0.10},{band:7,gain:0.12},{band:8,gain:0.10},{band:9,gain:0.06},{band:10,gain:0.04},{band:11,gain:0.02},{band:12,gain:0.00},{band:13,gain:0.00},{band:14,gain:0.00}];
  }
  await q.player.setFilters(payload).catch(() => {});
}

// ═════════════════════════════════════════════════════════════════════════════
//  COMMAND HANDLER
// ═════════════════════════════════════════════════════════════════════════════
const MUSIC_COMMAND_KEYWORDS = new Set([
  "music","247","24/7","twentyfourseven",
  "join","j","play","p","py","ps","playnext","pn","skip","s","next","pause","resume","unpause","stop","leave","disconnect","dc","replay",
  "np","nowplaying","queue","q","upcoming","history","trackinfo","search","thumbnail","stats","mostplayed","ping","lyrics",
  "shuffle","sh","remove","rm","move","jump","skipto","clear",
  "volume","vol","loop","repeat","autoplay","ap","seek","rewind","forward","movebot",
  "playlist","pl",
  "nightcore","vaporwave","slowmo","bassboost","treble","pop","rock","jazz","8d","karaoke","vibrato","lowpass","distortion","mono",
  "normalization","soft","tv","speed","pitch","resetfilters","filters",
  "bass","chimpunk","china","clearfilter","darthvader","daycore","doubletime","earrape","electronic","equalizer","lofi","party","ratemusic","slow",
  "treblebass","tremolo",
  "like","showliked","playliked","clearliked",
  "pl-add","pl-addnowplaying","pl-addqueue","pl-create","pl-delete","pl-dupes","pl-info","pl-list","pl-load","pl-remove",
  "voteskip","skipratio","djrole","lockchannel","restrict","access",
  "node",
]);

const PREFIX_DISABLED_MUSIC_FILTERS = new Set([
  "nightcore", "vaporwave", "slowmo", "bassboost", "treble", "pop", "rock", "jazz", "8d", "karaoke",
  "vibrato", "lowpass", "distortion", "mono", "normalization", "soft", "tv", "speed", "pitch",
  "resetfilters", "filters", "bass", "chimpunk", "china", "clearfilter", "darthvader", "daycore",
  "doubletime", "earrape", "electronic", "equalizer", "lofi", "party", "ratemusic", "slow", "treblebass", "tremolo"
]);

function isMusicPrefixCommandKeyword(command) {
  return isMusicCommandKeyword(command) && !PREFIX_DISABLED_MUSIC_FILTERS.has(String(command || "").toLowerCase());
}

function isMusicCommandKeyword(command) {
  if (require("../../utils/retiredCommands").isRetiredCommand(command)) return false;
  return MUSIC_COMMAND_KEYWORDS.has(String(command || "").toLowerCase());
}

function parseMusicMessageCommand(content) {
  const text = String(content || "").trim();
  if (!text) return null;
  const parts = text.split(/\s+/);
  const command = (parts.shift() || "").toLowerCase();
  if (!isMusicPrefixCommandKeyword(command)) return null;
  return { command, args: parts };
}

const NO_PREFIX_MUSIC_ALIASES = new Map([
  ["play", "play"], ["p", "play"],
  ["skip", "skip"], ["s", "skip"], ["next", "skip"],
  ["stop", "stop"],
  ["pause", "pause"],
  ["resume", "resume"], ["unpause", "resume"],
  ["queue", "queue"], ["q", "queue"],
  ["np", "np"], ["nowplaying", "np"],
  ["leave", "leave"], ["disconnect", "leave"], ["dc", "leave"],
]);

const NO_PREFIX_MUSIC_SENTENCE_WORDS = new Set([
  "me", "it", "this", "that", "these", "those", "the", "a", "an",
  "my", "your", "our", "their", "is", "are", "was", "were", "to",
  "for", "with", "please", "pls",
]);

function parseNoPrefixMusicMessageCommand(content, options = {}) {
  const text = String(content || "").trim();
  if (!text) return null;
  const parts = text.split(/\s+/).filter(Boolean);
  const raw = String(parts.shift() || "").toLowerCase();
  if (!NO_PREFIX_MUSIC_ALIASES.has(raw)) return null;
  const command = NO_PREFIX_MUSIC_ALIASES.get(raw);

  if (["skip", "stop", "pause", "resume", "queue", "np", "leave"].includes(command) && parts.length > 0) return null;
  if (command === "play") {
    if (parts.length === 0) return null;
    if (parts.some(word => NO_PREFIX_MUSIC_SENTENCE_WORDS.has(String(word).toLowerCase()))) return null;
  }

  if (typeof options.isSameVoice === "function" && !options.isSameVoice()) return { blocked: true };
  return { command, args: parts };
}

async function handleMusicCommand(cmd, args, msg, PREFIX, config) {
  if (!msg._isSlashCommand && PREFIX_DISABLED_MUSIC_FILTERS.has(String(cmd || "").toLowerCase())) return false;
  const musicCmds = new Set([
    // ── Core playback ──────────────────────────────────────────────────────
    "music","247","24/7","twentyfourseven",
    "join","j",                        // join voice channel
    "play","p",                        // play
    "py",                              // play youtube
    "ps",                              // play spotify
    "playnext","pn",                   // play next
    "skip","s","next",                 // skip
    "pause",                           // pause
    "resume","unpause",                // resume
    "stop",                            // stop and disconnect
    "leave","disconnect","dc",         // leave / disconnect
    "replay",                          // replay
    // ── Info ──────────────────────────────────────────────────────────────
    "np","nowplaying",                 // now playing
    "queue","q",                       // queue
    "upcoming",                        // upcoming
    "history",                         // history
    "trackinfo",                       // track info
    "search",                          // search picker
    "thumbnail",                       // thumbnail
    "stats",                           // bot stats
    "mostplayed",                      // most played
    "ping",                            // latency
    "lyrics",                          // lyrics
    // ── Queue management ──────────────────────────────────────────────────
    "shuffle","sh",                    // shuffle
    "remove","rm",                     // remove
    "move",                            // move
    "jump","skipto",                   // jump / skipto
    "clear",                           // clear queue
    // ── Controls ──────────────────────────────────────────────────────────
    "volume","vol",                    // volume
    "loop","repeat",                   // loop
    "autoplay","ap",                   // autoplay
    "seek",                            // seek
    "rewind",                          // rewind
    "forward",                         // forward
    "movebot",                         // move bot
    // ── Playlist ──────────────────────────────────────────────────────────
    "playlist","pl",                   // playlist
    // ── Filters ───────────────────────────────────────────────────────────
    "nightcore","vaporwave","slowmo",
    "bassboost","treble","pop","rock","jazz",
    "8d","karaoke","vibrato","lowpass","distortion","mono",
    "normalization","soft","tv",
    "speed","pitch",
    "resetfilters","filters",
    // Extended filters
    "bass","chimpunk","china","clearfilter","darthvader","daycore",
    "doubletime","earrape","electronic","equalizer","lofi","party","ratemusic","slow",
    "treblebass","tremolo",
    // ── Liked songs ───────────────────────────────────────────────────────────
    "like","showliked","playliked","clearliked",
    // ── pl-* shorthands ───────────────────────────────────────────────────────
    "pl-add","pl-addnowplaying","pl-addqueue","pl-create","pl-delete",
    "pl-dupes","pl-info","pl-list","pl-load","pl-remove",
    // ── DJ / Moderation ───────────────────────────────────────────────────
    "voteskip","skipratio",
    "djrole","lockchannel","restrict",
    "access",                           // session owner info
  ]);
  if (!isMusicCommandKeyword(cmd)) return false;

  const guildId   = msg.guild.id;
  const db        = msg.client._db || {};
  const guildColor = getGuildColor(msg.client, guildId);
  const input     = args.join(" ").trim();

  if (cmd === "node") {
    return getMusicRecovery()?.execute?.("node", {
      msg,
      args,
      client: msg.client,
      guildId,
      userId: msg.author.id,
      isNoPrefix: Boolean(msg.__soezyNoPrefixMusicCommand),
    }) || true;
  }

  // ── Music enabled guard (skip for "music" settings cmd itself) ────────────
  if (cmd !== "music") {
    const gd = db?.guilds?.[guildId] || {};
    if (gd.music?.enabled === false) {
      await msg.reply({ components: [createErrorContainer("Music Disabled", "Music is currently disabled on this server.\n-# An admin can re-enable it with `music enable`.", guildColor)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      return true;
    }
  }

  if (isChannelLocked(msg, db)) {
    const lockedTo = db?.guildSettings?.[guildId]?.musicChannel;
    await msg.reply({ components: [createErrorContainer("Wrong Channel", `Music commands are locked to <#${lockedTo}>.\n-# Use commands there instead.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
    return true;
  }

  const infoOnlyCmds = new Set(["np","queue","upcoming","history","trackinfo","filters","stats","mostplayed","ping","search","lyrics"]);
  if (!infoOnlyCmds.has(cmd) && !hasDjPermission(msg, db)) {
    const djRoleId = db?.guildSettings?.[guildId]?.djRole;
    await msg.reply({ components: [createErrorContainer("DJ Only", `You need the <@&${djRoleId}> role to use music commands.\n-# Ask a server admin to update permissions.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
    return true;
  }

  const restricted = db?.guildSettings?.[guildId]?.restricted || [];
  if (restricted.includes(cmd)) {
    await msg.reply({ components: [createErrorContainer("Command Disabled", `\`${PREFIX}${cmd}\` has been disabled on this server.\n-# Ask a server admin if this is a mistake.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
    return true;
  }

  const voiceCh = msg.member?.voice?.channel;
  const access = cmd === "music" ? { ok: true } : validateMusicAccess({
    member: msg.member,
    guild: msg.guild,
    queue: musicGetQueue(guildId),
    command: cmd,
  });
  if (!access.ok) {
    if (msg.__soezyNoPrefixMusicCommand) return true;
    await msg.reply({
      components: [createErrorContainer(
        access.code === "DIFFERENT_VOICE" ? "Wrong Voice Channel" : "Voice Required",
        access.message,
        guildColor
      )],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => {});
    return true;
  }

  // ── Session-controller guard ────────────────────────────────────────────────
  // Commands that mutate playback state are restricted to the session owner
  // (or anyone with ManageGuild). Read-only and play/queue-add commands are
  // intentionally excluded so anyone in the VC can still add songs.
  const SESSION_CONTROLLED = new Set([
    "skip","s","next",
    "pause","resume","unpause","stop","replay",
    "seek","rewind","forward",
    "shuffle","sh","remove","rm","move","jump","skipto","clear",
    "volume","vol","loop","repeat","autoplay","ap",
    "movebot",
    "nightcore","vaporwave","slowmo","vibrato","lowpass",
    "normalization","soft","tv","bassboost","treble","pop","rock","jazz",
    "8d","karaoke","distortion","mono","speed","pitch","resetfilters",
  ]);
  if (SESSION_CONTROLLED.has(cmd)) {
    const _qSC = musicGetQueue(guildId);
    if (_qSC && !isSessionController(msg.author.id, msg.member, _qSC)) {
      await msg.reply({
        components: [createErrorContainer(
          "Session Restricted",
          `Only the session owner (<@${_qSC.sessionOwnerId}>) or a server admin can use this command.\n` +
          `-# Use \`${PREFIX}access\` to see session info or transfer ownership.`
        )],
        flags: MessageFlags.IsComponentsV2,
      });
      return true;
    }
  }

  switch (cmd) {

    // ── MUSIC (settings) ─────────────────────────────────────────────────────
    case "247":
    case "24/7":
    case "twentyfourseven": {
      const requested = String(args[0] || "").toLowerCase();
      const current = isTwentyFourSevenEnabled(guildId);
      const next = ["on", "enable", "enabled", "true", "yes"].includes(requested)
        ? true
        : ["off", "disable", "disabled", "false", "no"].includes(requested)
          ? false
          : !current;
      setTwentyFourSevenMode(guildId, next);
      if (next) {
        clearMusicAutoLeaveTimer(guildId);
        if (!musicGetQueue(guildId) && voiceCh) {
          const joined = await musicJoinAndSetup(guildId, voiceCh, msg.channel).catch(() => null);
          if (joined && !joined.sessionOwnerId) joined.sessionOwnerId = msg.author.id;
        }
      } else {
        scheduleMusicAutoLeave(msg.guild, "24/7 disabled");
      }
      await msg.reply({
        components: [createSuccessContainer(
          `24/7 Mode ${next ? "Enabled" : "Disabled"}`,
          next
            ? "The bot will stay in voice through empty-channel and queue-end checks."
            : "Normal auto-leave behavior has been restored.",
          guildColor
        )],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
      return true;
    }

    case "music": {
      const sub = args[0]?.toLowerCase();
      const _db2 = msg.client._db || {};
      if (!_db2.guildSettings) _db2.guildSettings = {};
      if (!_db2.guildSettings[guildId]) _db2.guildSettings[guildId] = {};
      const _gs2 = _db2.guildSettings[guildId];
      const _gd2 = _db2?.guilds?.[guildId] || {};
      const needsManage = () => {
        if (!msg.member?.permissions?.has("ManageGuild")) {
          msg.reply({ components: [createErrorContainer("No Permission", "You need **Manage Server** to change music settings.", guildColor)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
          return true;
        }
        return false;
      };
      const saveAllDB = () => { try { const fs = require("fs"); require("../../utils/redisDatabase").requestSave(); } catch {} };

      if (sub === "enable" || sub === "disable") {
        if (needsManage()) return true;
        if (!_gd2.music) _gd2.music = { enabled: true };
        _gd2.music.enabled = sub === "enable";
        saveAllDB();
        await msg.reply({ components: [createSuccessContainer(sub === "enable" ? "Music Enabled" : "Music Disabled", sub === "enable" ? `Music is now **enabled**.` : `Music is now **disabled**.`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        return true;
      }
      if (sub === "djrole") {
        if (needsManage()) return true;
        const djArg = args[1]?.toLowerCase();
        if (!djArg || djArg === "remove" || djArg === "clear" || djArg === "none") {
          delete _gs2.djRole; saveAllDB();
          await msg.reply({ components: [createSuccessContainer("DJ Role Cleared", `Anyone can now control music.`, guildColor)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
          return true;
        }
        const role = msg.mentions.roles.first() || msg.guild.roles.cache.get(args[1]);
        if (!role) { await msg.reply({ components: [createErrorContainer("Role Not Found", `Mention a role or provide its ID.`, guildColor)], flags: MessageFlags.IsComponentsV2 }).catch(() => {}); return true; }
        _gs2.djRole = role.id; saveAllDB();
        await msg.reply({ components: [createSuccessContainer("DJ Role Set", `Music commands now require **${role.name}**.`, guildColor)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        return true;
      }
      if (sub === "defaultvol" || sub === "defaultvolume") {
        if (needsManage()) return true;
        const vol = parseInt(args[1]);
        if (isNaN(vol) || vol < 1 || vol > 200) { await msg.reply({ components: [createErrorContainer("Invalid Volume", `Provide a number between **1** and **200**.`, guildColor)], flags: MessageFlags.IsComponentsV2 }).catch(() => {}); return true; }
        _gs2.defaultVolume = vol; saveAllDB();
        await msg.reply({ components: [createSuccessContainer("Default Volume Set", `New sessions will start at **${vol}%** volume.`, guildColor)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        return true;
      }
      if (sub === "settings" || sub === "status" || sub === "config") {
        const isEnabled  = _gd2.music?.enabled !== false;
        const djRoleStr  = _gs2.djRole ? `<@&${_gs2.djRole}>` : "`anyone`";
        const defVol     = _gs2.defaultVolume ?? 100;
        const lockedCh   = _gs2.musicChannel ? `<#${_gs2.musicChannel}>` : "`all channels`";
        const restrictedStr = (_gs2.restricted || []).map(c => `\`${PREFIX}${c}\``).join(", ") || "*none*";
        const tfSeven = isTwentyFourSevenEnabled(guildId) ? "`ON`" : "`OFF`";
        const panel = new ContainerBuilder()
          .addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Music Settings`))
          .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
          .addTextDisplayComponents(t => t.setContent(
            `${STATUS.arrow} **Status:** ${isEnabled ? `${STATUS.arrow} Enabled` : `${STATUS.cross} Disabled`}\n${STATUS.arrow} **24/7 Mode:** ${tfSeven}\n${STATUS.arrow} **DJ Role:** ${djRoleStr}\n${STATUS.arrow} **Default Volume:** \`${defVol}%\`\n${STATUS.arrow} **Music Channel:** ${lockedCh}\n${STATUS.arrow} **Restricted Commands:** ${restrictedStr}`
          ))
          .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
          .addTextDisplayComponents(t => t.setContent(
            `**Config commands:**\n` +
            `${STATUS.arrow} \`${PREFIX}music enable / disable\`\n` +
            `${STATUS.arrow} \`${PREFIX}music djrole <@role | remove>\`\n` +
            `${STATUS.arrow} \`${PREFIX}music defaultvol <1-200>\`\n` +
            `${STATUS.arrow} \`${PREFIX}247 [on|off]\` â€” keep the bot in voice\n` +
            `${STATUS.arrow} \`${PREFIX}lockchannel\` — restrict to current channel\n` +
            `${STATUS.arrow} \`${PREFIX}restrict <cmd>\` — toggle a command on/off`
          ))
          .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(t => t.setContent(`-# Requested by ${msg.author.username} • <t:${Math.floor(Date.now() / 1000)}:t>`));
        await msg.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        return true;
      }

      // ── Help ────────────────────────────────────────────────────────────────
      const ARROW = STATUS.arrow;
      const helpPanel = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Music Commands`))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(t => t.setContent(
          `**▸ Playback**\n${ARROW} \`${PREFIX}play <song/url>\` — Play or queue a track\n${ARROW} \`${PREFIX}py <song/YT url>\` — Force YouTube\n${ARROW} \`${PREFIX}ps <song/Spotify url>\` — Force Spotify\n${ARROW} \`${PREFIX}playnext <song>\` — Insert track to play next\n${ARROW} \`${PREFIX}join\` — Join your voice channel · \`${PREFIX}leave\` — Disconnect\n${ARROW} \`${PREFIX}pause\` — Pause · \`${PREFIX}resume\` — Resume\n${ARROW} \`${PREFIX}skip\` — Skip · \`${PREFIX}stop\` — Stop · \`${PREFIX}replay\` — Restart\n${ARROW} \`${PREFIX}seek <time>\` — Jump to timestamp · \`${PREFIX}rewind / forward <secs>\``
        ))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(t => t.setContent(
          `**▸ Queue**\n${ARROW} \`${PREFIX}np\` — Now playing · \`${PREFIX}queue [page]\` — Full queue\n${ARROW} \`${PREFIX}upcoming\` — Next 5 · \`${PREFIX}history\` — Recently played\n${ARROW} \`${PREFIX}remove <#>\` — Remove · \`${PREFIX}move <from> <to>\` — Reorder tracks\n${ARROW} \`${PREFIX}move\` (no numbers) — Move bot to your VC · \`${PREFIX}join\` — Join VC\n${ARROW} \`${PREFIX}jump / skipto <#>\` — Jump to position\n${ARROW} \`${PREFIX}shuffle\` — Shuffle · \`${PREFIX}clear\` — Clear queue\n${ARROW} \`${PREFIX}loop [off/track/queue]\` — Loop mode\n${ARROW} \`${PREFIX}volume [1-200]\` — Set volume · \`${PREFIX}autoplay\` — Toggle autoplay`
        ))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(t => t.setContent(
          "Audio filters are available through slash commands."
        ))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(t => t.setContent(
          `**▸ Playlists**\n` +
          `${ARROW} \`${PREFIX}playlist create <name>\` *(alias: pl create)*\n` +
          `${ARROW} \`${PREFIX}playlist play <name>\` — Load entire playlist *(alias: pl play)*\n` +
          `${ARROW} \`${PREFIX}playlist add <name> <song>\` *(alias: pl add)*\n` +
          `${ARROW} \`${PREFIX}playlist addcurrent <name>\` — Add now playing *(alias: pl ac)*\n` +
          `${ARROW} \`${PREFIX}playlist removetrack <name> <#>\` *(alias: pl rt)*\n` +
          `${ARROW} \`${PREFIX}playlist list\` · \`${PREFIX}playlist view <name>\`\n` +
          `${ARROW} \`${PREFIX}playlist rename <name> <new>\` · \`${PREFIX}playlist clear <name>\`\n` +
          `${ARROW} \`${PREFIX}playlist delete <name>\``
        ))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(t => t.setContent(
          `**▸ Info & Lyrics**\n${ARROW} \`${PREFIX}lyrics [song]\` — Lyrics · \`${PREFIX}trackinfo\` — Track details\n${ARROW} \`${PREFIX}search <query>\` — Search picker · \`${PREFIX}thumbnail\` — Track art\n${ARROW} \`${PREFIX}stats\` — Bot stats · \`${PREFIX}ping\` — Latency · \`${PREFIX}mostplayed\`\n\n**▸ DJ & Moderation**\n${ARROW} \`${PREFIX}djrole <@role>\` — Restrict music to a role\n${ARROW} \`${PREFIX}join\` — Bot joins your VC · \`${PREFIX}move\` — Move bot to your VC\n${ARROW} \`${PREFIX}movebot\` — Alias for move bot (same as \`${PREFIX}move\` with no args)\n\n**▸ Config**\n${ARROW} \`${PREFIX}music enable / disable\` — Toggle music system\n${ARROW} \`${PREFIX}music djrole <@role | remove>\` — Set/clear DJ role\n${ARROW} \`${PREFIX}music defaultvol <1-200>\` — Default session volume\n${ARROW} \`${PREFIX}music settings\` — View current music config`
        ))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(t => t.setContent(`-# <> = Required  ·  [] = Optional  ·  Supports: YouTube · Spotify · SoundCloud  ·  Requested by ${msg.author.username}`));
      await msg.reply({ components: [helpPanel], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      return true;
    }

    // ── JOIN ─────────────────────────────────────────────────────────────────
    case "j":
    case "join": {
      if (!voiceCh) {
        await msg.reply({ components: [createErrorContainer("Not in Voice", "You need to be in a voice channel for me to join.\n-# Use `play` to start music.", guildColor)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }
      const botMember = msg.guild.members.me || await msg.guild.members.fetchMe().catch(() => null);
      const voicePerms = botMember && voiceCh.permissionsFor?.(botMember);
      if (!voicePerms?.has?.("Connect") || !voicePerms?.has?.("Speak")) {
        await msg.reply({ components: [createErrorContainer("Missing Voice Permission", `I need **Connect** and **Speak** permission in **${voiceCh.name}**.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }
      const existingQJ = musicGetQueue(guildId);
      if (existingQJ?.player && !existingQJ.destroyed) {
        if (existingQJ.voiceChannelId === voiceCh.id) {
          await msg.reply({ components: [createSuccessContainer("Already There", `Already connected to **${voiceCh.name}**.\n-# Use \`${PREFIX}play <song>\` to queue a track.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
        } else {
          await msg.reply({ components: [createErrorContainer("Already Connected", `Bot is already in <#${existingQJ.voiceChannelId}>.\n-# Use \`${PREFIX}move\` to bring me to your channel, or join that channel.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
        }
        return true;
      }
      try {
        const newQ = await musicJoinAndSetup(guildId, voiceCh, msg.channel);
        if (!newQ.sessionOwnerId) newQ.sessionOwnerId = msg.author.id;
        await msg.reply({ components: [createSuccessContainer("Joined", `Joined **${voiceCh.name}** ${MUSIC_NOTE}\n-# Use \`${PREFIX}play <song>\` to start music · ${msg.author.username}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      } catch (err) {
        await msg.reply({ components: [createErrorContainer("Join Failed", err.message)], flags: MessageFlags.IsComponentsV2 });
      }
      return true;
    }

    // ── PLAY ─────────────────────────────────────────────────────────────────
    case "p":
    case "play": {
      if (!voiceCh) {
        await msg.reply({ components: [createErrorContainer("Not in Voice", "Join a voice channel first.", guildColor)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }
      if (!input) {
        const q2 = musicGetQueue(guildId);
        if (q2?.player) {
          await q2.player.setPaused(false);
          await msg.reply({ components: [createSuccessContainer("Resumed", `Resumed **${q2.current?.title || "the track"}**.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
        } else {
          await msg.reply({ components: [createErrorContainer("Missing Input", `Usage: \`${PREFIX}play <song name or URL>\``, guildColor)], flags: MessageFlags.IsComponentsV2 });
        }
        return true;
      }
      const loadMsg = await msg.channel.send({ components: [new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`${MUSIC_SEARCH} Searching... \`${input}\``))], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      try {
        const existingQ = musicGetQueue(guildId);
        if (existingQ?.player && existingQ.voiceChannelId && voiceCh.id !== existingQ.voiceChannelId) {
          loadMsg?.delete().catch(() => {});
          await msg.reply({ components: [createErrorContainer("Wrong Voice Channel", `The bot is already playing in <#${existingQ.voiceChannelId}>.\nJoin that channel or use \`${PREFIX}leave\`.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
          return true;
        }
        const source = musicDetectSource(input);
        const tracks = [];
        if (source === "spotify") {
          if (/\/track\//i.test(input))    { const t = await resolveSpotifyTrack(input, config);   if (!t) throw new Error("Could not resolve Spotify track.");       t.requestedBy = msg.author.username; tracks.push(t); }
          else if (/\/playlist\//i.test(input)) { const list = await resolveSpotifyPlaylist(input, config); if (!list.length) throw new Error("Spotify playlist is empty or private."); list.forEach(t => { t.requestedBy = msg.author.username; tracks.push(t); }); }
          else if (/\/album\//i.test(input))    { const list = await resolveSpotifyAlbum(input, config);   if (!list.length) throw new Error("Spotify album is empty or private.");    list.forEach(t => { t.requestedBy = msg.author.username; tracks.push(t); }); }
        } else if (source === "youtube" || source === "soundcloud") {
          const result = await lavalinkResolve(input);
          if (!result) throw new Error("Could not load that URL.");
          if (result.loadType === "playlist") {
            result.tracks.slice(0, 50).forEach(lTrack => tracks.push({ title: lTrack.info.title || "Unknown", artist: lTrack.info.author || lTrack.info.artist || "", url: lTrack.info.uri, duration: Math.floor((lTrack.info.length || 0) / 1000), source, encoded: lTrack.encoded, requestedBy: msg.author.username }));
          } else {
            const lTrack = result.tracks[0];
            if (!lTrack) throw new Error("No results for that URL.");
            tracks.push({ title: lTrack.info.title || "Unknown", artist: lTrack.info.author || lTrack.info.artist || "", url: lTrack.info.uri, duration: Math.floor((lTrack.info.length || 0) / 1000), source, encoded: lTrack.encoded, _llTrack: lTrack, requestedBy: msg.author.username });
          }
        } else {
          const found = await lavalinkSearchOne(input, "ytsearch");
          if (!found) throw new Error("No results found.");
          found.requestedBy = msg.author.username;
          tracks.push(found);
        }
        if (!tracks.length) throw new Error("No tracks resolved.");
        const q      = await musicJoinAndSetup(guildId, voiceCh, msg.channel);
        const wasIdle = !q.current && q.tracks.length === 0;
        if (wasIdle && !q.sessionOwnerId) q.sessionOwnerId = msg.author.id;
        q.tracks.push(...tracks);
        loadMsg?.delete().catch(() => {});
        const multi = tracks.length > 1;
        const body  = multi
            ? `Added **${tracks.length} tracks** to the queue.\n${STATUS.tick} First: ${trackLink(tracks[0])}\n${STATUS.tick} Queue: **${q.tracks.length} remaining**`
            : `> ${trackLink(tracks[0])}\n-# Position **#${q.tracks.length}** · Requested by ${msg.author.username}`;
          await msg.channel.send({ components: [new ContainerBuilder()
            .addTextDisplayComponents(t => t.setContent(`### ${STATUS.success} Added to Queue`))
            .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(t => t.setContent(body))], flags: MessageFlags.IsComponentsV2 });
        if (wasIdle) await musicPlayNext(guildId);
        else refreshNowPlaying(guildId).catch(() => {});
      } catch (err) {
        loadMsg?.delete().catch(() => {});
        await msg.reply({ components: [createErrorContainer("Playback Error", err.message)], flags: MessageFlags.IsComponentsV2 });
      }
      return true;
    }

    // ── PLAY YOUTUBE ─────────────────────────────────────────────────────────
    case "py": {
      if (!voiceCh) { await msg.reply({ components: [createErrorContainer("Not in Voice", "Join a voice channel first.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (!input)   { await msg.reply({ components: [createErrorContainer("Missing Input", `Usage: \`${PREFIX}py <song name or YouTube URL>\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const loadMsgPy = await msg.channel.send({ components: [new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`${MUSIC_SEARCH} Searching YouTube... \`${input}\``))], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      try {
        const existingQpy = musicGetQueue(guildId);
        if (existingQpy?.player && existingQpy.voiceChannelId && voiceCh.id !== existingQpy.voiceChannelId) {
          loadMsgPy?.delete().catch(() => {});
          await msg.reply({ components: [createErrorContainer("Wrong Voice Channel", `Bot is in <#${existingQpy.voiceChannelId}>. Join that or use \`${PREFIX}leave\`.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
          return true;
        }
        const tracks    = [];
        const isYtUrl   = /youtu\.be\/|youtube\.com\/(watch|playlist|shorts)/i.test(input);
        if (isYtUrl) {
          const result = await lavalinkResolve(input);
          if (!result) throw new Error("Could not load that YouTube URL.");
          if (result.loadType === "playlist") result.tracks.slice(0, 50).forEach(lTrack => tracks.push({ title: lTrack.info.title || "Unknown", artist: lTrack.info.author || lTrack.info.artist || "", url: lTrack.info.uri, duration: Math.floor((lTrack.info.length || 0) / 1000), source: "youtube", encoded: lTrack.encoded, requestedBy: msg.author.username }));
          else { const lTrack = result.tracks[0]; if (!lTrack) throw new Error("No results."); tracks.push({ title: lTrack.info.title || "Unknown", artist: lTrack.info.author || lTrack.info.artist || "", url: lTrack.info.uri, duration: Math.floor((lTrack.info.length || 0) / 1000), source: "youtube", encoded: lTrack.encoded, _llTrack: lTrack, requestedBy: msg.author.username }); }
        } else {
          const found = await lavalinkSearchOne(input, "ytsearch");
          if (!found) throw new Error("No YouTube results found.");
          found.requestedBy = msg.author.username;
          tracks.push(found);
        }
        if (!tracks.length) throw new Error("No tracks resolved.");
        const q      = await musicJoinAndSetup(guildId, voiceCh, msg.channel);
        const wasIdle = !q.current && q.tracks.length === 0;
        if (wasIdle && !q.sessionOwnerId) q.sessionOwnerId = msg.author.id;
        q.tracks.push(...tracks);
        loadMsgPy?.delete().catch(() => {});
        const body = tracks.length > 1 ? `Added **${tracks.length} tracks**.\n${STATUS.tick} First: ${trackLink(tracks[0])}` : `> ${trackLink(tracks[0])}\n-# Position **#${q.tracks.length}** · Requested by ${msg.author.username}`;
        await msg.channel.send({ components: [new ContainerBuilder()
          .addTextDisplayComponents(t => t.setContent(`### ${STATUS.success} Added to Queue`))
          .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
          .addTextDisplayComponents(t => t.setContent(body))], flags: MessageFlags.IsComponentsV2 });
        if (wasIdle) await musicPlayNext(guildId);
        else refreshNowPlaying(guildId).catch(() => {});
      } catch (err) { loadMsgPy?.delete().catch(() => {}); await msg.reply({ components: [createErrorContainer("YouTube Error", err.message)], flags: MessageFlags.IsComponentsV2 }); }
      return true;
    }

    // ── PLAY SPOTIFY ─────────────────────────────────────────────────────────
    case "ps": {
      if (!voiceCh) { await msg.reply({ components: [createErrorContainer("Not in Voice", "Join a voice channel first.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (!input)   { await msg.reply({ components: [createErrorContainer("Missing Input", `Usage: \`${PREFIX}ps <song name or Spotify URL>\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const loadMsgPs = await msg.channel.send({ components: [new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`${MUSIC_SEARCH} Searching Spotify... \`${input}\``))], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      try {
        const existingQps = musicGetQueue(guildId);
        if (existingQps?.player && existingQps.voiceChannelId && voiceCh.id !== existingQps.voiceChannelId) {
          loadMsgPs?.delete().catch(() => {}); await msg.reply({ components: [createErrorContainer("Wrong Voice Channel", `Bot is in <#${existingQps.voiceChannelId}>. Join that or use \`${PREFIX}leave\`.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true;
        }
        const tracks    = [];
        const isSpotUrl = /spotify\.com\/(track|album|playlist)\//i.test(input);
        if (isSpotUrl) {
          if (/\/track\//i.test(input))         { const t = await resolveSpotifyTrack(input, config);   if (!t) throw new Error("Could not resolve Spotify track.");     t.requestedBy = msg.author.username; tracks.push(t); }
          else if (/\/playlist\//i.test(input)) { const list = await resolveSpotifyPlaylist(input, config); if (!list.length) throw new Error("Playlist empty or private."); list.forEach(t => { t.requestedBy = msg.author.username; tracks.push(t); }); }
          else if (/\/album\//i.test(input))    { const list = await resolveSpotifyAlbum(input, config);   if (!list.length) throw new Error("Album empty or private.");     list.forEach(t => { t.requestedBy = msg.author.username; tracks.push(t); }); }
        } else {
          const spt = await searchSpotifyTrack(input, config);
          if (spt) { spt.requestedBy = msg.author.username; tracks.push(spt); }
          else { const fb = await lavalinkSearchOne(input, "ytsearch"); if (!fb) throw new Error("No results on Spotify or YouTube."); fb.requestedBy = msg.author.username; tracks.push(fb); }
        }
        if (!tracks.length) throw new Error("No tracks resolved.");
        const q      = await musicJoinAndSetup(guildId, voiceCh, msg.channel);
        const wasIdle = !q.current && q.tracks.length === 0;
        if (wasIdle && !q.sessionOwnerId) q.sessionOwnerId = msg.author.id;
        q.tracks.push(...tracks);
        loadMsgPs?.delete().catch(() => {});
        const body = tracks.length > 1 ? `Added **${tracks.length} tracks**.\n${STATUS.tick} First: ${trackLink(tracks[0])}` : `> ${trackLink(tracks[0])}\n-# Position **#${q.tracks.length}** · Requested by ${msg.author.username}`;
        await msg.channel.send({ components: [new ContainerBuilder()
          .addTextDisplayComponents(t => t.setContent(`### ${STATUS.success} Added to Queue`))
          .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
          .addTextDisplayComponents(t => t.setContent(body))], flags: MessageFlags.IsComponentsV2 });
        if (wasIdle) await musicPlayNext(guildId);
        else refreshNowPlaying(guildId).catch(() => {});
      } catch (err) { loadMsgPs?.delete().catch(() => {}); await msg.reply({ components: [createErrorContainer("Spotify Error", err.message)], flags: MessageFlags.IsComponentsV2 }); }
      return true;
    }

    // ── SKIP ─────────────────────────────────────────────────────────────────
    case "s":
    case "next":
    case "skip": {
      const q = musicGetQueue(guildId);
      if (!q?.current) { await msg.reply({ components: [createErrorContainer("Nothing Playing", "There's nothing to skip.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (q.tracks.length === 0 && q.loop !== "queue") { await msg.reply({ components: [createErrorContainer("No Next Track", `There are no more songs in the queue.\n-# Add songs with \`${PREFIX}play\` or enable \`${PREFIX}loop queue\`.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const skipped = q.current.title;
      const wasLoop = q.loop;
      if (q.loop === "track") q.loop = "off";
      await q.player.stopTrack();
      // stopTrack fires the end event which calls musicPlayNext → saveQueue there;
      // but persist immediately so a crash right after stop doesn't lose the queue.
      saveQueue(guildId);
      const sc = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent(`### ${STATUS.success} Skipped`))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(t => t.setContent(`> ${STATUS.tick} **Skipped:** ${skipped}\n> ${STATUS.tick} **Up next:** ${q.tracks[0]?.title || "*(nothing)*"}\n${wasLoop === "track" ? `-# Loop was \`track\` — reset to \`off\` for skip` : `-# ${msg.author.username} skipped`}`));
      await msg.reply({ components: [sc], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── PAUSE ────────────────────────────────────────────────────────────────
    case "pause": {
      const q = musicGetQueue(guildId);
      if (!q?.player) { await msg.reply({ components: [createErrorContainer("Nothing Playing", "Nothing is currently playing.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (q.player.paused) { await msg.reply({ components: [createErrorContainer("Already Paused", `Use \`${PREFIX}resume\` to continue.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      await q.player.setPaused(true);
      await msg.reply({ components: [createSuccessContainer("Paused", `Paused **${q.current?.title || "the track"}**. Use \`${PREFIX}resume\` to continue.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── RESUME ───────────────────────────────────────────────────────────────
    case "unpause":
    case "resume": {
      const q = musicGetQueue(guildId);
      if (!q?.player) { await msg.reply({ components: [createErrorContainer("Nothing Playing", "Nothing is paused.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (!q.player.paused) { await msg.reply({ components: [createErrorContainer("Not Paused", "Music is not paused.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      await q.player.setPaused(false);
      await msg.reply({ components: [createSuccessContainer("Resumed", `Resumed **${q.current?.title || "the track"}**.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── STOP (alias for pause) ────────────────────────────────────────────────
    case "stop": {
      const q = musicGetQueue(guildId);
      const botVoiceId = msg.guild?.members?.me?.voice?.channelId || null;
      if (!q && !botVoiceId) {
        await destroyMusicSession(msg.guild, "prefix stop no queue").catch(() => {});
        await msg.reply({ components: [createErrorContainer("Not Connected", "The bot is not in a voice channel.", guildColor)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }
      if (q && !isSessionController(msg.author.id, msg.member, q)) {
        await msg.reply({ components: [createErrorContainer("Not Allowed", `Only the session owner (<@${q.sessionOwnerId}>) or an admin can stop this music session.\n-# Use \`${PREFIX}access\` to see session info.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }
      await destroyMusicSession(msg.guild, "prefix stop");
      await msg.reply({ components: [createSuccessContainer("Stopped", "Stopped playback, left the voice channel, and cleared the queue.", guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── LEAVE ────────────────────────────────────────────────────────────────
    case "dc":
    case "disconnect":
    case "leave": {
      const q = musicGetQueue(guildId);
      const botVoiceId = msg.guild?.members?.me?.voice?.channelId || null;
      if (!q && !botVoiceId) {
        await destroyMusicSession(msg.guild, "prefix leave no queue").catch(() => {});
        await msg.reply({ components: [createErrorContainer("Not Connected", "The bot is not in a voice channel.", guildColor)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }
      if (q && !isSessionController(msg.author.id, msg.member, q)) {
        await msg.reply({ components: [createErrorContainer("Not Allowed", `Only the session owner (<@${q.sessionOwnerId}>) or an admin can disconnect the bot.\n-# Use \`${PREFIX}access\` to see session info.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }
      await destroyMusicSession(msg.guild, "prefix leave");
      await msg.reply({ components: [new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent(`### ${STATUS.success} Disconnected`))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(t => t.setContent(`> ${STATUS.tick} Left the voice channel and cleared the queue.`))
      ], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── NOW PLAYING ──────────────────────────────────────────────────────────
    case "nowplaying":
    case "np": {
      const q = musicGetQueue(guildId);
      if (!q?.current) { await msg.reply({ components: [new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent(`### ${STATUS.warning} Nothing Playing`))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(t => t.setContent(`> ${STATUS.cross} Nothing is currently playing.`))
      ], flags: MessageFlags.IsComponentsV2 }); return true; }
      q.guildColor = guildColor;
      if (q.nowPlayingMsg) q.nowPlayingMsg.delete().catch(() => {});
      q.nowPlayingMsg = await msg.reply(await buildNpMessagePayload(q, guildId)).catch(() => null);
      return true;
    }

    // ── QUEUE ────────────────────────────────────────────────────────────────
    case "q":
    case "queue": {
      const q = musicGetQueue(guildId);
      if (!q?.current && !q?.tracks?.length) { await msg.reply({ components: [createErrorContainer("Empty Queue", `No music is queued. Use \`${PREFIX}play\` to add tracks!`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const page  = Math.max(1, parseInt(args[0]) || 1);
      const PER   = 10, total = q.tracks.length;
      const start = (page - 1) * PER, end = Math.min(start + PER, total);
      const pages = Math.max(1, Math.ceil(total / PER));
      const trackLines = q.tracks.slice(start, end).map((t, i) => `\`${start + i + 1}.\` **${t.title}** · \`${musicFmtDuration(t.duration)}\` · ${musicSourceLabel(t.source)}`).join("\n") || "*No more tracks*";
      const qc = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Music Queue`))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(t => t.setContent(`**Now Playing:**\n${MUSIC_NOTE} ${q.current ? `**${q.current.title}** · \`${musicFmtDuration(q.current.duration)}\`` : "*(nothing)*"}`))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(t => t.setContent(`**Up Next:** (${total} track${total !== 1 ? "s" : ""} · Page ${page}/${pages})\n${trackLines}`))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(t => t.setContent(`-# Loop: \`${q.loop}\` · Vol: \`${q.volume}%\`${pages > 1 ? ` · Use \`${PREFIX}queue <page>\` for more` : ""}`));
      await msg.reply({ components: [qc], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── VOLUME ───────────────────────────────────────────────────────────────
    case "vol":
    case "volume": {
      const q   = musicGetQueue(guildId);
      const vol = parseInt(args[0]);
      if (isNaN(vol)) { await msg.reply({ components: [createErrorContainer("Invalid Volume", `Current volume: \`${q?.volume ?? 80}%\`\nUsage: \`${PREFIX}volume <1-200>\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const clamped = Math.max(1, Math.min(200, vol));
      if (q) {
        q.volume = clamped;
        try { await q.player?.setGlobalVolume(clamped); } catch {}
        saveQueue(guildId);
      }
      const bar = "█".repeat(Math.round(clamped / 10)) + "░".repeat(Math.max(0, 20 - Math.round(clamped / 10)));
      const vc = new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Volume`)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true)).addTextDisplayComponents(t => t.setContent(`**Volume set to \`${clamped}%\`**\n\`${bar.slice(0, 20)}\``)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents(t => t.setContent(`-# Changed by ${msg.author.username}`));
      await msg.reply({ components: [vc], flags: MessageFlags.IsComponentsV2 });
      refreshNowPlaying(guildId).catch(() => {});
      return true;
    }

    // ── LOOP ─────────────────────────────────────────────────────────────────
    case "repeat":
    case "loop": {
      const q = musicGetQueue(guildId);
      if (!q?.current) { await msg.reply({ components: [createErrorContainer("Nothing Playing", "Nothing is playing.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const modes = ["off","track","queue"];
      const arg   = args[0]?.toLowerCase();
      q.loop = (arg && modes.includes(arg)) ? arg : modes[(modes.indexOf(q.loop) + 1) % modes.length];
      saveQueue(guildId);
      const descs = { off: "Loop is **off**. Queue plays once.", track: "**Track loop** — current song repeats.", queue: "**Queue loop** — all tracks repeat." };
      const lc = new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Loop Mode`)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true)).addTextDisplayComponents(t => t.setContent(descs[q.loop])).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents(t => t.setContent(`-# Changed by ${msg.author.username}`));
      await msg.reply({ components: [lc], flags: MessageFlags.IsComponentsV2 });
      refreshNowPlaying(guildId).catch(() => {});
      return true;
    }

    // ── SHUFFLE ──────────────────────────────────────────────────────────────
    case "sh":
    case "shuffle": {
      const q = musicGetQueue(guildId);
      if (!q?.tracks?.length) { await msg.reply({ components: [createErrorContainer("Empty Queue", "Nothing to shuffle.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      for (let i = q.tracks.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q.tracks[i], q.tracks[j]] = [q.tracks[j], q.tracks[i]]; }
      await msg.reply({ components: [createSuccessContainer("Shuffled", `Shuffled **${q.tracks.length} tracks** in the queue!`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── REMOVE ───────────────────────────────────────────────────────────────
    case "rm":
    case "remove": {
      const q   = musicGetQueue(guildId);
      const pos = parseInt(args[0]);
      if (!q?.tracks?.length) { await msg.reply({ components: [createErrorContainer("Empty Queue", "No tracks to remove.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (isNaN(pos) || pos < 1 || pos > q.tracks.length) { await msg.reply({ components: [createErrorContainer("Invalid Position", `Provide a number between **1** and **${q.tracks.length}**.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const [removed] = q.tracks.splice(pos - 1, 1);
      await msg.reply({ components: [createSuccessContainer("Removed", `Removed **#${pos}** — ${removed.title}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── JUMP ─────────────────────────────────────────────────────────────────
    case "jump": {
      const q   = musicGetQueue(guildId);
      const pos = parseInt(args[0]);
      if (!q?.tracks?.length) { await msg.reply({ components: [createErrorContainer("Empty Queue", "No tracks to jump to.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (isNaN(pos) || pos < 1 || pos > q.tracks.length) { await msg.reply({ components: [createErrorContainer("Invalid Position", `Provide a number between **1** and **${q.tracks.length}**.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      q.tracks.splice(0, pos - 1);
      await q.player.stopTrack();
      await msg.reply({ components: [createSuccessContainer("Jumped", `Jumped to **#${pos}** — ${q.tracks[0]?.title || "Unknown"}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── AUTOPLAY ─────────────────────────────────────────────────────────────
    case "ap":
    case "autoplay": {
      const q = musicGetQueue(guildId);
      if (!q) { await msg.reply({ components: [createErrorContainer("Not Playing", "Start playing music first.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      q.autoplay = !q.autoplay;
      saveQueue(guildId);
      const apc = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Autoplay`))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(t => t.setContent(q.autoplay ? `> ${STATUS.tick} **Autoplay is ON** — A related track will be added when the queue ends.` : `> ${STATUS.tick} **Autoplay is OFF** — Queue will stop when all tracks finish.`))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(t => t.setContent(`-# Toggled by ${msg.author.username}`));
      await msg.reply({ components: [apc], flags: MessageFlags.IsComponentsV2 });
      if (q.autoplay && !q.current && q.tracks.length === 0 && q.previousTrack) {
        if (q.idleTimer) { clearTimeout(q.idleTimer); q.idleTimer = null; }
        musicPlayNext(guildId).catch(() => {});
      }
      return true;
    }

    // ── PLAYLIST ─────────────────────────────────────────────────────────────
    case "pl":
    case "playlist": {
      const sub     = args[0]?.toLowerCase();
      const db2     = msg.client._db || {};
      if (!db2.playlists) db2.playlists = {};
      const userId  = msg.author.id;
      if (!db2.playlists[userId]) db2.playlists[userId] = {};
      const userPls = db2.playlists[userId];
      const saveDb  = () => { try { const fs = require("fs"); require("../../utils/redisDatabase").requestSave(); } catch {} };

      if (sub === "create") {
        const plName = args.slice(1).join(" ").trim();
        if (!plName)           { await msg.reply({ components: [createErrorContainer("Missing Name", `Usage: \`${PREFIX}playlist create <name>\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        if (plName.length > 32){ await msg.reply({ components: [createErrorContainer("Name Too Long", "Max 32 characters.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        const key = plName.toLowerCase();
        if (userPls[key])      { await msg.reply({ components: [createErrorContainer("Already Exists", `A playlist named **${plName}** already exists.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        if (Object.keys(userPls).length >= 20) { await msg.reply({ components: [createErrorContainer("Limit Reached", "You can have at most **20 playlists**.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        userPls[key] = { name: plName, tracks: [], createdAt: Date.now() };
        saveDb();
        await msg.reply({ components: [createSuccessContainer("Playlist Created", `Created **${plName}**! Add tracks with \`${PREFIX}playlist add ${plName} <song>\`.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }
      if (sub === "delete" || sub === "del" || sub === "remove") {
        const plName = args.slice(1).join(" ").trim().toLowerCase();
        if (!plName || !userPls[plName]) { await msg.reply({ components: [createErrorContainer("Not Found", `No playlist named **${plName || "(none)"}** found.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        const displayName = userPls[plName].name;
        delete userPls[plName]; saveDb();
        await msg.reply({ components: [createSuccessContainer("Deleted", `Deleted playlist **${displayName}**.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }
      if (!sub || sub === "list" || sub === "all") {
        const plKeys = Object.keys(userPls);
        if (!plKeys.length) { await msg.reply({ components: [createErrorContainer("No Playlists", `Create one with \`${PREFIX}playlist create <name>\`.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        const lines = plKeys.map((k, i) => `\`${i + 1}.\` **${userPls[k].name}** — ${userPls[k].tracks.length} track${userPls[k].tracks.length !== 1 ? "s" : ""}`).join("\n");
        const plc = new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Your Playlists`)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true)).addTextDisplayComponents(t => t.setContent(lines)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents(t => t.setContent(`-# ${plKeys.length}/20 playlists`));
        await msg.reply({ components: [plc], flags: MessageFlags.IsComponentsV2 });
        return true;
      }
      if (sub === "add") {
        const restWords = args.slice(1);
        let plKey = null, songQuery = null;
        for (let i = restWords.length; i >= 1; i--) {
          const cand = restWords.slice(0, i).join(" ").toLowerCase();
          if (userPls[cand]) { plKey = cand; songQuery = restWords.slice(i).join(" ").trim(); break; }
        }
        if (!plKey)     { await msg.reply({ components: [createErrorContainer("Playlist Not Found", `Usage: \`${PREFIX}playlist add <name> <song>\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        if (!songQuery) { await msg.reply({ components: [createErrorContainer("Missing Song", `Usage: \`${PREFIX}playlist add ${userPls[plKey].name} <song>\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        if (userPls[plKey].tracks.length >= 200) { await msg.reply({ components: [createErrorContainer("Playlist Full", "Max 200 tracks.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        const lm2 = await msg.channel.send({ components: [new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`${MUSIC_EMOJI_ICON} Searching... \`${songQuery}\``))], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        try {
          let trackToSave;
          const src2 = musicDetectSource(songQuery);
          if (src2 === "spotify") { trackToSave = await resolveSpotifyTrack(songQuery, config); if (!trackToSave) throw new Error("Could not resolve Spotify track."); }
          else if (src2 === "youtube" || src2 === "soundcloud") { const r = await lavalinkResolve(songQuery); if (!r) throw new Error("Could not load URL."); const lt = r.tracks[0]; if (!lt) throw new Error("No results."); trackToSave = { title: lt.info.title || "Unknown", artist: lt.info.author || lt.info.artist || "", url: lt.info.uri, duration: Math.floor((lt.info.length || 0) / 1000), source: src2 }; }
          else { const f2 = await lavalinkSearchOne(songQuery, "ytsearch"); if (!f2) throw new Error("No results."); trackToSave = { title: f2.title, artist: f2.artist, url: f2.url, duration: f2.duration, source: f2.source }; }
          userPls[plKey].tracks.push(trackToSave); saveDb();
          lm2?.delete().catch(() => {});
          await msg.reply({ components: [createSuccessContainer("Added to Playlist", `Added **${trackToSave.title}** to **${userPls[plKey].name}**.\n-# Track #${userPls[plKey].tracks.length}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
        } catch (err) { lm2?.delete().catch(() => {}); await msg.reply({ components: [createErrorContainer("Search Failed", err.message)], flags: MessageFlags.IsComponentsV2 }); }
        return true;
      }
      if (sub === "addcurrent" || sub === "ac") {
        const plKey = args.slice(1).join(" ").trim().toLowerCase();
        if (!plKey || !userPls[plKey]) { await msg.reply({ components: [createErrorContainer("Playlist Not Found", `Usage: \`${PREFIX}playlist addcurrent <name>\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        const q = musicGetQueue(guildId);
        if (!q?.current) { await msg.reply({ components: [createErrorContainer("Nothing Playing", "Nothing is currently playing.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        if (userPls[plKey].tracks.length >= 200) { await msg.reply({ components: [createErrorContainer("Playlist Full", "Max 200 tracks.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        const ct = q.current;
        userPls[plKey].tracks.push({ title: ct.title, artist: ct.artist, url: ct.url, duration: ct.duration, source: ct.source, searchStr: ct.searchStr }); saveDb();
        await msg.reply({ components: [createSuccessContainer("Saved", `Added **${ct.title}** to **${userPls[plKey].name}**.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }
      if (sub === "removetrack" || sub === "rt") {
        const rw = args.slice(1);
        const pos2 = parseInt(rw[rw.length - 1]);
        const plKey = rw.slice(0, -1).join(" ").toLowerCase();
        if (!plKey || !userPls[plKey]) { await msg.reply({ components: [createErrorContainer("Playlist Not Found", `Usage: \`${PREFIX}playlist removetrack <name> <#>\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        const pl = userPls[plKey];
        if (isNaN(pos2) || pos2 < 1 || pos2 > pl.tracks.length) { await msg.reply({ components: [createErrorContainer("Invalid Position", `Between 1 and ${pl.tracks.length}.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        const [rm2] = pl.tracks.splice(pos2 - 1, 1); saveDb();
        await msg.reply({ components: [createSuccessContainer("Removed", `Removed **${rm2.title}** (#${pos2}) from **${pl.name}**.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }
      if (sub === "view" || sub === "show" || sub === "info") {
        const plKey = args.slice(1).join(" ").trim().toLowerCase();
        if (!plKey || !userPls[plKey]) { await msg.reply({ components: [createErrorContainer("Playlist Not Found", `Usage: \`${PREFIX}playlist view <name>\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        const pl = userPls[plKey]; const PER = 15;
        const lines2 = pl.tracks.slice(0, PER).map((t, i) => `\`${i + 1}.\` **${t.title}** · \`${musicFmtDuration(t.duration)}\``).join("\n") || "*No tracks yet*";
        const totalDur = pl.tracks.reduce((a, t) => a + (t.duration || 0), 0);
        const vc2 = new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} ${pl.name}`)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true)).addTextDisplayComponents(t => t.setContent(lines2)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents(t => t.setContent(`-# ${pl.tracks.length} track${pl.tracks.length !== 1 ? "s" : ""} · Total: ${musicFmtDuration(totalDur)}${pl.tracks.length > PER ? ` · First ${PER} shown` : ""}`));
        await msg.reply({ components: [vc2], flags: MessageFlags.IsComponentsV2 });
        return true;
      }
      if (sub === "play" || sub === "p" || sub === "start") {
        if (!voiceCh) { await msg.reply({ components: [createErrorContainer("Not in Voice", "Join a voice channel first.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        const plKey = args.slice(1).join(" ").trim().toLowerCase();
        if (!plKey || !userPls[plKey]) { await msg.reply({ components: [createErrorContainer("Playlist Not Found", `Usage: \`${PREFIX}playlist play <name>\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        const pl = userPls[plKey];
        if (!pl.tracks.length) { await msg.reply({ components: [createErrorContainer("Empty Playlist", `No tracks in **${pl.name}**.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        const lm3 = await msg.channel.send({ components: [new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`${MUSIC_EMOJI_ICON} Loading **${pl.name}** (${pl.tracks.length} tracks)...`))], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        const existingQpl = musicGetQueue(guildId);
        if (existingQpl?.player && existingQpl.voiceChannelId && voiceCh?.id !== existingQpl.voiceChannelId) {
          lm3?.delete().catch(() => {}); await msg.reply({ components: [createErrorContainer("Wrong Voice Channel", `Bot is in <#${existingQpl.voiceChannelId}>.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true;
        }
        const q = await musicJoinAndSetup(guildId, voiceCh, msg.channel);
        const wasIdle2 = !q.current && q.tracks.length === 0;
        if (wasIdle2 && !q.sessionOwnerId) q.sessionOwnerId = msg.author.id;
        pl.tracks.forEach(t => q.tracks.push({ ...t, requestedBy: msg.author.username }));
        lm3?.delete().catch(() => {});
        if (wasIdle2) await musicPlayNext(guildId);
        else await msg.reply({ components: [createSuccessContainer("Playlist Loaded", `Queued **${pl.tracks.length} tracks** from **${pl.name}**!`, guildColor)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }
      if (sub === "rename") {
        const rArr = args.slice(1);
        let plKey = null, newName = null;
        for (let i = rArr.length - 1; i >= 1; i--) {
          const cand = rArr.slice(0, i).join(" ").toLowerCase();
          if (userPls[cand]) { plKey = cand; newName = rArr.slice(i).join(" ").trim(); break; }
        }
        if (!plKey || !newName) { await msg.reply({ components: [createErrorContainer("Invalid Usage", `Usage: \`${PREFIX}playlist rename <current> <new>\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        if (newName.length > 32) { await msg.reply({ components: [createErrorContainer("Name Too Long", "Max 32 characters.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        const newKey = newName.toLowerCase();
        if (userPls[newKey] && newKey !== plKey) { await msg.reply({ components: [createErrorContainer("Name Taken", `**${newName}** already exists.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        const pl2 = userPls[plKey]; const oldName = pl2.name;
        pl2.name = newName; userPls[newKey] = pl2;
        if (newKey !== plKey) delete userPls[plKey];
        saveDb();
        await msg.reply({ components: [createSuccessContainer("Renamed", `Renamed **${oldName}** → **${newName}**.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }
      if (sub === "clear") {
        const plKey = args.slice(1).join(" ").trim().toLowerCase();
        if (!plKey || !userPls[plKey]) { await msg.reply({ components: [createErrorContainer("Playlist Not Found", `Usage: \`${PREFIX}playlist clear <name>\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        userPls[plKey].tracks = []; saveDb();
        await msg.reply({ components: [createSuccessContainer("Cleared", `Removed all tracks from **${userPls[plKey].name}**.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }
      // Help fallback
      const helpLines = [`\`${PREFIX}playlist create <name>\``,`\`${PREFIX}playlist delete <name>\``,`\`${PREFIX}playlist list\``,`\`${PREFIX}playlist view <name>\``,`\`${PREFIX}playlist add <name> <song>\``,`\`${PREFIX}playlist addcurrent <name>\``,`\`${PREFIX}playlist removetrack <name> <#>\``,`\`${PREFIX}playlist clear <name>\``,`\`${PREFIX}playlist rename <name> <new>\``,`\`${PREFIX}playlist play <name>\``].join("\n");
      await msg.reply({ components: [new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Playlist Commands`)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true)).addTextDisplayComponents(t => t.setContent(helpLines))], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── UPCOMING ─────────────────────────────────────────────────────────────
    case "upcoming": {
      const q = musicGetQueue(guildId);
      if (!q?.current) { await msg.reply({ components: [createErrorContainer("Nothing Playing", "Nothing is currently playing.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const next5 = q.tracks.slice(0, 5);
      const lines  = next5.length ? next5.map((t, i) => `\`${i + 1}.\` **${t.title}** · \`${musicFmtDuration(t.duration)}\``).join("\n") : "*No upcoming tracks.*";
      const uc = new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Upcoming Songs`)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true)).addTextDisplayComponents(t => t.setContent(`**Now Playing:**\n${MUSIC_NOTE} **${q.current.title}**`)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true)).addTextDisplayComponents(t => t.setContent(`**Next Up:**\n${lines}`)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents(t => t.setContent(`-# Showing up to 5 of **${q.tracks.length}** queued`));
      await msg.reply({ components: [uc], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── MOVE ─────────────────────────────────────────────────────────────────
    // `move <from> <to>`  → rearrange queue track positions
    // `move`              → move bot to your current voice channel (like movebot)
    case "move": {
      const from = parseInt(args[0]), to = parseInt(args[1]);
      const isTwoNumbers = !isNaN(from) && !isNaN(to);

      if (isTwoNumbers) {
        // ── Queue-track move ─────────────────────────────────────────────────
        const q = musicGetQueue(guildId);
        if (!q?.tracks?.length) { await msg.reply({ components: [createErrorContainer("Empty Queue", "No tracks to move.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        if (from < 1 || to < 1 || from > q.tracks.length || to > q.tracks.length) { await msg.reply({ components: [createErrorContainer("Invalid Position", `Both must be between 1 and ${q.tracks.length}.\nUsage: \`${PREFIX}move <from> <to>\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        const [track] = q.tracks.splice(from - 1, 1);
        q.tracks.splice(to - 1, 0, track);
        await msg.reply({ components: [createSuccessContainer("Moved", `Moved **${track.title}** from **#${from}** → **#${to}**.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }

      // ── VC move (move bot to your voice channel) ─────────────────────────
      if (!voiceCh) { await msg.reply({ components: [createErrorContainer("Not in Voice", "Join a voice channel first.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const qMv = musicGetQueue(guildId);
      if (!qMv?.player) { await msg.reply({ components: [createErrorContainer("Not Playing", "The bot is not in a voice channel. Use `play` to start music first.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (voiceCh.id === qMv.voiceChannelId) { await msg.reply({ components: [createErrorContainer("Already There", `Bot is already in **${voiceCh.name}**. Try \`${PREFIX}move <from> <to>\` to rearrange queue tracks.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      try {
        const wasPlaying  = qMv.current;
        const wasPosition = qMv.player.position ?? 0;
        await shoukaku.leaveVoiceChannel(guildId);
        const newPlayer = await shoukaku.joinVoiceChannel({
          guildId, channelId: voiceCh.id, shardId: voiceCh.guild.shardId ?? 0, deaf: true,
        });
        qMv.player         = newPlayer;
        qMv.voiceChannelId = voiceCh.id;
        qMv.textChannel    = msg.channel;
        newPlayer.removeAllListeners();
        newPlayer.on("start", () => {
          const qL = musicQueues.get(guildId); if (!qL || qL.destroyed || qL.player !== newPlayer) return;
          if (qL.current) { qL.history.unshift({ ...qL.current }); if (qL.history.length > 20) qL.history.pop(); qL.mostPlayed[qL.current.title] = (qL.mostPlayed[qL.current.title] || 0) + 1; }
        });
        newPlayer.on("end", async (data) => {
          const qL = musicQueues.get(guildId); if (!qL || qL.destroyed || qL.player !== newPlayer) return;
          if (data?.reason === "replaced" || data?.reason === "loadFailed") return;
          await musicPlayNext(guildId);
        });
        newPlayer.on("exception", data => { void musicHandlePlaybackFailure(guildId, newPlayer, data); });
        newPlayer.on("stuck", async () => {
          const qL = musicQueues.get(guildId); if (!qL || qL.destroyed || qL.player !== newPlayer) return;
          await musicPlayNext(guildId);
        });
        newPlayer.on("closed", data => musicHandleVoiceClosed(guildId, newPlayer, data));
        if (wasPlaying?.encoded) {
          await newPlayer.setGlobalVolume(qMv.volume).catch(() => {});
          await newPlayer.playTrack({ track: wasPlaying._llTrack || { encoded: wasPlaying.encoded } }).catch(() => {});
          if (wasPosition > 0) await newPlayer.seekTo(wasPosition).catch(() => {});
        }
        await msg.reply({ components: [createSuccessContainer("Moved", `Moved to **${voiceCh.name}** — playback resumed.\n-# ${msg.author.username}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      } catch (err) { await msg.reply({ components: [createErrorContainer("Move Failed", err.message)], flags: MessageFlags.IsComponentsV2 }); }
      return true;
    }

    // ── MOVEBOT ──────────────────────────────────────────────────────────────
    case "movebot": {
      if (!voiceCh) { await msg.reply({ components: [createErrorContainer("Not in Voice", "Join a voice channel first.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const q = musicGetQueue(guildId);
      if (!q?.player) { await msg.reply({ components: [createErrorContainer("Not Playing", "The bot is not in a voice channel.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      try {
        // Remember playback state before reconnect
        const wasPlaying  = q.current;
        const wasPosition = q.player.position ?? 0;

        // Leave old channel — destroys old player inside Shoukaku
        await shoukaku.leaveVoiceChannel(guildId);

        // Join new channel — returns a fresh player
        const newPlayer = await shoukaku.joinVoiceChannel({
          guildId, channelId: voiceCh.id, shardId: voiceCh.guild.shardId ?? 0, deaf: true,
        });

        // Swap player on the queue and reattach all event listeners
        q.player         = newPlayer;
        q.voiceChannelId = voiceCh.id;
        q.textChannel    = msg.channel;

        // Re-attach events on the new player (mirrors musicJoinAndSetup)
        newPlayer.removeAllListeners();
        newPlayer.on("start", () => {
          const qL = musicQueues.get(guildId); if (!qL || qL.destroyed || qL.player !== newPlayer) return;
          if (qL.current) { qL.history.unshift({ ...qL.current }); if (qL.history.length > 20) qL.history.pop(); qL.mostPlayed[qL.current.title] = (qL.mostPlayed[qL.current.title] || 0) + 1; }
        });
        newPlayer.on("end", async (data) => {
          const qL = musicQueues.get(guildId); if (!qL || qL.destroyed || qL.player !== newPlayer) return;
          if (data?.reason === "replaced" || data?.reason === "loadFailed") return;
          await musicPlayNext(guildId);
        });
        newPlayer.on("exception", data => { void musicHandlePlaybackFailure(guildId, newPlayer, data); });
        newPlayer.on("stuck", async () => {
          const qL = musicQueues.get(guildId); if (!qL || qL.destroyed || qL.player !== newPlayer) return;
          await musicPlayNext(guildId);
        });
        newPlayer.on("closed", data => musicHandleVoiceClosed(guildId, newPlayer, data));

        // Resume playback if a track was playing — seek back to position
        if (wasPlaying?.encoded) {
          await newPlayer.setGlobalVolume(q.volume).catch(() => {});
          await newPlayer.playTrack({ track: wasPlaying._llTrack || { encoded: wasPlaying.encoded } }).catch(() => {});
          if (wasPosition > 0) await newPlayer.seekTo(wasPosition).catch(() => {});
        }

        await msg.reply({ components: [createSuccessContainer("Moved", `Moved to **${voiceCh.name}** — playback resumed.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      } catch (err) { await msg.reply({ components: [createErrorContainer("Move Failed", err.message)], flags: MessageFlags.IsComponentsV2 }); }
      return true;
    }

    // ── SEEK ─────────────────────────────────────────────────────────────────
    case "seek": {
      const q = musicGetQueue(guildId); const ms = parseDuration(args[0]);
      if (!q?.current) { await msg.reply({ components: [createErrorContainer("Nothing Playing", "Nothing is playing.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (ms === null)  { await msg.reply({ components: [createErrorContainer("Invalid Time", `Usage: \`${PREFIX}seek 1:30\` or \`${PREFIX}seek 90\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const maxMs    = (q.current.duration || 0) * 1000;
      const clamped2 = Math.max(0, maxMs ? Math.min(ms, maxMs) : ms);
      await q.player.seekTo(clamped2).catch(() => {});
      await msg.reply({ components: [createSuccessContainer("Seeked", `Jumped to \`${musicFmtDuration(Math.floor(clamped2 / 1000))}\` in **${q.current.title}**.\n-# ${msg.author.username}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── REWIND ───────────────────────────────────────────────────────────────
    case "rewind": {
      const q    = musicGetQueue(guildId); const secs = parseInt(args[0]) || 10;
      if (!q?.current) { await msg.reply({ components: [createErrorContainer("Nothing Playing", "Nothing is playing.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const target = Math.max(0, (q.player.position || 0) - secs * 1000);
      await q.player.seekTo(target).catch(() => {});
      await msg.reply({ components: [createSuccessContainer("Rewound", `Went back **${secs}s** → \`${musicFmtDuration(Math.floor(target / 1000))}\`.\n-# ${msg.author.username}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── FORWARD ──────────────────────────────────────────────────────────────
    case "forward": {
      const q    = musicGetQueue(guildId); const secs = parseInt(args[0]) || 10;
      if (!q?.current) { await msg.reply({ components: [createErrorContainer("Nothing Playing", "Nothing is playing.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const maxMs2 = (q.current.duration || 0) * 1000;
      const target2 = maxMs2 ? Math.min((q.player.position || 0) + secs * 1000, maxMs2 - 1000) : (q.player.position || 0) + secs * 1000;
      await q.player.seekTo(target2).catch(() => {});
      await msg.reply({ components: [createSuccessContainer("Forwarded", `Skipped ahead **${secs}s** → \`${musicFmtDuration(Math.floor(target2 / 1000))}\`.\n-# ${msg.author.username}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── REPLAY ───────────────────────────────────────────────────────────────
    case "replay": {
      const q = musicGetQueue(guildId);
      if (!q?.current) { await msg.reply({ components: [createErrorContainer("Nothing Playing", "Nothing is playing.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      await q.player.seekTo(0).catch(() => {});
      await msg.reply({ components: [createSuccessContainer("Replaying", `Restarted **${q.current.title}** from the beginning.\n-# ${msg.author.username}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── PLAYNEXT ─────────────────────────────────────────────────────────────
    case "pn":
    case "playnext": {
      if (!voiceCh) { await msg.reply({ components: [createErrorContainer("Not in Voice", "Join a voice channel first.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (!input)   { await msg.reply({ components: [createErrorContainer("Missing Song", `Usage: \`${PREFIX}playnext <song>\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const lmPn = await msg.channel.send({ components: [new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`${MUSIC_SEARCH} Searching... \`${input}\``))], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      try {
        const existingQ2 = musicGetQueue(guildId);
        if (existingQ2?.player && existingQ2.voiceChannelId && voiceCh.id !== existingQ2.voiceChannelId) {
          lmPn?.delete().catch(() => {}); await msg.reply({ components: [createErrorContainer("Wrong Voice Channel", `Bot is in <#${existingQ2.voiceChannelId}>.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true;
        }
        const src = musicDetectSource(input);
        let track;
        if (src === "spotify") { track = await resolveSpotifyTrack(input, config); if (!track) throw new Error("Could not resolve Spotify track."); }
        else if (src === "youtube" || src === "soundcloud") { const r = await lavalinkResolve(input); if (!r) throw new Error("Could not load URL."); const lt = r.tracks[0]; if (!lt) throw new Error("No results."); track = { title: lt.info.title || "Unknown", artist: lt.info.author || lt.info.artist || "", url: lt.info.uri, duration: Math.floor((lt.info.length || 0) / 1000), source: src, encoded: lt.encoded, _llTrack: lt }; }
        else { track = await lavalinkSearchOne(input, "ytsearch"); if (!track) throw new Error("No results found."); }
        track.requestedBy = msg.author.username;
        const q = await musicJoinAndSetup(guildId, voiceCh, msg.channel);
        if (!q.current && q.tracks.length === 0 && !q.sessionOwnerId) q.sessionOwnerId = msg.author.id;
        if (!q.current && q.tracks.length === 0) {
          q.tracks.push(track); lmPn?.delete().catch(() => {}); await musicPlayNext(guildId);
        } else {
          q.tracks.unshift(track); lmPn?.delete().catch(() => {});
          await msg.reply({ components: [createSuccessContainer("Up Next", `${trackLink(track)} added to play **next**.\n-# ${msg.author.username}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
        }
      } catch (err) { lmPn?.delete().catch(() => {}); await msg.reply({ components: [createErrorContainer("Search Failed", err.message)], flags: MessageFlags.IsComponentsV2 }); }
      return true;
    }

    // ── CLEAR ────────────────────────────────────────────────────────────────
    case "clear": {
      const q = musicGetQueue(guildId);
      if (!q?.tracks?.length) { await msg.reply({ components: [createErrorContainer("Empty Queue", "No queued tracks to clear.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const count = q.tracks.length; q.tracks.length = 0;
      saveQueue(guildId);
      await msg.reply({ components: [createSuccessContainer("Queue Cleared", `Removed **${count} track${count !== 1 ? "s" : ""}** from the queue.\n-# Currently playing track is unaffected · ${msg.author.username}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── SKIPTO ───────────────────────────────────────────────────────────────
    case "skipto": {
      const q   = musicGetQueue(guildId); const pos = parseInt(args[0]);
      if (!q?.tracks?.length) { await msg.reply({ components: [createErrorContainer("Empty Queue", "No tracks to skip to.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (isNaN(pos) || pos < 1 || pos > q.tracks.length) { await msg.reply({ components: [createErrorContainer("Invalid Position", `Between 1 and ${q.tracks.length}.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      q.tracks.splice(0, pos - 1);
      if (q.loop === "track") q.loop = "off";
      await q.player.stopTrack();
      await msg.reply({ components: [createSuccessContainer("Skipped To", `Skipping to **#${pos}** — **${q.tracks[0]?.title || "Unknown"}**.\n-# ${msg.author.username}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── HISTORY ──────────────────────────────────────────────────────────────
    case "history": {
      const q    = musicGetQueue(guildId);
      const hist = q?.history || [];
      if (!hist.length) { await msg.reply({ components: [createErrorContainer("No History", "No tracks played this session.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const lines = hist.slice(0, 10).map((t, i) => `\`${i + 1}.\` **${t.title}** · \`${musicFmtDuration(t.duration)}\``).join("\n");
      const hc = new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Recently Played`)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true)).addTextDisplayComponents(t => t.setContent(lines)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents(t => t.setContent(`-# Last ${hist.slice(0, 10).length} tracks this session`));
      await msg.reply({ components: [hc], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── LYRICS ───────────────────────────────────────────────────────────────
    case "lyrics": {
      const q     = musicGetQueue(guildId);
      const request = parseLyricsRequest(input, q?.current);
      const query = request.query;
      if (!query) { await msg.reply({ components: [createErrorContainer("Nothing Playing", `Provide a song name or start playing.\nUsage: \`${PREFIX}lyrics <song name> - <artist> [english|hinglish]\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const searchMsg = await msg.channel.send({ components: [new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`${MUSIC_SEARCH} Fetching lyrics...`)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents(t => t.setContent(`-# Target: ${query} | Language: ${lyricLanguageLabel(request.language)}`))], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      try {
        const cleanQuery = normalizeLyricsQuery(query);
        const result = await fetchLyricsMultiSource(query);
        const rawLyrics = result?.lyrics || null;
        searchMsg?.delete().catch(() => {});
        if (!rawLyrics) { await msg.reply({ components: [createErrorContainer("No Lyrics Found", `Tried Musixmatch, Genius, lrclib, and lyrics.ovh for **${query}**.\n-# Try: \`${PREFIX}lyrics song name - artist english\` or \`${PREFIX}lyrics song name - artist hinglish\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        const lyrics = await translateLyricsIfNeeded(rawLyrics, request.language);
        const lyricsPages = splitLyricsPages(lyrics);
        const resultTitle = result?.title && normalizeLyricsQuery(result.title) !== cleanQuery ? result.title : request.displayTitle || result?.title || cleanQuery;
        const resultArtist = request.displayArtist || result?.artist || "";
        const displayTitle = `**${resultTitle || "Lyrics"}**${resultArtist ? ` - *${resultArtist}*` : ""}\n-# Language: ${lyricLanguageLabel(request.language)}${result?.source ? ` | Source: ${result.source}` : ""}`;
        const isCurrentTrack = q?.current && (!input || q.current.title.toLowerCase().includes(cleanQuery.toLowerCase()) || cleanQuery.toLowerCase().includes(q.current.title.toLowerCase().slice(0, 10)));
        const hasLive = isCurrentTrack && q?.syncedLyrics?.length > 0;
        pendingLyrics.set(guildId, { pages: lyricsPages, page: 0, displayTitle, hasLive });
        const lc = buildLyricsPageContainer(lyricsPages, 0, displayTitle, guildId, hasLive);
        const sentLyricsMsg = await msg.reply({ components: [lc], flags: MessageFlags.IsComponentsV2 });
        if (typeof createPanel === "function") {
          createPanel({
            message: sentLyricsMsg,
            ownerId: msg.author.id,
            command: "music:lyrics",
            type: "music",
            meta: { onExpire: () => pendingLyrics.delete(guildId) },
          });
        }
        if (isCurrentTrack && q && !hasLive && q.syncedLyrics === undefined) {
          ;(async () => {
            try {
              for (let i = 0; i < 10; i++) {
                await new Promise(r => setTimeout(r, 500));
                const cur = musicGetQueue(guildId);
                if (!cur?.current || cur.destroyed) return;
                if (cur.syncedLyrics?.length) {
                  const session = pendingLyrics.get(guildId);
                  if (session) {
                    session.hasLive = true;
                    const updated = buildLyricsPageContainer(session.pages, session.page, session.displayTitle, guildId, true);
                    await sentLyricsMsg.edit({ components: [updated], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
                  }
                  return;
                }
                if (cur.syncedLyrics === null) return;
              }
            } catch { /* silent */ }
          })();
        }
      } catch (err) { searchMsg?.delete().catch(() => {}); await msg.reply({ components: [createErrorContainer("Lyrics Error", err.message)], flags: MessageFlags.IsComponentsV2 }); }
      return true;
    }

    // ── FILTERS ──────────────────────────────────────────────────────────────
    case "nightcore":    { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.nightcore=!q.filters.nightcore; if(q.filters.nightcore){q.filters.vaporwave=false;q.filters.slowmo=false;} await applyFilters(q); await msg.reply({components:[createSuccessContainer("Nightcore",`${q.filters.nightcore?"**Nightcore ON**":"**Nightcore OFF**"}\n-# Toggled by ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "vaporwave":    { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.vaporwave=!q.filters.vaporwave; if(q.filters.vaporwave){q.filters.nightcore=false;q.filters.slowmo=false;} await applyFilters(q); await msg.reply({components:[createSuccessContainer("Vaporwave",`${q.filters.vaporwave?"**Vaporwave ON**":"**Vaporwave OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "slowmo":       { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.slowmo=!q.filters.slowmo; if(q.filters.slowmo){q.filters.nightcore=false;q.filters.vaporwave=false;} await applyFilters(q); await msg.reply({components:[createSuccessContainer("Slow Mo",`${q.filters.slowmo?"**Slow Mo ON**":"**Slow Mo OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "vibrato":      { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.vibrato=!q.filters.vibrato; await applyFilters(q); await msg.reply({components:[createSuccessContainer("Vibrato",`${q.filters.vibrato?"**Vibrato ON**":"**Vibrato OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "lowpass":      { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.lowpass=!q.filters.lowpass; await applyFilters(q); await msg.reply({components:[createSuccessContainer("Low Pass",`${q.filters.lowpass?"**Low Pass ON**":"**Low Pass OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "normalization":{ const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.normalization=!q.filters.normalization; await applyFilters(q); await msg.reply({components:[createSuccessContainer("Normalization",`${q.filters.normalization?"**Normalization ON**":"**Normalization OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "soft":         { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.soft=!q.filters.soft; if(q.filters.soft)q.filters.tv=false; await applyFilters(q); await msg.reply({components:[createSuccessContainer("Soft EQ",`${q.filters.soft?"**Soft EQ ON**":"**Soft EQ OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "tv":           { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.tv=!q.filters.tv; if(q.filters.tv)q.filters.soft=false; await applyFilters(q); await msg.reply({components:[createSuccessContainer("TV EQ",`${q.filters.tv?"**TV EQ ON**":"**TV EQ OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "bassboost":    { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.bassboost=!q.filters.bassboost; if(q.filters.bassboost){q.filters.soft=q.filters.tv=q.filters.treble=q.filters.pop=q.filters.rock=q.filters.jazz=false;} await applyFilters(q); await msg.reply({components:[createSuccessContainer("Bass Boost",`${q.filters.bassboost?"**Bass Boost ON**":"**Bass Boost OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "treble":       { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.treble=!q.filters.treble; if(q.filters.treble){q.filters.soft=q.filters.tv=q.filters.bassboost=q.filters.pop=q.filters.rock=q.filters.jazz=false;} await applyFilters(q); await msg.reply({components:[createSuccessContainer("Treble",`${q.filters.treble?"**Treble ON**":"**Treble OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "pop":          { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.pop=!q.filters.pop; if(q.filters.pop){q.filters.soft=q.filters.tv=q.filters.bassboost=q.filters.treble=q.filters.rock=q.filters.jazz=false;} await applyFilters(q); await msg.reply({components:[createSuccessContainer("Pop EQ",`${q.filters.pop?"**Pop EQ ON**":"**Pop EQ OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "rock":         { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.rock=!q.filters.rock; if(q.filters.rock){q.filters.soft=q.filters.tv=q.filters.bassboost=q.filters.treble=q.filters.pop=q.filters.jazz=false;} await applyFilters(q); await msg.reply({components:[createSuccessContainer("Rock EQ",`${q.filters.rock?"**Rock EQ ON**":"**Rock EQ OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "jazz":         { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.jazz=!q.filters.jazz; if(q.filters.jazz){q.filters.soft=q.filters.tv=q.filters.bassboost=q.filters.treble=q.filters.pop=q.filters.rock=false;} await applyFilters(q); await msg.reply({components:[createSuccessContainer("Jazz EQ",`${q.filters.jazz?"**Jazz EQ ON**":"**Jazz EQ OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "8d":           { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.rotation=!q.filters.rotation; await applyFilters(q); await msg.reply({components:[createSuccessContainer("8D Audio",`${q.filters.rotation?"**8D Audio ON**":"**8D Audio OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "karaoke":      { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.karaoke=!q.filters.karaoke; await applyFilters(q); await msg.reply({components:[createSuccessContainer("Karaoke",`${q.filters.karaoke?"**Karaoke ON**":"**Karaoke OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "distortion":   { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.distortion=!q.filters.distortion; await applyFilters(q); await msg.reply({components:[createSuccessContainer("Distortion",`${q.filters.distortion?"**Distortion ON**":"**Distortion OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "mono":         { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.mono=!q.filters.mono; await applyFilters(q); await msg.reply({components:[createSuccessContainer("Mono",`${q.filters.mono?"**Mono ON**":"**Mono OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }

    case "speed": {
      const q = musicGetQueue(guildId); const speed = parseFloat(args[0]);
      if (!q?.current) { await msg.reply({ components: [createErrorContainer("Nothing Playing", "Start playing first.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (isNaN(speed) || speed < 0.1 || speed > 3.0) { await msg.reply({ components: [createErrorContainer("Invalid Speed", `Current: \`${q.filters.speed}x\`\nUsage: \`${PREFIX}speed <0.1–3.0>\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      q.filters.nightcore = q.filters.vaporwave = q.filters.slowmo = false; q.filters.speed = speed;
      await applyFilters(q);
      const speedBar = "█".repeat(Math.round(speed / 3.0 * 20)).padEnd(20, "░");
      await msg.reply({ components: [createSuccessContainer("Playback Speed", `**Speed set to \`${speed}x\`**\n\`${speedBar.slice(0, 20)}\`\n-# ${msg.author.username}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    case "pitch": {
      const q = musicGetQueue(guildId); const st = parseFloat(args[0]);
      if (!q?.current) { await msg.reply({ components: [createErrorContainer("Nothing Playing", "Start playing first.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (isNaN(st) || st < -5 || st > 5) { await msg.reply({ components: [createErrorContainer("Invalid Pitch", `Current: \`${q.filters.pitch > 0 ? "+" : ""}${q.filters.pitch}st\`\nUsage: \`${PREFIX}pitch <-5 to +5>\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      q.filters.pitch = st; await applyFilters(q);
      await msg.reply({ components: [createSuccessContainer("Pitch", `Pitch ${st === 0 ? "reset to normal" : `${st > 0 ? "+" : ""}${st} semitones`}.\n-# ${msg.author.username}`)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    case "resetfilters": {
      const q = musicGetQueue(guildId);
      if (!q?.current) { await msg.reply({ components: [createErrorContainer("Nothing Playing", "No active session.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const wasActive = listActiveFilters(q.filters);
      for (const key of Object.keys(q.filters)) q.filters[key] = typeof q.filters[key] === "boolean" ? false : (key === "speed" ? 1.0 : 0);
      await applyFilters(q);
      await msg.reply({ components: [createSuccessContainer("Filters Reset", wasActive.length ? `Cleared: **${wasActive.join(", ")}**.\n-# ${msg.author.username}` : `No filters were active.\n-# ${msg.author.username}`)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    case "filters": {
      const q = musicGetQueue(guildId);
      if (!q?.current) { await msg.reply({ components: [createErrorContainer("Nothing Playing", "No active session.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const active = listActiveFilters(q.filters);
      const fc = new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Active Filters`)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true)).addTextDisplayComponents(t => t.setContent(active.length ? active.map(f => `${STATUS.tick} **${f}**`).join("\n") : `${STATUS.cross} *No filters active.*`)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents(t => t.setContent(`-# Use \`${PREFIX}resetfilters\` to clear all`));
      await msg.reply({ components: [fc], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── EXTENDED FILTERS ──────────────────────────────────────────────────────
    case "slow":
    case "slowmo": { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.slowmo=!q.filters.slowmo; if(q.filters.slowmo){q.filters.nightcore=false;q.filters.vaporwave=false;q.filters.doubletime=false;q.filters.daycore=false;} await applyFilters(q); await msg.reply({components:[createSuccessContainer("Slow Mo",`${q.filters.slowmo?"**Slow Mo ON**":"**Slow Mo OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "clearfilter":
    case "equalizer": { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","No active session.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} const wasActive=listActiveFilters(q.filters); for(const key of Object.keys(q.filters)) q.filters[key]=typeof q.filters[key]==="boolean"?false:(key==="speed"?1.0:0); await applyFilters(q); await msg.reply({components:[createSuccessContainer("Filters Cleared",wasActive.length?`Cleared: **${wasActive.join(", ")}**.\n-# ${msg.author.username}`:`No filters were active.\n-# ${msg.author.username}`)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "bass":        { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.bass=!q.filters.bass; if(q.filters.bass){q.filters.bassboost=false;q.filters.treblebass=false;q.filters.soft=q.filters.tv=q.filters.treble=q.filters.pop=q.filters.rock=q.filters.jazz=false;} await applyFilters(q); await msg.reply({components:[createSuccessContainer("Bass",`${q.filters.bass?"**Bass ON**":"**Bass OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "chimpunk":    { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.chimpunk=!q.filters.chimpunk; if(q.filters.chimpunk){q.filters.nightcore=false;q.filters.vaporwave=false;q.filters.slowmo=false;q.filters.darthvader=false;q.filters.daycore=false;q.filters.doubletime=false;q.filters.lofi=false;q.filters.party=false;} await applyFilters(q); await msg.reply({components:[createSuccessContainer("Chipmunk",`${q.filters.chimpunk?"**Chipmunk ON**":"**Chipmunk OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "china":       { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.china=!q.filters.china; if(q.filters.china){q.filters.soft=q.filters.tv=q.filters.bassboost=q.filters.bass=q.filters.treble=q.filters.pop=q.filters.rock=q.filters.jazz=q.filters.electronic=q.filters.lofi=q.filters.treblebass=q.filters.party=false;} await applyFilters(q); await msg.reply({components:[createSuccessContainer("China",`${q.filters.china?"**China ON**":"**China OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "darthvader":  { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.darthvader=!q.filters.darthvader; if(q.filters.darthvader){q.filters.nightcore=false;q.filters.vaporwave=false;q.filters.slowmo=false;q.filters.chimpunk=false;q.filters.daycore=false;q.filters.doubletime=false;q.filters.lofi=false;q.filters.party=false;} await applyFilters(q); await msg.reply({components:[createSuccessContainer("Darth Vader",`${q.filters.darthvader?"**Darth Vader ON**":"**Darth Vader OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "daycore":     { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.daycore=!q.filters.daycore; if(q.filters.daycore){q.filters.nightcore=false;q.filters.vaporwave=false;q.filters.slowmo=false;q.filters.chimpunk=false;q.filters.darthvader=false;q.filters.doubletime=false;q.filters.lofi=false;q.filters.party=false;} await applyFilters(q); await msg.reply({components:[createSuccessContainer("Daycore",`${q.filters.daycore?"**Daycore ON**":"**Daycore OFF**"}\n-# Slower + lower pitch · ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "doubletime":  { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.doubletime=!q.filters.doubletime; if(q.filters.doubletime){q.filters.nightcore=false;q.filters.vaporwave=false;q.filters.slowmo=false;q.filters.chimpunk=false;q.filters.darthvader=false;q.filters.daycore=false;q.filters.lofi=false;q.filters.party=false;} await applyFilters(q); await msg.reply({components:[createSuccessContainer("Double Time",`${q.filters.doubletime?"**Double Time ON**":"**Double Time OFF**"}\n-# 2× speed · ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "earrape":     { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.earrape=!q.filters.earrape; await applyFilters(q); await msg.reply({components:[createSuccessContainer("Earrape",`${q.filters.earrape?"**Earrape ON** 💀":"**Earrape OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "electronic":  { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.electronic=!q.filters.electronic; if(q.filters.electronic){q.filters.soft=q.filters.tv=q.filters.bassboost=q.filters.bass=q.filters.treble=q.filters.pop=q.filters.rock=q.filters.jazz=q.filters.china=q.filters.lofi=q.filters.treblebass=q.filters.party=false;} await applyFilters(q); await msg.reply({components:[createSuccessContainer("Electronic",`${q.filters.electronic?"**Electronic ON**":"**Electronic OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "lofi":        { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.lofi=!q.filters.lofi; if(q.filters.lofi){q.filters.nightcore=false;q.filters.vaporwave=false;q.filters.slowmo=false;q.filters.chimpunk=false;q.filters.darthvader=false;q.filters.daycore=false;q.filters.doubletime=false;q.filters.party=false; q.filters.soft=q.filters.tv=q.filters.bassboost=q.filters.bass=q.filters.treble=q.filters.pop=q.filters.rock=q.filters.jazz=q.filters.china=q.filters.electronic=q.filters.treblebass=false;} await applyFilters(q); await msg.reply({components:[createSuccessContainer("Lofi",`${q.filters.lofi?"**Lofi ON**":"**Lofi OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "party":       { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.party=!q.filters.party; if(q.filters.party){q.filters.nightcore=false;q.filters.vaporwave=false;q.filters.slowmo=false;q.filters.chimpunk=false;q.filters.darthvader=false;q.filters.daycore=false;q.filters.doubletime=false;q.filters.lofi=false; q.filters.soft=q.filters.tv=q.filters.bassboost=q.filters.bass=q.filters.treble=q.filters.pop=q.filters.rock=q.filters.jazz=q.filters.china=q.filters.electronic=q.filters.treblebass=false;} await applyFilters(q); await msg.reply({components:[createSuccessContainer("Party",`${q.filters.party?"**Party ON** 🎉":"**Party OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "ratemusic": {
      const q = musicGetQueue(guildId); const rate = parseFloat(args[0]);
      if (!q?.current) { await msg.reply({ components: [createErrorContainer("Nothing Playing", "Start playing first.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (isNaN(rate) || rate < 0.1 || rate > 5.0) { await msg.reply({ components: [createErrorContainer("Invalid Rate", `Usage: \`${PREFIX}ratemusic <0.1–5.0>\`\n-# Changes playback rate without altering pitch`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      q.filters.nightcore = q.filters.vaporwave = q.filters.slowmo = q.filters.chimpunk = q.filters.darthvader = q.filters.daycore = q.filters.doubletime = q.filters.lofi = q.filters.party = false;
      // Store rate in speed slot and apply a pure timescale rate change
      q.filters.speed = rate;
      await applyFilters(q);
      await msg.reply({ components: [createSuccessContainer("Playback Rate", `Rate set to **\`${rate}x\`**\n-# Pitch unchanged · ${msg.author.username}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }
    case "treblebass":  { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.treblebass=!q.filters.treblebass; if(q.filters.treblebass){q.filters.soft=q.filters.tv=q.filters.bassboost=q.filters.bass=q.filters.treble=q.filters.pop=q.filters.rock=q.filters.jazz=q.filters.china=q.filters.electronic=q.filters.lofi=q.filters.party=false;} await applyFilters(q); await msg.reply({components:[createSuccessContainer("Treblebass",`${q.filters.treblebass?"**Treblebass ON**":"**Treblebass OFF**"}\n-# Bass + Treble boost · ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }
    case "tremolo":     { const q=musicGetQueue(guildId); if(!q?.current){await msg.reply({components:[createErrorContainer("Nothing Playing","Start playing first.", guildColor)],flags:MessageFlags.IsComponentsV2});return true;} q.filters.tremolo=!q.filters.tremolo; await applyFilters(q); await msg.reply({components:[createSuccessContainer("Tremolo",`${q.filters.tremolo?"**Tremolo ON**":"**Tremolo OFF**"}\n-# ${msg.author.username}`, guildColor)],flags:MessageFlags.IsComponentsV2}); return true; }

    // ── LIKED SONGS ───────────────────────────────────────────────────────────
    case "like": {
      const q = musicGetQueue(guildId);
      if (!q?.current) { await msg.reply({ components: [createErrorContainer("Nothing Playing", "Nothing is currently playing to like.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const db2 = msg.client._db || {};
      if (!db2.likedSongs) db2.likedSongs = {};
      const uid = msg.author.id;
      if (!db2.likedSongs[uid]) db2.likedSongs[uid] = [];
      const ct = q.current;
      const already = db2.likedSongs[uid].find(t => t.url === ct.url);
      if (already) { await msg.reply({ components: [createErrorContainer("Already Liked", `**${ct.title}** is already in your liked songs.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (db2.likedSongs[uid].length >= 500) { await msg.reply({ components: [createErrorContainer("Liked Songs Full", "Max 500 liked songs. Use `clearliked` to free up space.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      db2.likedSongs[uid].push({ title: ct.title, url: ct.url, duration: ct.duration, source: ct.source, searchStr: ct.searchStr, likedAt: Date.now() });
      try { const fs = require("fs"); require("../../utils/redisDatabase").requestSave(); } catch {}
      await msg.reply({ components: [createSuccessContainer("Liked!", `Added **${ct.title}** to your liked songs.\n-# ${db2.likedSongs[uid].length}/500 liked songs`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }
    case "showliked": {
      const db2 = msg.client._db || {};
      const uid = msg.author.id;
      const liked = db2.likedSongs?.[uid] || [];
      if (!liked.length) { await msg.reply({ components: [createErrorContainer("No Liked Songs", `Like the current song with \`${PREFIX}like\`.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const page = Math.max(1, parseInt(args[0]) || 1);
      const PER = 15;
      const totalPages = Math.ceil(liked.length / PER);
      const pageItems = liked.slice((page - 1) * PER, page * PER);
      const lines = pageItems.map((t, i) => `\`${(page - 1) * PER + i + 1}.\` **${t.title}** · \`${musicFmtDuration(t.duration)}\``).join("\n");
      const totalDur = liked.reduce((a, t) => a + (t.duration || 0), 0);
      const lc = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} ${msg.author.username}'s Liked Songs`))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(t => t.setContent(lines))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(t => t.setContent(`-# ${liked.length} tracks · Total: ${musicFmtDuration(totalDur)} · Page ${page}/${totalPages}`));
      await msg.reply({ components: [lc], flags: MessageFlags.IsComponentsV2 });
      return true;
    }
    case "playliked": {
      if (!voiceCh) { await msg.reply({ components: [createErrorContainer("Not in Voice", "Join a voice channel first.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const db2 = msg.client._db || {};
      const uid = msg.author.id;
      const liked = db2.likedSongs?.[uid] || [];
      if (!liked.length) { await msg.reply({ components: [createErrorContainer("No Liked Songs", `Like songs with \`${PREFIX}like\` first.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const lm = await msg.channel.send({ components: [new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`${MUSIC_EMOJI_ICON} Loading **${liked.length} liked songs**...`))], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      const existingQ = musicGetQueue(guildId);
      if (existingQ?.player && existingQ.voiceChannelId && voiceCh?.id !== existingQ.voiceChannelId) {
        lm?.delete().catch(() => {}); await msg.reply({ components: [createErrorContainer("Wrong Voice Channel", `Bot is in <#${existingQ.voiceChannelId}>.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true;
      }
      const q = await musicJoinAndSetup(guildId, voiceCh, msg.channel);
      const wasIdle = !q.current && q.tracks.length === 0;
      if (wasIdle && !q.sessionOwnerId) q.sessionOwnerId = msg.author.id;
      // Shuffle liked songs for variety
      const shuffled = [...liked].sort(() => Math.random() - 0.5);
      shuffled.forEach(t => q.tracks.push({ ...t, requestedBy: msg.author.username }));
      lm?.delete().catch(() => {});
      if (wasIdle) await musicPlayNext(guildId);
      else await msg.reply({ components: [createSuccessContainer("Liked Songs Loaded", `Queued **${liked.length} liked tracks** (shuffled)!\n-# Use \`${PREFIX}loop queue\` to keep it going.`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }
    case "clearliked": {
      const db2 = msg.client._db || {};
      const uid = msg.author.id;
      const liked = db2.likedSongs?.[uid] || [];
      if (!liked.length) { await msg.reply({ components: [createErrorContainer("Nothing to Clear", "Your liked songs list is already empty.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const count = liked.length;
      db2.likedSongs[uid] = [];
      try { const fs = require("fs"); require("../../utils/redisDatabase").requestSave(); } catch {}
      await msg.reply({ components: [createSuccessContainer("Cleared", `Removed all **${count}** liked songs.\n-# ${msg.author.username}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── pl-* SHORTHANDS ───────────────────────────────────────────────────────
    case "pl-create":       return handleMusicCommand("playlist", ["create",  ...args],        msg, PREFIX, config);
    case "pl-delete":       return handleMusicCommand("playlist", ["delete",  ...args],        msg, PREFIX, config);
    case "pl-list":         return handleMusicCommand("playlist", ["list",    ...args],        msg, PREFIX, config);
    case "pl-info":         return handleMusicCommand("playlist", ["view",    ...args],        msg, PREFIX, config);
    case "pl-add":          return handleMusicCommand("playlist", ["add",     ...args],        msg, PREFIX, config);
    case "pl-addnowplaying":return handleMusicCommand("playlist", ["addcurrent", ...args],    msg, PREFIX, config);
    case "pl-remove":       return handleMusicCommand("playlist", ["removetrack", ...args],   msg, PREFIX, config);
    case "pl-load":         return handleMusicCommand("playlist", ["play",    ...args],        msg, PREFIX, config);
    case "pl-addqueue": {
      const q = musicGetQueue(guildId);
      if (!q?.tracks?.length && !q?.current) { await msg.reply({ components: [createErrorContainer("Empty Queue", "No songs in the queue to add.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const db2 = msg.client._db || {}; if (!db2.playlists) db2.playlists = {};
      const uid2 = msg.author.id; if (!db2.playlists[uid2]) db2.playlists[uid2] = {};
      const userPls2 = db2.playlists[uid2];
      const plName2 = args.join(" ").trim().toLowerCase();
      if (!plName2 || !userPls2[plName2]) { await msg.reply({ components: [createErrorContainer("Playlist Not Found", `Usage: \`${PREFIX}pl-addqueue <playlist name>\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const qTracks = [...(q.current ? [q.current] : []), ...q.tracks];
      const available = 200 - userPls2[plName2].tracks.length;
      if (available <= 0) { await msg.reply({ components: [createErrorContainer("Playlist Full", "Max 200 tracks.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const toAdd = qTracks.slice(0, available);
      toAdd.forEach(t => userPls2[plName2].tracks.push({ title: t.title, url: t.url, duration: t.duration, source: t.source, searchStr: t.searchStr }));
      try { const fs = require("fs"); require("../../utils/redisDatabase").requestSave(); } catch {}
      await msg.reply({ components: [createSuccessContainer("Queue Added", `Added **${toAdd.length}** tracks to **${userPls2[plName2].name}**.\n-# ${userPls2[plName2].tracks.length}/200 tracks`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }
    case "pl-dupes": {
      const db2 = msg.client._db || {}; if (!db2.playlists) db2.playlists = {};
      const uid2 = msg.author.id; if (!db2.playlists[uid2]) db2.playlists[uid2] = {};
      const userPls2 = db2.playlists[uid2];
      const plName2 = args.join(" ").trim().toLowerCase();
      if (!plName2 || !userPls2[plName2]) { await msg.reply({ components: [createErrorContainer("Playlist Not Found", `Usage: \`${PREFIX}pl-dupes <playlist name>\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const pl2 = userPls2[plName2];
      const before = pl2.tracks.length;
      const seen = new Set();
      pl2.tracks = pl2.tracks.filter(t => { const key = t.url || t.title; if (seen.has(key)) return false; seen.add(key); return true; });
      const removed = before - pl2.tracks.length;
      try { const fs = require("fs"); require("../../utils/redisDatabase").requestSave(); } catch {}
      await msg.reply({ components: [createSuccessContainer("Duplicates Removed", removed ? `Removed **${removed}** duplicate${removed !== 1 ? "s" : ""} from **${pl2.name}**.\n-# ${pl2.tracks.length} tracks remain.` : `No duplicates found in **${pl2.name}**.`)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── DJ / MODERATION ───────────────────────────────────────────────────────
    case "voteskip": {
      const q = musicGetQueue(guildId);
      if (!q?.current) { await msg.reply({ components: [createErrorContainer("Nothing Playing", "Nothing to vote-skip.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const gs2       = db?.guildSettings?.[guildId] || {};
      const skipRatio = gs2.skipRatio ?? 0.5;
      const botVC     = msg.guild.channels.cache.get(q.voiceChannelId);
      const humanCount = botVC?.members?.filter(m => !m.user.bot).size ?? 1;
      const needed    = Math.max(1, Math.ceil(humanCount * skipRatio));
      if (!voteskipSessions.has(guildId)) voteskipSessions.set(guildId, new Set());
      const votes = voteskipSessions.get(guildId);
      votes.add(msg.author.id);
      if (votes.size >= needed) {
        voteskipSessions.delete(guildId);
        if (q.loop === "track") q.loop = "off";
        await q.player.stopTrack();
        await msg.reply({ components: [createSuccessContainer("Vote Skip", `Skipped **${q.current.title}**!\n-# **${votes.size}/${humanCount}** voted · threshold ${Math.round(skipRatio * 100)}%`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      } else {
        await msg.reply({ components: [createSuccessContainer("Vote Registered", `Your vote was counted: **${votes.size}/${needed}** needed.\n-# ${msg.author.username} voted to skip **${q.current.title}**`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      }
      return true;
    }

    case "skipratio": {
      if (!msg.member?.permissions?.has("ManageGuild")) { await msg.reply({ components: [createErrorContainer("No Permission", "You need **Manage Server**.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const pct = parseFloat(args[0]);
      if (isNaN(pct) || pct < 10 || pct > 100) { await msg.reply({ components: [createErrorContainer("Invalid Ratio", `10–100.\nUsage: \`${PREFIX}skipratio 50\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (!db.guildSettings) db.guildSettings = {};
      if (!db.guildSettings[guildId]) db.guildSettings[guildId] = {};
      db.guildSettings[guildId].skipRatio = pct / 100;
      try { const fs = require("fs"); require("../../utils/redisDatabase").requestSave(); } catch {}
      await msg.reply({ components: [createSuccessContainer("Skip Ratio Set", `Vote-skip threshold set to **${pct}%**.\n-# ${msg.author.username}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    case "djrole": {
      if (!msg.member?.permissions?.has("ManageGuild")) { await msg.reply({ components: [createErrorContainer("No Permission", "You need **Manage Server**.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (!db.guildSettings) db.guildSettings = {};
      if (!db.guildSettings[guildId]) db.guildSettings[guildId] = {};
      if (!args[0] || args[0].toLowerCase() === "clear") {
        delete db.guildSettings[guildId].djRole;
        try { const fs = require("fs"); require("../../utils/redisDatabase").requestSave(); } catch {}
        await msg.reply({ components: [createSuccessContainer("DJ Role Cleared", `Anyone can now control music.\n-# ${msg.author.username}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }
      const role = msg.mentions.roles.first() || msg.guild.roles.cache.get(args[0]);
      if (!role) { await msg.reply({ components: [createErrorContainer("Role Not Found", `Mention a role or provide its ID.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      db.guildSettings[guildId].djRole = role.id;
      try { const fs = require("fs"); require("../../utils/redisDatabase").requestSave(); } catch {}
      await msg.reply({ components: [createSuccessContainer("DJ Role Set", `Music restricted to **${role.name}** and Manage Server.\n-# ${msg.author.username}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    case "lockchannel": {
      if (!msg.member?.permissions?.has("ManageGuild")) { await msg.reply({ components: [createErrorContainer("No Permission", "You need **Manage Server**.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (!db.guildSettings) db.guildSettings = {};
      if (!db.guildSettings[guildId]) db.guildSettings[guildId] = {};
      const currently = db.guildSettings[guildId].musicChannel;
      if (currently === msg.channel.id) {
        delete db.guildSettings[guildId].musicChannel;
        try { const fs = require("fs"); require("../../utils/redisDatabase").requestSave(); } catch {}
        await msg.reply({ components: [createSuccessContainer("Channel Unlocked", `Music commands can now be used in any channel.\n-# ${msg.author.username}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      } else {
        db.guildSettings[guildId].musicChannel = msg.channel.id;
        try { const fs = require("fs"); require("../../utils/redisDatabase").requestSave(); } catch {}
        await msg.reply({ components: [createSuccessContainer("Channel Locked", `Music commands locked to ${msg.channel}.\n-# Run again to unlock · ${msg.author.username}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
      }
      return true;
    }

    case "restrict": {
      if (!msg.member?.permissions?.has("ManageGuild")) { await msg.reply({ components: [createErrorContainer("No Permission", "You need **Manage Server**.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (!db.guildSettings) db.guildSettings = {};
      if (!db.guildSettings[guildId]) db.guildSettings[guildId] = {};
      if (!db.guildSettings[guildId].restricted) db.guildSettings[guildId].restricted = [];
      const restricted2 = db.guildSettings[guildId].restricted;
      const target = args[0]?.toLowerCase();
      if (!target || target === "list") {
        const list = restricted2.length ? restricted2.map(c => `\`${PREFIX}${c}\``).join(", ") : "*none*";
        await msg.reply({ components: [createSuccessContainer("Restricted Commands", `Currently restricted: ${list}`, guildColor)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }
      const idx = restricted2.indexOf(target);
      if (idx === -1) { restricted2.push(target); try { const fs = require("fs"); require("../../utils/redisDatabase").requestSave(); } catch {} await msg.reply({ components: [createSuccessContainer("Command Restricted", `\`${PREFIX}${target}\` is now **disabled**.\n-# ${msg.author.username}`, guildColor)], flags: MessageFlags.IsComponentsV2 }); }
      else            { restricted2.splice(idx, 1); try { const fs = require("fs"); require("../../utils/redisDatabase").requestSave(); } catch {} await msg.reply({ components: [createSuccessContainer("Command Enabled", `\`${PREFIX}${target}\` is now **enabled**.\n-# ${msg.author.username}`, guildColor)], flags: MessageFlags.IsComponentsV2 }); }
      return true;
    }

    // ── INFO ─────────────────────────────────────────────────────────────────
    case "trackinfo": {
      const q = musicGetQueue(guildId);
      if (!q?.current) { await msg.reply({ components: [createErrorContainer("Nothing Playing", "Nothing is currently playing.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const t2 = q.current; const active2 = listActiveFilters(q.filters);
      const tc = new ContainerBuilder()
        .addTextDisplayComponents(td => td.setContent(`### ${STATUS.info} Track Info`))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(td => td.setContent(`### ${t2.title}`))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(td => td.setContent(
          `${STATUS.tick} **Source:** ${musicSourceLabel(t2.source)}\n${STATUS.tick} **Duration:** \`${musicFmtDuration(t2.duration)}\`\n${STATUS.tick} **Position:** \`${musicFmtDuration(Math.floor((q.player?.position || 0) / 1000))}\`\n${STATUS.tick} **URL:** ${t2.url || "*unavailable*"}\n${STATUS.tick} **Requested by:** ${t2.requestedBy || "Unknown"}\n${STATUS.tick} **Active filters:** ${active2.length ? active2.join(", ") : "None"}\n${STATUS.tick} **Loop:** \`${q.loop}\` · **Volume:** \`${q.volume}%\``
        ));
      await msg.reply({ components: [tc], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    case "search": {
      if (!voiceCh) { await msg.reply({ components: [createErrorContainer("Not in Voice", "Join a voice channel first.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      if (!input)   { await msg.reply({ components: [createErrorContainer("Missing Query", `Usage: \`${PREFIX}search <song name>\``, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const loadMsgS = await msg.channel.send({ components: [new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`${MUSIC_SEARCH} Searching for \`${input}\`...`))], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      try {
        const result = await lavalinkResolve(`ytsearch:${input}`);
        loadMsgS?.delete().catch(() => {});
        if (!result?.tracks?.length) { await msg.reply({ components: [createErrorContainer("No Results", `No results for \`${input}\`.`, guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
        const results   = result.tracks.slice(0, 5);
        const lines     = results.map((t, i) => `\`${i + 1}.\` **${t.info.title || "Unknown"}** · \`${musicFmtDuration(Math.floor((t.info.length || 0) / 1000))}\``).join("\n");
        const searchRow = new ActionRowBuilder().addComponents(
          ...results.map((_, i) => new ButtonBuilder().setCustomId(`music_search_${i + 1}_${guildId}`).setLabel(`${i + 1}`).setStyle(ButtonStyle.Secondary)),
          new ButtonBuilder().setCustomId(`music_search_cancel_${guildId}`).setLabel("Cancel").setStyle(ButtonStyle.Danger),
        );
        const sc = new ContainerBuilder()
          .addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Search Results`))
          .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
          .addTextDisplayComponents(t => t.setContent(lines))
          .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
          .addActionRowComponents(searchRow)
          .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(t => t.setContent(`-# Pick a track · expires in 5 min`));
        const sentMsg = await msg.reply({ components: [sc], flags: MessageFlags.IsComponentsV2 });
        if (typeof createPanel === "function") {
          createPanel({
            message: sentMsg,
            ownerId: msg.author.id,
            command: "music:search",
            type: "music",
            meta: { onExpire: () => pendingSearches.delete(guildId) },
          });
        }
        pendingSearches.set(guildId, { tracks: results, voiceCh, textChannel: msg.channel, userId: msg.author.id });
      } catch (err) { loadMsgS?.delete().catch(() => {}); await msg.reply({ components: [createErrorContainer("Search Error", err.message)], flags: MessageFlags.IsComponentsV2 }); }
      return true;
    }

    case "thumbnail": {
      const q = musicGetQueue(guildId);
      if (!q?.current) { await msg.reply({ components: [createErrorContainer("Nothing Playing", "Nothing is playing.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const t3     = q.current;
      const videoId = t3.url?.match(/[?&]v=([^&]+)/)?.[1] || t3.url?.match(/youtu\.be\/([^?]+)/)?.[1];
      const thumbUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
      if (!thumbUrl) { await msg.reply({ components: [createErrorContainer("No Thumbnail", "Only available for YouTube tracks.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      await msg.reply({ components: [new ContainerBuilder().addTextDisplayComponents(td => td.setContent(`### ${STATUS.info} Thumbnail`)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true)).addTextDisplayComponents(td => td.setContent(`**${t3.title}**\n${thumbUrl}`)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents(td => td.setContent(`-# ${musicSourceLabel(t3.source)} · Requested by ${t3.requestedBy || "Unknown"}`))], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    case "stats": {
      const node      = shoukaku?.getIdealNode();
      const nodeStats = node?.stats;
      const panel = require("../../utils/botStatsPanel").buildBotStatsContainer({
        client,
        config: client?._config || globalThis.config || {},
        db: client?._db || globalThis.db || {},
        requesterId: msg.author.id,
        guildId,
        music: {
          activeQueues: musicQueues.size,
          nodeName: node?.name || null,
          playingPlayers: nodeStats?.playingPlayers,
          nodeUptime: node ? `${Math.floor((nodeStats?.uptime || 0) / 60000)}m` : null,
        },
      });
      await msg.reply({ components: [panel.container], flags: MessageFlags.IsComponentsV2, allowedMentions: panel.allowedMentions });
      return true;
    }

    case "mostplayed": {
      const db3     = msg.client._db || {};
      const guild3  = db3?.mostPlayed?.[guildId] || {};
      const q       = musicGetQueue(guildId);
      const merged  = { ...guild3 };
      if (q?.mostPlayed) for (const [k, v] of Object.entries(q.mostPlayed)) merged[k] = (merged[k] || 0) + v;
      const sorted  = Object.entries(merged).sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (!sorted.length) { await msg.reply({ components: [createErrorContainer("No Data", "No play history for this server.", guildColor)], flags: MessageFlags.IsComponentsV2 }); return true; }
      const lines   = sorted.map(([title, count], i) => `\`${i + 1}.\` **${title}** — played \`${count}×\``).join("\n");
      const mpc = new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Most Played`)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true)).addTextDisplayComponents(t => t.setContent(lines)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents(t => t.setContent(`-# Top ${sorted.length} tracks on this server`));
      await msg.reply({ components: [mpc], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    case "ping": {
      const node3      = shoukaku?.getIdealNode();
      const wsLatency  = msg.client.ws.ping;
      const wsDisplay = Number.isFinite(wsLatency) && wsLatency >= 0 ? `${Math.round(wsLatency)}ms` : "Waiting for heartbeat";
      const deficit    = node3?.stats?.frameStats?.deficit ?? null;
      let redisLatency = null;
      if (msg._isSlashCommand) {
        const elapsed = await getRedisLatency();
        if (elapsed !== null) redisLatency = `${elapsed.toFixed(2)}ms`;
      }
      const redisLine = redisLatency === null ? "" : `\n${STATUS.tick} **Redis:** \`${redisLatency}\``;
      const redisUnavailableLine = msg._isSlashCommand && redisLatency === null ? `\n${STATUS.cross} **Redis:** Unavailable` : "";
      const pc = new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Latency`)).addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true)).addTextDisplayComponents(t => t.setContent(`${STATUS.tick} **Discord WebSocket:** \`${wsDisplay}\`\n${STATUS.tick} **Lavalink node:** \`${node3?.name ?? "none"}\`${deficit !== null ? ` · Frame deficit: \`${deficit}ms\`` : ""}\n${STATUS.tick} **Status:** ${node3 ? `${STATUS.tick} Connected` : `${STATUS.cross} No node`}${redisLine}${redisUnavailableLine}`));
      await msg.reply({ components: [pc], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── ACCESS ───────────────────────────────────────────────────────────────
    // `access`         → show who controls this session
    // `access @user`   → transfer session ownership to that user (owner/admin only)
    case "access": {
      const q = musicGetQueue(guildId);
      if (!q) {
        await msg.reply({ components: [createErrorContainer("No Active Session", "There is no music session running.", guildColor)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }

      const mentionedUser = msg.mentions.users.first();

      // ── Transfer ownership ───────────────────────────────────────────────────
      if (mentionedUser) {
        if (!isSessionController(msg.author.id, msg.member, q)) {
          await msg.reply({
            components: [createErrorContainer(
              "Not Allowed",
              `Only the current session owner (<@${q.sessionOwnerId}>) or a server admin can transfer ownership.\n` +
              `-# Use \`${PREFIX}access\` (no arguments) to see session info.`
            )],
            flags: MessageFlags.IsComponentsV2,
          });
          return true;
        }
        if (mentionedUser.bot) {
          await msg.reply({ components: [createErrorContainer("Invalid User", "You cannot transfer session ownership to a bot.", guildColor)], flags: MessageFlags.IsComponentsV2 });
          return true;
        }
        const prevOwner   = q.sessionOwnerId;
        q.sessionOwnerId  = mentionedUser.id;
        saveQueue(guildId);
        await msg.reply({
          components: [new ContainerBuilder()
            .addTextDisplayComponents(t => t.setContent(`### ${STATUS.success} Ownership Transferred`))
            .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(t => t.setContent(
              `> ${STATUS.tick} Session owner is now <@${mentionedUser.id}>.\n` +
              `-# Transferred by <@${msg.author.id}>${prevOwner && prevOwner !== msg.author.id ? ` (previously <@${prevOwner}>)` : ""}`
            ))],
          flags: MessageFlags.IsComponentsV2,
        });
        return true;
      }

      // ── Info display ─────────────────────────────────────────────────────────
      const owner  = q.sessionOwnerId ? `<@${q.sessionOwnerId}>` : "*(anyone — no owner set)*";
      const isCtrl = isSessionController(msg.author.id, msg.member, q);
      const ac = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Session Access`))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(t => t.setContent(
          `${STATUS.tick} **Session owner:** ${owner}\n` +
          `${STATUS.tick} **Your access:** ${isCtrl ? `${STATUS.success} You can control this session.` : `${STATUS.cross} Read-only — you cannot control playback.`}\n` +
          `${STATUS.tick} **Voice channel:** <#${q.voiceChannelId}>`
        ))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(t => t.setContent(
          `-# ${isCtrl
            ? `Use \`${PREFIX}access @user\` to transfer ownership.`
            : `Ask <@${q.sessionOwnerId ?? "an admin"}> to run \`${PREFIX}access @${msg.author.username}\` to give you control.`}`
        ));
      await msg.reply({ components: [ac], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // ── NODE — reconnect / status for Lavalink nodes (bot owner only) ────────
    case "node": {
      const recovery = getMusicRecovery();
      if (recovery?.execute) {
        return recovery.execute("node", {
          msg,
          args,
          client: msg.client,
          guildId: msg.guild?.id,
          userId: msg.author.id,
        });
      }
      const ownerIds = [
        msg.client._config?.ownerId,
        msg.client._config?.ownerID,
        ...(Array.isArray(msg.client._config?.ownerIds) ? msg.client._config.ownerIds : []),
      ].filter(Boolean).map(String);
      if (!ownerIds.includes(String(msg.author.id))) {
        await msg.reply({ components: [createErrorContainer("Owner Only", "Only the bot owner can manage Lavalink nodes.", guildColor)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }

      const sub = args[0]?.toLowerCase();
      const NODE_STATES = ["Connecting", "Connected", "Disconnected", "Reconnecting", "Disconnecting"];

      // ── node status / list ─────────────────────────────────────────────────
      if (!sub || sub === "status" || sub === "list") {
        const cfgNodes = (msg.client._config?.lavalinkNodes || DEFAULT_LAVALINK_NODES);
        if (!shoukaku) {
          await msg.reply({ components: [createErrorContainer("Lavalink Offline", "Shoukaku is not initialised. Use `node connect` to reconnect.")], flags: MessageFlags.IsComponentsV2 });
          return true;
        }
        const lines = cfgNodes.map(n => {
          const node  = shoukaku.nodes?.get(n.name);
          const state = node ? (NODE_STATES[node.state] ?? `State ${node.state}`) : "Not added";
          const icon  = node?.state === 1 ? STATUS.tick : STATUS.cross;
          const extra = node?.state === 1
            ? ` · Players: \`${node.stats?.playingPlayers ?? 0}\``
            : "";
          return `${icon} \`${n.name}\` — ${state}${extra}`;
        }).join("\n");
        const sc = new ContainerBuilder()
          .addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Lavalink Node Status`))
          .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
          .addTextDisplayComponents(t => t.setContent(lines))
          .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(t => t.setContent(`-# Use \`${PREFIX}node connect\` to reconnect dead nodes`));
        await msg.reply({ components: [sc], flags: MessageFlags.IsComponentsV2 });
        return true;
      }

      // ── node connect / reconnect ───────────────────────────────────────────
      if (sub === "connect" || sub === "reconnect") {
        if (!shoukaku) {
          // Shoukaku never initialised — boot it fresh
          try {
            initShoukaku(msg.client);
            await msg.reply({ components: [createSuccessContainer("Lavalink", "Shoukaku initialised — connecting to nodes now.\n-# Run `node status` in a few seconds to verify.")], flags: MessageFlags.IsComponentsV2 });
          } catch (err) {
            await msg.reply({ components: [createErrorContainer("Init Failed", `Could not initialise Shoukaku: ${redactLavalinkError(err)}`)], flags: MessageFlags.IsComponentsV2 });
          }
          return true;
        }

        // Re-add any dead or missing nodes
        const cfgNodes2 = (msg.client._config?.lavalinkNodes || DEFAULT_LAVALINK_NODES);
        let reconnected = 0, skipped = 0;
        for (const nodeConf of cfgNodes2) {
          const existing = shoukaku.nodes?.get(nodeConf.name);
          if (!existing) {
            try { shoukaku.addNode(nodeConf); reconnected++; } catch { /* ignore */ }
          } else if (existing.state !== 1) {
            try {
              try { shoukaku.removeNode(nodeConf.name); } catch { /* ignore */ }
              shoukaku.addNode(nodeConf);
              reconnected++;
            } catch { /* ignore */ }
          } else {
            skipped++;
          }
        }
        await msg.reply({
          components: [createSuccessContainer(
            "Lavalink Reconnect",
            `Attempted reconnect on **${reconnected}** node(s) · **${skipped}** already connected.\n` +
            `-# Run \`${PREFIX}node status\` in a few seconds to verify.`
          )],
          flags: MessageFlags.IsComponentsV2,
        });
        return true;
      }

      // Unknown sub-command
      await msg.reply({
        components: [createInfoContainer(
          "Node Command",
          `\`${PREFIX}node status\` — Show all node states\n\`${PREFIX}node connect\` — Reconnect dead / missing nodes`
        )],
        flags: MessageFlags.IsComponentsV2,
      });
      return true;
    }

    default:
      return false;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  BUTTON INTERACTION HANDLER
// ═════════════════════════════════════════════════════════════════════════════
async function handleMusicInteraction(interaction) {
  if (!interaction.isButton()) return false;
  const { customId, guildId } = interaction;
  if (!customId.startsWith("music_")) return false;
  const guildColor = getGuildColor(interaction.client, guildId);

  // ── Playlist picker (addtopl) — routes to dedicated handler ──────────────
  if (customId.startsWith("music_addtopl_")) {
    return handleAddToPlaylistInteraction(interaction);
  }

  const parts  = customId.split("_");
  const action = parts[1];
  const lockKey = `${guildId}:${interaction.user.id}:${action}`;
  const lockExpiry = activeMusicInteractionLocks.get(lockKey) || 0;
  if (Date.now() < lockExpiry) {
    await safeDeferUpdate(interaction);
    return true;
  }
  activeMusicInteractionLocks.set(lockKey, Date.now() + 1200);
  setTimeout(() => activeMusicInteractionLocks.delete(lockKey), 1500).unref?.();

  // ── Search result picker ──────────────────────────────────────────────────
  if (action === "search") {
    const pick    = parts[2];
    const session = pendingSearches.get(guildId);
    if (!session) { await safeReply(interaction, { components: [createErrorContainer("Expired", "This search has expired.", guildColor)], flags: MessageFlags.IsComponentsV2, ephemeral: true }).catch(() => {}); return true; }
    if (interaction.user.id !== session.userId) { await safeReply(interaction, { components: [createErrorContainer("Not Allowed", "Only the person who searched can pick.", guildColor)], flags: MessageFlags.IsComponentsV2, ephemeral: true }).catch(() => {}); return true; }
    if (session.timeout) clearTimeout(session.timeout);
    pendingSearches.delete(guildId);
    if (pick === "cancel") { await safeUpdate(interaction, { components: [createErrorContainer("Cancelled", "Search cancelled.", guildColor)], flags: MessageFlags.IsComponentsV2 }).catch(() => {}); return true; }
    const idx    = parseInt(pick) - 1;
    const lTrack = session.tracks[idx];
    if (!lTrack) { await safeUpdate(interaction, { components: [createErrorContainer("Invalid Pick", "That track no longer exists.", guildColor)], flags: MessageFlags.IsComponentsV2 }).catch(() => {}); return true; }
    await safeDeferUpdate(interaction);
    const track = { title: lTrack.info.title || "Unknown", artist: lTrack.info.author || lTrack.info.artist || "", url: lTrack.info.uri, duration: Math.floor((lTrack.info.length || 0) / 1000), source: "youtube", encoded: lTrack.encoded, _llTrack: lTrack, requestedBy: interaction.user.username };
    try {
      const existingQs = musicGetQueue(guildId);
      if (existingQs?.player && existingQs.voiceChannelId && session.voiceCh?.id !== existingQs.voiceChannelId) {
        await session.textChannel.send({ components: [createErrorContainer("Wrong Voice Channel", `Bot is in <#${existingQs.voiceChannelId}>.`, guildColor)], flags: MessageFlags.IsComponentsV2 }).catch(() => {}); return true;
      }
      const q       = await musicJoinAndSetup(guildId, session.voiceCh, session.textChannel);
      const wasIdle = !q.current && q.tracks.length === 0;
      q.tracks.push(track);
      await session.textChannel.send({ components: [new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent(`### ${STATUS.success} Added to Queue`))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(t => t.setContent(`> ${trackLink(track)}\n-# Position **#${q.tracks.length}** · Requested by ${session.userId ? `<@${session.userId}>` : "Unknown"}`))], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      if (wasIdle) await musicPlayNext(guildId);
      else refreshNowPlaying(guildId).catch(() => {});
    } catch (err) { await session.textChannel.send({ components: [createErrorContainer("Playback Error", err.message)], flags: MessageFlags.IsComponentsV2 }).catch(() => {}); }
    return true;
  }

  // ── Lyrics page navigation ────────────────────────────────────────────────
  if (action === "lyricspage") {
    const direction = parts[2];
    const session   = pendingLyrics.get(guildId);
    if (!session) { await safeReply(interaction, { components: [createErrorContainer("Expired", "This lyrics session has expired.", guildColor)], flags: MessageFlags.IsComponentsV2, ephemeral: true }).catch(() => {}); return true; }
    if (direction === "prev") session.page = Math.max(0, session.page - 1);
    if (direction === "next") session.page = Math.min(session.pages.length - 1, session.page + 1);
    const updated = buildLyricsPageContainer(session.pages, session.page, session.displayTitle, guildId, session.hasLive);
    await safeUpdate(interaction, { components: [updated], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    return true;
  }

  // ── Live lyrics mode ──────────────────────────────────────────────────────
  if (action === "lyricslive") {
    const q = musicGetQueue(guildId);
    if (!q?.current || !q?.syncedLyrics?.length || q.destroyed) { await safeReply(interaction, { components: [createErrorContainer("No Synced Lyrics", "No synced lyrics available for this track.", guildColor)], flags: MessageFlags.IsComponentsV2, ephemeral: true }).catch(() => {}); return true; }
    if (q.liveLyricsMsg && q.liveLyricsMsg.id !== interaction.message.id) q.liveLyricsMsg.delete().catch(() => {});
    q.liveLyricsMsg = interaction.message;
    pendingLyrics.delete(guildId);
    await safeUpdate(interaction, { components: [buildLiveLyricsContainer(q)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    return true;
  }

  await safeDeferUpdate(interaction);
  const q = musicGetQueue(guildId);
  if (!q || q.destroyed) {
    if (["stop", "disconnect", "leave", "dc"].includes(action)) {
      await destroyMusicSession(interaction.guild || guildId, `button ${action} without queue`).catch(() => {});
      await safeFollowUp(interaction, {
        components: [createSuccessContainer("Disconnected", "Left the voice channel and cleared any stale music session.", guildColor)],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
      return true;
    }
    await safeFollowUp(interaction, { components: [createErrorContainer("Nothing Playing", "Nothing is playing right now.", guildColor)], flags: MessageFlags.IsComponentsV2, ephemeral: true }).catch(() => {});
    return true;
  }
  q.guildColor = guildColor;
  const buttonAccess = validateMusicAccess({
    member: interaction.member,
    guild: interaction.guild,
    queue: q,
    command: action === "queue" ? "queue" : "pause",
  });
  if (!buttonAccess.ok) {
    await safeFollowUp(interaction, {
      components: [createErrorContainer("Wrong Voice Channel", buttonAccess.message, guildColor)],
      flags: MessageFlags.IsComponentsV2,
      ephemeral: true,
    }).catch(() => {});
    return true;
  }

  switch (action) {
    case "prev": {
      if (!q.previousTrack) {
        await safeFollowUp(interaction, { components: [createErrorContainer("No Previous Track", "There's no previous track to go back to.", guildColor)], flags: MessageFlags.IsComponentsV2, ephemeral: true }).catch(() => {});
        return true;
      }
      if (q.current) q.tracks.unshift({ ...q.current });
      q.tracks.unshift({ ...q.previousTrack });
      q.previousTrack = null;
      if (q.loop === "track") q.loop = "off";
      await q.player.stopTrack();
      break;
    }
    case "pauseplay":
    case "pause":
    case "resume": {
      const nowPaused = !q.player.paused;
      await q.player.setPaused(nowPaused).catch(() => {});
      await safeFollowUp(interaction, {
        components: [createSuccessContainer(
          nowPaused ? "Paused" : "Resumed",
          nowPaused ? `Paused **${q.current?.title || "the track"}**.` : `Resumed **${q.current?.title || "the track"}**.`,
          guildColor
        )],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
      refreshNowPlaying(guildId).catch(() => {});
      break;
    }
    case "stop":
    case "disconnect": {
      await safeFollowUp(interaction, {
        components: [createSuccessContainer("Stopped", "Stopped playback, left the voice channel, and cleared the queue.", guildColor)],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
      await destroyMusicSession(interaction.guild || guildId, `button ${action}`);
      break;
    }
    case "skip": {
      if (!q.current) { await safeFollowUp(interaction, { components: [createErrorContainer("Nothing to Skip", "Nothing is currently playing.", guildColor)], flags: MessageFlags.IsComponentsV2, ephemeral: true }).catch(() => {}); return true; }
      if (q.tracks.length === 0 && q.loop !== "queue") { await safeFollowUp(interaction, { components: [createErrorContainer("No Next Track", "There are no more songs in the queue.", guildColor)], flags: MessageFlags.IsComponentsV2, ephemeral: true }).catch(() => {}); return true; }
      if (q.loop === "track") q.loop = "off";
      await q.player.stopTrack();
      break;
    }
    case "loop": {
      const modes = ["off","track","queue"];
      q.loop = modes[(modes.indexOf(q.loop) + 1) % modes.length];
      saveQueue(guildId);
      const loopDescs = { off: "Loop is **off**.", track: "**Track loop** — current song repeats.", queue: "**Queue loop** — all tracks repeat." };
      await safeFollowUp(interaction, {
        components: [createSuccessContainer(`Loop: ${q.loop}`, loopDescs[q.loop], guildColor)],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
      refreshNowPlaying(guildId).catch(() => {});
      break;
    }
    case "back10": {
      const pos = Math.max(0, (q.player.position ?? 0) - 10000);
      await q.player.seekTo(pos).catch(() => {});
      await safeFollowUp(interaction, {
        components: [createSuccessContainer("Rewound 10s", `Went back 10s — now at \`${musicFmtDuration(Math.floor(pos / 1000))}\`.`, guildColor)],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
      break;
    }
    case "fwd10": {
      const dur  = (q.current?.duration || 0) * 1000;
      const pos  = Math.min(dur > 0 ? dur - 1000 : Infinity, (q.player.position ?? 0) + 10000);
      await q.player.seekTo(pos).catch(() => {});
      await safeFollowUp(interaction, {
        components: [createSuccessContainer("Skipped 10s", `Skipped 10s forward — now at \`${musicFmtDuration(Math.floor(pos / 1000))}\`.`, guildColor)],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
      break;
    }
    case "replay": {
      await q.player.seekTo(0).catch(() => {});
      await safeFollowUp(interaction, {
        components: [createSuccessContainer("Replaying", `Restarted **${q.current?.title || "the track"}** from the beginning.`, guildColor)],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
      break;
    }
    case "autoplay": {
      q.autoplay = !q.autoplay;
      saveQueue(guildId);
      await safeFollowUp(interaction, {
        components: [createSuccessContainer(
          `Autoplay ${q.autoplay ? "ON" : "OFF"}`,
          q.autoplay ? "A related track will queue when the list ends." : "Queue will stop when all tracks finish.",
          guildColor
        )],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
      refreshNowPlaying(guildId).catch(() => {});
      break;
    }
    case "queue": {
      const total = q.tracks.length;
      const trackLines = q.tracks.slice(0, 10).map((t, i) => `\`${i + 1}.\` **${t.title}** · \`${musicFmtDuration(t.duration)}\``).join("\n") || "*No upcoming tracks*";
      const qc = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Music Queue`))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(t => t.setContent(`**Now Playing:**\n${MUSIC_NOTE} ${q.current ? `**${q.current.title}** · \`${musicFmtDuration(q.current.duration)}\`` : "*(nothing)*"}`))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(t => t.setContent(`**Up Next:** (${total} track${total !== 1 ? "s" : ""})\n${trackLines}`));
      await safeFollowUp(interaction, { components: [qc], flags: MessageFlags.IsComponentsV2, ephemeral: true }).catch(() => {});
      break;
    }
    case "voldown":
    case "volup": {
      const delta = action === "volup" ? 10 : -10;
      q.volume = Math.max(1, Math.min(200, (q.volume || 80) + delta));
      await q.player?.setGlobalVolume(q.volume).catch(() => {});
      saveQueue(guildId);
      await safeFollowUp(interaction, {
        components: [createSuccessContainer("Volume", `Volume set to **${q.volume}%**.`, guildColor)],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
      refreshNowPlaying(guildId).catch(() => {});
      break;
    }
    case "shuffle": {
      if (q.tracks.length < 2) { await safeFollowUp(interaction, { components: [createErrorContainer("Not Enough Tracks", "Not enough tracks to shuffle.", guildColor)], flags: MessageFlags.IsComponentsV2, ephemeral: true }).catch(() => {}); break; }
      for (let i = q.tracks.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q.tracks[i], q.tracks[j]] = [q.tracks[j], q.tracks[i]]; }
      saveQueue(guildId);
      await safeFollowUp(interaction, { components: [createSuccessContainer("Shuffled", `Shuffled **${q.tracks.length} tracks**.`, guildColor)], flags: MessageFlags.IsComponentsV2, ephemeral: true }).catch(() => {});
      break;
    }
    case "addplaylist": {
      if (!q.current) {
        await safeFollowUp(interaction, { components: [createErrorContainer("Nothing Playing", "Nothing is currently playing.", guildColor)], flags: MessageFlags.IsComponentsV2, ephemeral: true }).catch(() => {});
        break;
      }
      const userId   = interaction.user.id;
      const db       = interaction.client._db || {};
      const userPls  = db.playlists?.[userId] || {};
      const plKeys   = Object.keys(userPls);

      if (!plKeys.length) {
        await safeFollowUp(interaction, {
          components: [createErrorContainer("No Playlists", `Create one first with \`playlist create <name>\`.`, guildColor)],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        }).catch(() => {});
        break;
      }

      // Store session: track snapshot + ordered plKeys so index buttons work safely
      const sessionKey = `${guildId}_${userId}`;
      pendingPlaylistAdd.set(sessionKey, {
        track:     { ...q.current },
        plKeys,
        expiresAt: Date.now() + 300_000,
      });
      if (typeof registerPanelSession === "function") {
        registerPanelSession(`music_addtopl_${sessionKey}`, {
          ownerId: userId,
          guildId,
          meta: { onExpire: () => pendingPlaylistAdd.delete(sessionKey) },
        });
      }

      // Build up to 5 playlist picker buttons + cancel
      const pickButtons = plKeys.slice(0, 5).map((key, i) =>
        new ButtonBuilder()
          .setCustomId(`music_addtopl_${i}_${guildId}`)
          .setLabel(userPls[key].name.slice(0, 20))
          .setEmoji({ id: "1500792270889287772", name: "playlist" })
          .setStyle(ButtonStyle.Secondary)
      );
      pickButtons.push(
        new ButtonBuilder()
          .setCustomId(`music_addtopl_cancel_${guildId}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Danger)
      );
      const pickerRow = new ActionRowBuilder().addComponents(...pickButtons);
      const pickerContainer = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent(`### ${STATUS.info} Add to Playlist`))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(t => t.setContent(
          `> ${STATUS.tick} **Track:** ${q.current.title}\n` +
          `> ${STATUS.tick} Pick a playlist below:`
        ))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addActionRowComponents(pickerRow)
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(t => t.setContent(`-# Expires in 5 min · Showing ${pickButtons.length - 1} of ${plKeys.length} playlists`));

      const pickerMsg = await safeFollowUp(interaction, {
        components: [pickerContainer],
        flags:      MessageFlags.IsComponentsV2,
        ephemeral:  true,
      }).catch(() => {});
      if (pickerMsg && typeof createPanel === "function") {
        createPanel({
          message: pickerMsg,
          ownerId: userId,
          command: "music:addplaylist",
          type: "music",
          meta: { onExpire: () => pendingPlaylistAdd.delete(sessionKey) },
        });
      }
      break;
    }

    case "smartshuffle": {
      if (q.tracks.length < 2) {
        await safeFollowUp(interaction, { components: [createErrorContainer("Not Enough Tracks", "Not enough tracks in the queue to smart shuffle.", guildColor)], flags: MessageFlags.IsComponentsV2, ephemeral: true }).catch(() => {});
        break;
      }
      const recentTitles = new Set((q.history || []).slice(0, 5).map(t => t.title));
      const freshTracks  = q.tracks.filter(t => !recentTitles.has(t.title));
      const recentTracks = q.tracks.filter(t =>  recentTitles.has(t.title));
      const fyShuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
      q.tracks = [...fyShuffle(freshTracks), ...fyShuffle(recentTracks)];
      await safeFollowUp(interaction, { components: [createSuccessContainer("Smart Shuffled", `Shuffled **${q.tracks.length} tracks** — recently played songs moved to the end.`, guildColor)], flags: MessageFlags.IsComponentsV2, ephemeral: true }).catch(() => {});
      break;
    }
  }
  return true;
}

// ── Add-to-playlist picker handler (separate routing block) ───────────────────
// Handles music_addtopl_<idx>_<guildId> and music_addtopl_cancel_<guildId>
async function handleAddToPlaylistInteraction(interaction) {
  if (!interaction.isButton()) return false;
  const { customId, guildId } = interaction;
  if (!customId.startsWith("music_addtopl_")) return false;
  const guildColor = getGuildColor(interaction.client, guildId);

  const parts     = customId.split("_");
  // parts: ["music","addtopl","<idx|cancel>","<guildId>"]
  const idxOrCancel = parts[2];
  const userId      = interaction.user.id;
  const sessionKey  = `${guildId}_${userId}`;
  const session     = pendingPlaylistAdd.get(sessionKey);

  if (idxOrCancel === "cancel") {
    pendingPlaylistAdd.delete(sessionKey);
    await safeUpdate(interaction, { components: [createErrorContainer("Cancelled", "No track was added.", guildColor)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    return true;
  }

  if (!session || Date.now() > session.expiresAt) {
    pendingPlaylistAdd.delete(sessionKey);
    await safeReply(interaction, { components: [createErrorContainer("Expired", "This playlist picker has expired. Click the button again.", guildColor)], flags: MessageFlags.IsComponentsV2, ephemeral: true }).catch(() => {});
    return true;
  }

  const idx    = parseInt(idxOrCancel);
  const plKey  = session.plKeys[idx];
  if (isNaN(idx) || !plKey) {
    await safeReply(interaction, { components: [createErrorContainer("Invalid Selection", "That selection is no longer valid.", guildColor)], flags: MessageFlags.IsComponentsV2, ephemeral: true }).catch(() => {});
    return true;
  }

  const db      = interaction.client._db || {};
  const userPls = db.playlists?.[userId];
  const pl      = userPls?.[plKey];
  if (!pl) {
    pendingPlaylistAdd.delete(sessionKey);
    await safeUpdate(interaction, { components: [createErrorContainer("Playlist Not Found", "That playlist no longer exists.", guildColor)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    return true;
  }
  if (pl.tracks.length >= 200) {
    await safeUpdate(interaction, { components: [createErrorContainer("Playlist Full", `**${pl.name}** is at the 200 track limit.`, guildColor)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    return true;
  }

  const { track } = session;
  pl.tracks.push({ title: track.title, url: track.url, duration: track.duration, source: track.source, searchStr: track.searchStr });
  pendingPlaylistAdd.delete(sessionKey);

  // Persist to DB
  try {
    const fs = require("fs");
    require("../../utils/redisDatabase").requestSave();
  } catch { /* silent */ }

  const successContainer = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`### ${STATUS.success} Added to Playlist`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(
      `> ${STATUS.tick} **${track.title}**\n` +
      `> ${STATUS.tick} Added to **${pl.name}** — now has **${pl.tracks.length}** track${pl.tracks.length !== 1 ? "s" : ""}.`
    ))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t => t.setContent(`-# Added by ${interaction.user.username}`));

  await safeUpdate(interaction, { components: [successContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  return true;
}

// ── Guild Delete — clean up immediately ───────────────────────────────────────
function handleGuildDelete(guild) {
  try {
    const guildId = guild?.id;
    if (!guildId) return;
    if (musicQueues.has(guildId)) {
      console.log(`[MUSIC] Guild ${guildId} deleted/bot kicked — destroying queue.`);
      void musicDestroyQueue(guildId, "guild delete");
    }
  } catch { /* silent */ }
}

// ── Shoukaku initialiser ──────────────────────────────────────────────────────
function initShoukaku(client) {
  if (!Shoukaku || !ShoukakuConnectors) { console.warn("[MUSIC] Shoukaku not available — music disabled."); return; }
  const existing = shoukaku || client?._shoukaku || globalThis.__soezyShoukaku;
  if (existing) {
    shoukaku = existing;
    client._shoukaku = existing;
    globalThis.__soezyShoukaku = existing;
    return existing;
  }
  const config = client._config || {};
  const configured = getLavalinkConfiguration();
  const nodes = configured.nodes;
  config.lavalinkNodes = nodes;
  config.lavalinkConfigError = configured.error;
  if (!nodes.length) {
    console.warn(`[LAVALINK] Not configured: ${config.lavalinkConfigError || configured.error || "no nodes available"}`);
    return null;
  }
  console.log("[LAVALINK] Connecting...");

  shoukaku = new Shoukaku(new ShoukakuConnectors.DiscordJS(client), nodes, {
    moveOnDisconnect: true,
    resume:          true,
    resumeTimeout:   120,
    resumeByLibrary: true,
    reconnectTries:   5,
    restTimeout:      10,
  });
  client._shoukaku = shoukaku;
  globalThis.__soezyShoukaku = shoukaku;
  getMusicRecovery()?.installAutomaticRecovery?.(client, module.exports);

  shoukaku.on("error", (name, err) => console.error(`[LAVALINK] Node ${name} error: ${redactLavalinkError(err)}`));
  shoukaku.on("ready", (name) => {
    getMusicRecovery()?.reconnectManager?.reset(`node:${name}`);
    console.log("[LAVALINK] Connected");
    console.log(`[LAVALINK] Node ready: ${name}`);
    for (const [guildId, q] of musicQueues) {
      if (q?.player?.node?.name === name) {
        q.nodeDisconnected = false;
        refreshNowPlaying(guildId).catch(() => {});
      }
    }
  });
  shoukaku.on("disconnect", (name)      => {
    console.warn(`[LAVALINK] Node disconnected: ${name}`);
    console.warn(`[LAVALINK] Reconnecting: ${name}`);
    const recovery = getMusicRecovery();
    recovery?.scheduleNodeReconnect?.(client, name, { reason: "shoukaku disconnect" });
    // Keep independent guild queues while Shoukaku reconnects and restores them.
    for (const [guildId, q] of musicQueues) {
      if (!q.destroyed && q.player?.node?.name === name) {
        const prefix = getMusicPrefix(client, guildId);
        q.nodeDisconnected = true;
        try {
          q.textChannel?.send({
            components: [createErrorContainer("Lavalink Reconnecting", `The audio server restarted. Snozy is reconnecting your player; try \`${prefix}play\` again if playback does not resume.`, q.guildColor ?? guildColor)],
            flags: MessageFlags.IsComponentsV2,
          }).catch(() => {});
        } catch { /* ignore */ }
      }
    }
  });
  shoukaku.on("close", name => console.warn(`[LAVALINK] Node connection closed: ${name}`));
  return shoukaku;
}

// ── Voice State Update — no auto-leave (only leave when user types `leave`) ──
function getShoukaku() {
  return shoukaku;
}

async function handleVoiceStateUpdate(oldState, newState) {
  const guild = oldState?.guild || newState?.guild;
  const guildId = guild?.id;
  if (!guildId) return;
  const q = musicGetQueue(guildId);
  const botVoiceId = guild.members.me?.voice?.channelId || q?.voiceChannelId || null;
  if (!botVoiceId) {
    clearMusicAutoLeaveTimer(guildId);
    return;
  }
  const touchedBotChannel = oldState?.channelId === botVoiceId || newState?.channelId === botVoiceId;
  if (!touchedBotChannel) return;
  if (isTwentyFourSevenEnabled(guildId)) {
    clearMusicAutoLeaveTimer(guildId);
    return;
  }
  const voiceChannel = guild.channels.cache.get(botVoiceId);
  if (countHumanListeners(voiceChannel, guild.members.me?.id) > 0) {
    clearMusicAutoLeaveTimer(guildId);
    return;
  }
  scheduleMusicAutoLeave(guild, "voice channel empty");
}

// ═════════════════════════════════════════════════════════════════════════════
//  SLASH COMMAND DEFINITIONS
//  Register with: client.application.commands.set(MUSIC_SLASH_COMMANDS)
//  Handle with:   handleMusicSlashCommand(interaction, client._config)
// ═════════════════════════════════════════════════════════════════════════════

const _str  = (n, d, req = false) => o => o.setName(n).setDescription(d).setRequired(req);

const MUSIC_SLASH_COMMANDS = [

  // ── Playback ────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("play").setDescription("Play a song / URL, or resume if paused")
    .addStringOption(o => o.setName("query").setDescription("Song name, YouTube/Spotify/SoundCloud URL")),

  new SlashCommandBuilder().setName("join").setDescription("Join your current voice channel"),

  new SlashCommandBuilder().setName("247").setDescription("Toggle 24/7 voice mode")
    .addStringOption(o => o.setName("state").setDescription("Set 24/7 mode")
      .addChoices(
        { name: "On", value: "on" },
        { name: "Off", value: "off" },
      )),

  new SlashCommandBuilder().setName("playnext").setDescription("Add a song to play immediately after the current track")
    .addStringOption(o => o.setName("query").setDescription("Song name or URL").setRequired(true)),

  new SlashCommandBuilder().setName("skip").setDescription("Skip the currently playing track"),

  new SlashCommandBuilder().setName("pause").setDescription("Pause playback"),

  new SlashCommandBuilder().setName("resume").setDescription("Resume paused playback"),

  new SlashCommandBuilder().setName("stop").setDescription("Stop playback, clear the queue, and disconnect"),

  new SlashCommandBuilder().setName("leave").setDescription("Disconnect the bot from voice and clear the queue"),

  new SlashCommandBuilder().setName("replay").setDescription("Restart the current track from the beginning"),

  new SlashCommandBuilder().setName("seek").setDescription("Jump to a timestamp in the current track")
    .addStringOption(o => o.setName("time").setDescription('Time to seek to — e.g. "1:30" or "90"').setRequired(true)),

  new SlashCommandBuilder().setName("rewind").setDescription("Rewind playback by N seconds (default: 10)")
    .addIntegerOption(o => o.setName("seconds").setDescription("Seconds to rewind").setMinValue(1).setMaxValue(600)),

  new SlashCommandBuilder().setName("forward").setDescription("Fast-forward playback by N seconds (default: 10)")
    .addIntegerOption(o => o.setName("seconds").setDescription("Seconds to skip ahead").setMinValue(1).setMaxValue(600)),

  new SlashCommandBuilder().setName("movebot").setDescription("Move the bot to your current voice channel"),

  new SlashCommandBuilder().setName("move").setDescription("Move a queue track (from→to), or move bot to your VC if no positions given")
    .addIntegerOption(o => o.setName("from").setDescription("Queue position to move from").setMinValue(1))
    .addIntegerOption(o => o.setName("to").setDescription("Queue position to move to").setMinValue(1)),

  // ── Now Playing / Info ──────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("nowplaying").setDescription("Show the currently playing track with controls"),

  new SlashCommandBuilder().setName("queue").setDescription("View the current music queue")
    .addIntegerOption(o => o.setName("page").setDescription("Page number").setMinValue(1)),

  new SlashCommandBuilder().setName("upcoming").setDescription("Show the next 5 upcoming tracks"),

  new SlashCommandBuilder().setName("history").setDescription("Show recently played tracks"),

  new SlashCommandBuilder().setName("trackinfo").setDescription("Show detailed info about the current track"),

  new SlashCommandBuilder().setName("search").setDescription("Search YouTube and pick a track interactively")
    .addStringOption(o => o.setName("query").setDescription("Search query").setRequired(true)),

  new SlashCommandBuilder().setName("thumbnail").setDescription("Show the thumbnail of the current track"),

  new SlashCommandBuilder().setName("lyrics").setDescription("Fetch lyrics for the current or a specified song")
    .addStringOption(o => o.setName("query").setDescription("Song name - artist (leave blank for current track)"))
    .addStringOption(o => o.setName("language").setDescription("Lyrics language")
      .addChoices(
        { name: "Original", value: "original" },
        { name: "English", value: "english" },
        { name: "Hinglish", value: "hinglish" },
      )),

  new SlashCommandBuilder().setName("stats").setDescription("Show bot and Lavalink node statistics"),

  new SlashCommandBuilder().setName("mostplayed").setDescription("Show the most played tracks on this server"),

  new SlashCommandBuilder().setName("ping").setDescription("Check bot and Lavalink latency"),

  // ── Queue Management ────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("shuffle").setDescription("Shuffle the queue"),

  new SlashCommandBuilder().setName("remove").setDescription("Remove a track from the queue by position")
    .addIntegerOption(o => o.setName("position").setDescription("Queue position to remove").setRequired(true).setMinValue(1)),

  new SlashCommandBuilder().setName("jump").setDescription("Skip directly to a position in the queue")
    .addIntegerOption(o => o.setName("position").setDescription("Queue position to jump to").setRequired(true).setMinValue(1)),

  new SlashCommandBuilder().setName("clear").setDescription("Clear all queued tracks (does not stop current track)"),

  // ── Controls ────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("volume").setDescription("Set or view the playback volume")
    .addIntegerOption(o => o.setName("level").setDescription("Volume level (1–200)").setMinValue(1).setMaxValue(200)),

  new SlashCommandBuilder().setName("loop").setDescription("Set loop mode: off, track, or queue")
    .addStringOption(o => o.setName("mode").setDescription("Loop mode")
      .addChoices(
        { name: "Off",   value: "off"   },
        { name: "Track", value: "track" },
        { name: "Queue", value: "queue" },
      )),

  new SlashCommandBuilder().setName("autoplay").setDescription("Toggle autoplay — queues a related track when the queue ends"),

  // ── Filters ─────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("nightcore").setDescription("Toggle Nightcore filter (speed + pitch up)"),
  new SlashCommandBuilder().setName("vaporwave").setDescription("Toggle Vaporwave filter (slow + pitch down)"),
  new SlashCommandBuilder().setName("slowmo").setDescription("Toggle Slow Motion filter"),
  new SlashCommandBuilder().setName("bassboost").setDescription("Toggle Bass Boost EQ"),
  new SlashCommandBuilder().setName("treble").setDescription("Toggle Treble EQ"),
  new SlashCommandBuilder().setName("pop").setDescription("Toggle Pop EQ"),
  new SlashCommandBuilder().setName("rock").setDescription("Toggle Rock EQ"),
  new SlashCommandBuilder().setName("jazz").setDescription("Toggle Jazz EQ"),
  new SlashCommandBuilder().setName("8d").setDescription("Toggle 8D Audio (binaural rotation)"),
  new SlashCommandBuilder().setName("karaoke").setDescription("Toggle Karaoke filter (centre channel reduction)"),
  new SlashCommandBuilder().setName("vibrato").setDescription("Toggle Vibrato filter"),
  new SlashCommandBuilder().setName("lowpass").setDescription("Toggle Low Pass filter"),
  new SlashCommandBuilder().setName("distortion").setDescription("Toggle Distortion filter"),
  new SlashCommandBuilder().setName("mono").setDescription("Toggle Mono audio (collapse stereo to mono)"),
  new SlashCommandBuilder().setName("normalization").setDescription("Toggle Normalization (volume levelling)"),
  new SlashCommandBuilder().setName("soft").setDescription("Toggle Soft EQ"),
  new SlashCommandBuilder().setName("tv").setDescription("Toggle TV EQ"),

  new SlashCommandBuilder().setName("speed").setDescription("Set playback speed (0.1× – 3.0×)")
    .addNumberOption(o => o.setName("value").setDescription("Speed multiplier (e.g. 1.25)").setRequired(true).setMinValue(0.1).setMaxValue(3.0)),

  new SlashCommandBuilder().setName("pitch").setDescription("Shift pitch in semitones (−5 to +5)")
    .addNumberOption(o => o.setName("semitones").setDescription("Semitone shift (e.g. +2 or -3)").setRequired(true).setMinValue(-5).setMaxValue(5)),

  new SlashCommandBuilder().setName("resetfilters").setDescription("Reset all audio filters to default"),

  new SlashCommandBuilder().setName("ratemusic").setDescription("Set playback rate (0.1×–5.0×) without altering pitch")
    .addNumberOption(o => o.setName("rate").setDescription("Rate multiplier (e.g. 1.5)").setRequired(true).setMinValue(0.1).setMaxValue(5.0)),

  new SlashCommandBuilder().setName("filters").setDescription("Show all currently active audio filters"),

  // ── Playlist ─────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("playlist").setDescription("Manage your personal playlists")
    .addSubcommand(s => s.setName("create").setDescription("Create a new playlist")
      .addStringOption(o => o.setName("name").setDescription("Playlist name (max 32 chars)").setRequired(true)))
    .addSubcommand(s => s.setName("delete").setDescription("Delete one of your playlists")
      .addStringOption(o => o.setName("name").setDescription("Playlist name to delete").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("List all your playlists"))
    .addSubcommand(s => s.setName("view").setDescription("View tracks in a playlist")
      .addStringOption(o => o.setName("name").setDescription("Playlist name").setRequired(true)))
    .addSubcommand(s => s.setName("play").setDescription("Load a playlist into the queue")
      .addStringOption(o => o.setName("name").setDescription("Playlist name").setRequired(true)))
    .addSubcommand(s => s.setName("add").setDescription("Search and add a song to a playlist")
      .addStringOption(o => o.setName("name").setDescription("Playlist name").setRequired(true))
      .addStringOption(o => o.setName("song").setDescription("Song name or URL").setRequired(true)))
    .addSubcommand(s => s.setName("addcurrent").setDescription("Save the currently playing track to a playlist")
      .addStringOption(o => o.setName("name").setDescription("Playlist name").setRequired(true)))
    .addSubcommand(s => s.setName("removetrack").setDescription("Remove a track from a playlist by position")
      .addStringOption(o => o.setName("name").setDescription("Playlist name").setRequired(true))
      .addIntegerOption(o => o.setName("position").setDescription("Track position #").setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName("clear").setDescription("Remove all tracks from a playlist")
      .addStringOption(o => o.setName("name").setDescription("Playlist name").setRequired(true)))
    .addSubcommand(s => s.setName("rename").setDescription("Rename a playlist")
      .addStringOption(o => o.setName("name").setDescription("Current playlist name").setRequired(true))
      .addStringOption(o => o.setName("newname").setDescription("New name (max 32 chars)").setRequired(true))),

  // ── DJ / Moderation ──────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("voteskip").setDescription("Cast a vote to skip the current track"),

  new SlashCommandBuilder().setName("skipratio").setDescription("Set the vote-skip threshold percentage (Manage Server)")
    .addIntegerOption(o => o.setName("percentage").setDescription("Percentage needed (10–100)").setRequired(true).setMinValue(10).setMaxValue(100)),

  new SlashCommandBuilder().setName("djrole").setDescription("Set or clear the DJ role (Manage Server)")
    .addRoleOption(o => o.setName("role").setDescription("Role to set as DJ — omit to clear")),

  new SlashCommandBuilder().setName("lockchannel").setDescription("Toggle music command lock to the current channel (Manage Server)"),

  new SlashCommandBuilder().setName("restrict").setDescription("Toggle a command on/off for this server (Manage Server)")
    .addStringOption(o => o.setName("command").setDescription('Command name to restrict/unrestrict (e.g. "nightcore")').setRequired(true)),

  // ── Music Settings ───────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("music").setDescription("Music system settings (Manage Server)")
    .addSubcommand(s => s.setName("enable").setDescription("Enable the music system"))
    .addSubcommand(s => s.setName("disable").setDescription("Disable the music system"))
    .addSubcommand(s => s.setName("settings").setDescription("View current music configuration"))
    .addSubcommand(s => s.setName("djrole").setDescription("Set or clear the DJ role")
      .addRoleOption(o => o.setName("role").setDescription("Role to assign — omit to clear")))
    .addSubcommand(s => s.setName("defaultvol").setDescription("Set the default volume for new sessions")
      .addIntegerOption(o => o.setName("volume").setDescription("Volume (1–200)").setRequired(true).setMinValue(1).setMaxValue(200))),

].map(cmd => normalizeMusicSlashOptionOrder(cmd.toJSON()));

function normalizeMusicSlashOptionOrder(payload) {
  if (!payload || !Array.isArray(payload.options)) return payload;
  payload.options = payload.options
    .map(option => normalizeMusicSlashOptionOrder(option))
    .sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required)));
  return payload;
}

// Names of all registered slash commands (for fast lookup)
for (let i = MUSIC_SLASH_COMMANDS.length - 1; i >= 0; i--) {
  if (require("../../utils/retiredCommands").isRetiredCommand(MUSIC_SLASH_COMMANDS[i].name)) MUSIC_SLASH_COMMANDS.splice(i, 1);
}
const MUSIC_SLASH_CMD_NAMES = new Set(MUSIC_SLASH_COMMANDS.map(c => c.name));

// ── Slash-to-prefix shim ──────────────────────────────────────────────────────
// Wraps a ChatInputCommandInteraction into a msg-like object so the existing
// handleMusicCommand can be reused without duplicating any logic.
// channel.send() goes directly to the channel so loading messages are deletable.
// msg.reply() uses editReply() on the first call, followUp() thereafter.
function createSlashMsgShim(interaction, roleFromOptions = null) {
  let firstReply = true;
  const shim = {
    guild:   interaction.guild,
    guildId: interaction.guildId,
    member:  interaction.member,
    author:  interaction.user,
    channel: {
      id:     interaction.channelId,
      client: interaction.client,
      send:   (opts) => (interaction.channel?.send(opts) ?? Promise.resolve(null)).catch(() => null),
    },
    client:   interaction.client,
    _isSlashCommand: true,
    mentions: { roles: { first: () => roleFromOptions } },
    reply: async (opts) => {
      if (firstReply) { firstReply = false; return safeEdit(interaction, opts); }
      return safeFollowUp(interaction, opts);
    },
    _usedReply: () => !firstReply,
  };
  return shim;
}

// ── Slash command handler ─────────────────────────────────────────────────────
async function handleMusicSlashCommand(interaction, config) {
  if (!interaction.isChatInputCommand()) return false;
  const name = interaction.commandName;
  if (!MUSIC_SLASH_CMD_NAMES.has(name)) return false;

  // Defer so we have time for async work; most music replies are public
  const adminCmds = new Set(["music","skipratio","djrole","lockchannel","restrict"]);
  await safeDefer(interaction, { ephemeral: adminCmds.has(name) });

  const opts = interaction.options;
  let cmd, args, roleFromOptions = null;

  // ── Route slash command name → cmd + args ─────────────────────────────────
  switch (name) {

    // ── Playback ──────────────────────────────────────────────────────────────
    case "play":       cmd = "play";       args = [opts.getString("query") || ""].filter(Boolean); break;
    case "join":       cmd = "join";       args = []; break;
    case "247":        cmd = "247";        args = [opts.getString("state") || ""].filter(Boolean); break;
    case "playnext":   cmd = "playnext";   args = [opts.getString("query")]; break;
    case "skip":       cmd = "skip";       args = []; break;
    case "pause":      cmd = "pause";      args = []; break;
    case "resume":     cmd = "resume";     args = []; break;
    case "stop":       cmd = "stop";       args = []; break;
    case "leave":      cmd = "leave";      args = []; break;
    case "replay":     cmd = "replay";     args = []; break;
    case "seek":       cmd = "seek";       args = [opts.getString("time")]; break;
    case "rewind":     cmd = "rewind";     args = [String(opts.getInteger("seconds") ?? 10)]; break;
    case "forward":    cmd = "forward";    args = [String(opts.getInteger("seconds") ?? 10)]; break;
    case "movebot":    cmd = "movebot";    args = []; break;
    case "move": {
      const from = opts.getInteger("from"), to = opts.getInteger("to");
      cmd  = "move";
      args = from != null && to != null ? [String(from), String(to)] : [];
      break;
    }

    // ── Info ──────────────────────────────────────────────────────────────────
    case "nowplaying": cmd = "np";          args = []; break;
    case "queue":      cmd = "queue";       args = opts.getInteger("page") ? [String(opts.getInteger("page"))] : []; break;
    case "upcoming":   cmd = "upcoming";    args = []; break;
    case "history":    cmd = "history";     args = []; break;
    case "trackinfo":  cmd = "trackinfo";   args = []; break;
    case "search":     cmd = "search";      args = [opts.getString("query")]; break;
    case "thumbnail":  cmd = "thumbnail";   args = []; break;
    case "lyrics": {
      cmd = "lyrics";
      const lyricQuery = opts.getString("query") || "";
      const lyricLanguage = opts.getString("language") || "";
      args = [lyricQuery, lyricLanguage].filter(Boolean);
      break;
    }
    case "stats":      cmd = "stats";       args = []; break;
    case "mostplayed": cmd = "mostplayed";  args = []; break;
    case "ping":       cmd = "ping";        args = []; break;

    // ── Queue management ──────────────────────────────────────────────────────
    case "shuffle":    cmd = "shuffle";     args = []; break;
    case "remove":     cmd = "remove";      args = [String(opts.getInteger("position"))]; break;
    case "jump":       cmd = "jump";        args = [String(opts.getInteger("position"))]; break;
    case "clear":      cmd = "clear";       args = []; break;

    // ── Controls ──────────────────────────────────────────────────────────────
    case "volume":     cmd = "volume";      args = opts.getInteger("level") != null ? [String(opts.getInteger("level"))] : []; break;
    case "loop":       cmd = "loop";        args = opts.getString("mode") ? [opts.getString("mode")] : []; break;
    case "autoplay":   cmd = "autoplay";    args = []; break;

    // ── Filters ───────────────────────────────────────────────────────────────
    case "nightcore":     cmd = "nightcore";     args = []; break;
    case "vaporwave":     cmd = "vaporwave";     args = []; break;
    case "slowmo":        cmd = "slowmo";        args = []; break;
    case "bassboost":     cmd = "bassboost";     args = []; break;
    case "treble":        cmd = "treble";        args = []; break;
    case "pop":           cmd = "pop";           args = []; break;
    case "rock":          cmd = "rock";          args = []; break;
    case "jazz":          cmd = "jazz";          args = []; break;
    case "8d":            cmd = "8d";            args = []; break;
    case "karaoke":       cmd = "karaoke";       args = []; break;
    case "vibrato":       cmd = "vibrato";       args = []; break;
    case "lowpass":       cmd = "lowpass";       args = []; break;
    case "distortion":    cmd = "distortion";    args = []; break;
    case "mono":          cmd = "mono";          args = []; break;
    case "normalization": cmd = "normalization"; args = []; break;
    case "soft":          cmd = "soft";          args = []; break;
    case "tv":            cmd = "tv";            args = []; break;
    case "speed":         cmd = "speed";         args = [String(opts.getNumber("value"))]; break;
    case "pitch":         cmd = "pitch";         args = [String(opts.getNumber("semitones"))]; break;
    case "resetfilters":  cmd = "resetfilters";  args = []; break;
    case "ratemusic":     cmd = "ratemusic";     args = [String(opts.getNumber("rate"))]; break;
    case "filters":       cmd = "filters";       args = []; break;

    // ── DJ / Moderation ───────────────────────────────────────────────────────
    case "voteskip":   cmd = "voteskip";    args = []; break;
    case "skipratio":  cmd = "skipratio";   args = [String(opts.getInteger("percentage"))]; break;
    case "djrole": {
      const role = opts.getRole("role");
      roleFromOptions = role;
      cmd  = "djrole";
      args = role ? [role.id] : [];
      break;
    }
    case "lockchannel": cmd = "lockchannel"; args = []; break;
    case "restrict":    cmd = "restrict";    args = [opts.getString("command")]; break;

    // ── Playlist ──────────────────────────────────────────────────────────────
    case "playlist": {
      const sub = opts.getSubcommand();
      cmd = "playlist";
      switch (sub) {
        case "create":      args = ["create",      opts.getString("name")]; break;
        case "delete":      args = ["delete",      opts.getString("name")]; break;
        case "list":        args = ["list"]; break;
        case "view":        args = ["view",        opts.getString("name")]; break;
        case "play":        args = ["play",        opts.getString("name")]; break;
        case "addcurrent":  args = ["addcurrent",  opts.getString("name")]; break;
        case "clear":       args = ["clear",       opts.getString("name")]; break;
        case "add":         args = ["add",         opts.getString("name"), opts.getString("song")]; break;
        case "removetrack": args = ["removetrack", opts.getString("name"), String(opts.getInteger("position"))]; break;
        case "rename":      args = ["rename",      opts.getString("name"), opts.getString("newname")]; break;
        default:            args = [sub]; break;
      }
      break;
    }

    // ── Music settings ────────────────────────────────────────────────────────
    case "music": {
      const sub = opts.getSubcommand();
      cmd = "music";
      switch (sub) {
        case "enable":   args = ["enable"]; break;
        case "disable":  args = ["disable"]; break;
        case "settings": args = ["settings"]; break;
        case "defaultvol": args = ["defaultvol", String(opts.getInteger("volume"))]; break;
        case "djrole": {
          const role = opts.getRole("role");
          roleFromOptions = role;
          args = ["djrole", ...(role ? [role.id] : [])];
          break;
        }
        default: args = [sub]; break;
      }
      break;
    }

    default: return false;
  }

  // ── Build shim and delegate to the prefix-command handler ─────────────────
  const shim = createSlashMsgShim(interaction, roleFromOptions);
  await handleMusicCommand(cmd, args, shim, "/", config);

  // If the handler only used channel.send() and never called reply(),
  // delete the blank deferred reply so it doesn't clutter the channel.
  if (!shim._usedReply()) {
    await interaction.deleteReply().catch(() => {});
  }

  return true;
}

// ── Slash command registration helper ─────────────────────────────────────────
// Call once on bot ready: await registerMusicSlashCommands(client)
// Pass a guildId to register guild-only (instant), omit for global (up to 1 h).
async function registerMusicSlashCommands(client, guildId = null) {
  try {
    const target = guildId
      ? client.guilds.cache.get(guildId)?.commands
      : client.application?.commands;
    if (!target) { console.warn("[MUSIC] Could not find command target to register slash commands."); return; }
    await target.set(MUSIC_SLASH_COMMANDS);
    console.log(`[MUSIC] ✅ Registered ${MUSIC_SLASH_COMMANDS.length} slash commands ${guildId ? `(guild ${guildId})` : "(global)"}.`);
  } catch (err) {
    console.error("[MUSIC] Failed to register slash commands:", err.message);
  }
}

async function execute(interaction) {
  return handleMusicSlashCommand(interaction, interaction.client?._config || {});
}

module.exports = {
  initShoukaku,
  parseMusicMessageCommand,
  parseNoPrefixMusicMessageCommand,
  isMusicCommandKeyword,
  isMusicPrefixCommandKeyword,
  handleMusicCommand,
  handleMusicSlashCommand,
  execute,
  handleMusicInteraction,
  handleVoiceStateUpdate,
  handleGuildDelete,
  DEFAULT_LAVALINK_NODES,
  getShoukaku,
  musicJoinAndSetup,
  musicPlayNext,
  saveQueue,
  restoreQueueStates,
  musicQueues,
  destroyMusicSession,
  musicDestroyQueue,
  musicGetQueue,
  isTwentyFourSevenEnabled,
  setTwentyFourSevenMode,
  scheduleMusicAutoLeave,
  normalizeLyricsQuery,
  stringSimilarity,
  fetchLyricsMultiSource,
  MUSIC_SLASH_COMMANDS,
  registerMusicSlashCommands,
};
