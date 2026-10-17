"use strict";

const CLEANUP_INTERVAL_MS = 90_000;
const HEAVY_WINDOW_MS = 60_000;
const HEAVY_LIMIT = 5;
const MEMBER_FETCH_SPACING_MS = 600;
const MEMBER_FETCH_STALE_MS = 30_000;
const MEMBER_FETCH_MAX_QUEUE = 250;
const REST_WINDOW_MS = 1_000;
const REST_LIMIT = 45;

const HEAVY_COMMANDS = new Set([
  "serverinfo", "membercount", "userinfo", "roleinfo", "purge", "nuke",
  "leaderboard", "modstats", "addrole all",
]);

const ratelimitRuntimeState = globalThis.__soezyRatelimitRuntime || (globalThis.__soezyRatelimitRuntime = {
  guildWindows: new Map(),
  fetchQueue: [],
  fetchPumpRunning: false,
  restWindow: [],
  routeWindows: new Map(),
  handlerRegistry: new Map(),
  handlerSeq: 0,
});

function nowMs() {
  return Date.now();
}

function normalizeCommandName(commandName, context = {}) {
  const base = String(commandName || context.command || context.name || "").toLowerCase().trim();
  const sub = String(context.subcommandName || context.subcommand || context.subCommand || "").toLowerCase().trim();
  if (base === "addrole" && sub === "all") return "addrole all";
  return base;
}

function pruneWindow(list, windowMs, now = nowMs()) {
  while (list.length && now - list[0] >= windowMs) list.shift();
  return list;
}

function canBypassRateLimit(context = {}) {
  const userId = context.userId || context.user?.id || context.member?.id;
  const guildId = context.guildId || context.guild?.id || context.member?.guild?.id;
  if (typeof globalThis.canBypassCooldown === "function") {
    return globalThis.canBypassCooldown(userId, guildId, context);
  }
  const cfg = context.config || globalThis.config || {};
  return Array.isArray(cfg.ownerIds) && cfg.ownerIds.includes(userId);
}

function getGuildCommandLimitInfo(commandName, context = {}) {
  const command = normalizeCommandName(commandName, context);
  if (!HEAVY_COMMANDS.has(command)) return { heavy: false, limit: Infinity, windowMs: HEAVY_WINDOW_MS, scope: "general" };
  return { heavy: true, limit: HEAVY_LIMIT, windowMs: HEAVY_WINDOW_MS, scope: "heavy" };
}

function canRunGuildCommand(guildId, context = {}) {
  const command = normalizeCommandName(context.commandName, context);
  const info = getGuildCommandLimitInfo(command, context);
  if (!guildId || !info.heavy || canBypassRateLimit({ ...context, guildId })) {
    return { allowed: true, bypassed: !!guildId && canBypassRateLimit({ ...context, guildId }), remaining: info.limit, retryAfter: 0 };
  }

  const now = nowMs();
  const key = `${guildId}:${info.scope}:${command}`;
  const bucket = pruneWindow(ratelimitRuntimeState.guildWindows.get(key) || [], info.windowMs, now);
  if (bucket.length >= info.limit) {
    ratelimitRuntimeState.guildWindows.set(key, bucket);
    const retryAfter = Math.max(0, info.windowMs - (now - bucket[0]));
    console.log(`[RATELIMIT] guild heavy command guild=${guildId} command=${command} retry=${retryAfter}ms`);
    return { allowed: false, remaining: 0, retryAfter };
  }

  bucket.push(now);
  ratelimitRuntimeState.guildWindows.set(key, bucket);
  return { allowed: true, remaining: Math.max(0, info.limit - bucket.length), retryAfter: 0 };
}

function canRunGiveawayCommand(guildId, commandName, context = {}) {
  return canRunGuildCommand(guildId, { ...context, commandName });
}

function getGuildCommandLimit(commandName, context = {}) {
  return getGuildCommandLimitInfo(commandName, context).limit;
}

function canSendRestRequest(route = "global", options = {}) {
  const now = nowMs();
  pruneWindow(ratelimitRuntimeState.restWindow, options.windowMs || REST_WINDOW_MS, now);
  if (ratelimitRuntimeState.restWindow.length >= (options.limit || REST_LIMIT)) return false;
  const routeKey = String(route || "global");
  const routeWindow = pruneWindow(ratelimitRuntimeState.routeWindows.get(routeKey) || [], options.routeWindowMs || REST_WINDOW_MS, now);
  return routeWindow.length < (options.routeLimit || Math.max(5, Math.floor((options.limit || REST_LIMIT) / 2)));
}

async function waitForRestSlot(route = "global", options = {}) {
  while (!canSendRestRequest(route, options)) {
    await (globalThis.wait ? globalThis.wait(100) : new Promise(resolve => setTimeout(resolve, 100)));
  }
  const now = nowMs();
  ratelimitRuntimeState.restWindow.push(now);
  const routeKey = String(route || "global");
  const routeWindow = pruneWindow(ratelimitRuntimeState.routeWindows.get(routeKey) || [], options.routeWindowMs || REST_WINDOW_MS, now);
  routeWindow.push(now);
  ratelimitRuntimeState.routeWindows.set(routeKey, routeWindow);
  return true;
}

function getCachedMember(guild, userId) {
  if (!guild || !userId) return null;
  return guild.members?.cache?.get?.(userId) || null;
}

async function executeMemberFetch(job) {
  const cached = getCachedMember(job.guild, job.userId);
  try {
    const result = await job.guild.members.fetch(job.userId ? { user: job.userId, force: !!job.force } : undefined);
    job.resolve(result || cached);
  } catch (err) {
    if (!job.retried && /rate.?limit|429/i.test(String(err?.message || err))) {
      job.retried = true;
      console.warn(`[FETCH QUEUE] rate limited guild=${job.guild?.id || "unknown"} user=${job.userId || "all"} retrying once`);
      ratelimitRuntimeState.fetchQueue.unshift(job);
      return;
    }
    job.resolve(cached);
  }
}

async function pumpFetchQueue() {
  if (ratelimitRuntimeState.fetchPumpRunning) return;
  ratelimitRuntimeState.fetchPumpRunning = true;
  try {
    while (ratelimitRuntimeState.fetchQueue.length) {
      const job = ratelimitRuntimeState.fetchQueue.shift();
      if (!job) continue;
      if (nowMs() - job.createdAt > MEMBER_FETCH_STALE_MS) {
        job.resolve(getCachedMember(job.guild, job.userId));
        continue;
      }
      await executeMemberFetch(job);
      await (globalThis.wait ? globalThis.wait(MEMBER_FETCH_SPACING_MS) : new Promise(resolve => setTimeout(resolve, MEMBER_FETCH_SPACING_MS)));
    }
  } finally {
    ratelimitRuntimeState.fetchPumpRunning = false;
  }
}

function throttledMemberFetch(guild, userIdOrOptions, options = {}) {
  if (!guild?.members?.fetch) return Promise.resolve(null);
  const userId = typeof userIdOrOptions === "string" ? userIdOrOptions : userIdOrOptions?.user || userIdOrOptions?.userId;
  const cached = getCachedMember(guild, userId);
  if (ratelimitRuntimeState.fetchQueue.length >= MEMBER_FETCH_MAX_QUEUE) {
    console.warn(`[FETCH QUEUE] overflow guild=${guild.id || "unknown"} user=${userId || "all"} using cache fallback`);
    return Promise.resolve(cached);
  }
  return new Promise(resolve => {
    ratelimitRuntimeState.fetchQueue.push({
      guild,
      userId,
      force: options.force || userIdOrOptions?.force,
      createdAt: nowMs(),
      retried: false,
      resolve,
    });
    pumpFetchQueue().catch(err => console.warn("[FETCH QUEUE] pump failed:", err?.message || err));
  });
}

function safeRegisterHandler(emitter, eventName, handler, options = {}) {
  if (!emitter?.on || !eventName || typeof handler !== "function") return null;
  const scope = options.scope || emitter.constructor?.name || "emitter";
  const key = options.key || `${scope}:${eventName}:${options.id || handler.__soezyHandlerId || (handler.__soezyHandlerId = ++ratelimitRuntimeState.handlerSeq)}`;
  const previous = ratelimitRuntimeState.handlerRegistry.get(key);
  if (previous?.emitter?.removeListener) previous.emitter.removeListener(previous.eventName, previous.handler);
  ratelimitRuntimeState.handlerRegistry.set(key, { emitter, eventName, handler, createdAt: nowMs() });
  emitter.on(eventName, handler);
  return key;
}

function cleanupRatelimitManager(now = nowMs()) {
  for (const [key, bucket] of ratelimitRuntimeState.guildWindows) {
    pruneWindow(bucket, HEAVY_WINDOW_MS, now);
    if (!bucket.length) ratelimitRuntimeState.guildWindows.delete(key);
  }
  pruneWindow(ratelimitRuntimeState.restWindow, REST_WINDOW_MS, now);
  for (const [key, bucket] of ratelimitRuntimeState.routeWindows) {
    pruneWindow(bucket, REST_WINDOW_MS, now);
    if (!bucket.length) ratelimitRuntimeState.routeWindows.delete(key);
  }
  ratelimitRuntimeState.fetchQueue = ratelimitRuntimeState.fetchQueue.filter(job => {
    if (now - job.createdAt <= MEMBER_FETCH_STALE_MS) return true;
    job.resolve(getCachedMember(job.guild, job.userId));
    return false;
  });
}

function runCentralCleanup() {
  try { globalThis.cleanupDelayRuntime?.(); } catch (err) { console.warn("[RATELIMIT] delay cleanup failed:", err?.message || err); }
  try { globalThis.cleanupCommandCooldowns?.(); } catch (err) { console.warn("[COOLDOWN] cleanup failed:", err?.message || err); }
  try { cleanupRatelimitManager(); } catch (err) { console.warn("[RATELIMIT] cleanup failed:", err?.message || err); }
  try { globalThis.cleanupCollectors?.(); } catch {}
  try { globalThis.cleanupCollectorSessions?.(); } catch {}
  try { globalThis.cleanupLookupCaches?.(); } catch {}
  try { globalThis.cleanupSoezyCaches?.(); } catch {}
}

if (!globalThis.__soezyRuntimeCleanup90s) {
  globalThis.__soezyRuntimeCleanup90s = setInterval(runCentralCleanup, CLEANUP_INTERVAL_MS);
  globalThis.__soezyRuntimeCleanup90s.unref?.();
}

const ratelimitApi = {
  canRunGuildCommand,
  canRunGiveawayCommand,
  getGuildCommandLimit,
  getGuildCommandLimitInfo,
  canSendRestRequest,
  waitForRestSlot,
  throttledMemberFetch,
  safeRegisterHandler,
  cleanupRatelimitManager,
  runCentralCleanup,
};

globalThis.soezyRatelimitManager = ratelimitApi;
Object.assign(globalThis, ratelimitApi);

module.exports = ratelimitApi;
