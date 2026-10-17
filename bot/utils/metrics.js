const METRIC_FLUSH_INTERVAL_MS = 60 * 1000;

// CommonJS modules and the bot's VM share process, but not globalThis.
const metricsRuntimeRoot = typeof process !== "undefined" ? process : globalThis;
const metricsRuntime = metricsRuntimeRoot.__soezyMetricsRuntime || (metricsRuntimeRoot.__soezyMetricsRuntime = {});
if (!metricsRuntime.context || globalThis.__soezyLoadingRuntimeFile) {
  metricsRuntime.context = globalThis;
}
const metrics = metricsRuntime.metrics || (metricsRuntime.metrics = {
  commands: new Map(),
  commandUsage: new Map(),
  commandLatency: new Map(),
  api: new Map(),
  apiFailures: new Map(),
  interactions: new Map(),
  rateLimits: new Map(),
  events: new Map(),
  queues: new Map(),
  startedAt: Date.now(),
});

function incMetric(bucket, key, amount = 1) {
  const map = metrics[bucket];
  if (!map) return;
  if (!map.has(key) && map.size >= 2000) key = "other";
  map.set(key, (map.get(key) || 0) + amount);
}

function recordCommandMetric(source, commandName, elapsedMs = 0, error = null) {
  const command = String(commandName || "unknown").toLowerCase();
  incMetric("commandUsage", `${source || "unknown"}:${command}`, 1);
  incMetric("commandLatency", `${source || "unknown"}:${command}:count`, 1);
  incMetric("commandLatency", `${source || "unknown"}:${command}:ms`, elapsedMs);
  if (error) incMetric("commands", `${source || "unknown"}:${command}:errors`, 1);
}

function recordApiFailure(route, err) {
  const key = `${route || "unknown"}:${err?.code || err?.status || "error"}`;
  incMetric("apiFailures", key, 1);
}

function topEntries(map, limit = 10) {
  return [...(map || new Map()).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function setMetric(bucket, key, value) {
  const map = metrics[bucket];
  if (!map) return;
  if (!map.has(key) && map.size >= 2000) key = "other";
  map.set(key, value);
}

function timeMetric(bucket, key, startedAt) {
  const elapsed = Date.now() - startedAt;
  incMetric(bucket, `${key}:count`, 1);
  incMetric(bucket, `${key}:ms`, elapsed);
  return elapsed;
}

function getSoezyMetricsSnapshot() {
  const context = metricsRuntime.context;
  const memory = process.memoryUsage();
  return {
    uptimeMs: Date.now() - metrics.startedAt,
    memory: {
      rssMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
      externalMb: Math.round(memory.external / 1024 / 1024),
      arrayBuffersMb: Math.round(memory.arrayBuffers / 1024 / 1024),
    },
    commands: Object.fromEntries(metrics.commands),
    mostUsedCommands: topEntries(metrics.commandUsage, 10),
    slowestCommands: topEntries(metrics.commandLatency, 10),
    api: Object.fromEntries(metrics.api),
    apiFailures: Object.fromEntries(metrics.apiFailures),
    interactions: Object.fromEntries(metrics.interactions),
    rateLimits: Object.fromEntries(metrics.rateLimits),
    events: Object.fromEntries(metrics.events),
    queues: Object.fromEntries(metrics.queues),
    caches: {
      blacklistGuilds: context.__soezyBlacklistCache?.guilds?.size || 0,
      configGuilds: context.__soezyConfigRuntimeState?.guilds?.size || 0,
      panels: context.__soezyPanels?.size || 0,
      collectors: context.__soezyCollectors?.size || 0,
      spoilers: context.__soezySpoilerSessions?.size || 0,
      spoilerBytes: context.__soezySpoilerSessions?.usedBytes || 0,
      security: context.soezySecurity?.getRuntimeSizes?.() || {},
    },
  };
}

function logSoezyMetrics() {
  const context = metricsRuntime.context;
  const snap = getSoezyMetricsSnapshot();
  const apiQueue = context.soezyApiQueue?.size?.() || 0;
  const dbQueue = context.getDbWriteQueueStats?.() || {};
  const pendingInteractions = (context.__soezyModerationConfirmations?.size || 0) / 2;
  const guilds = context.client?.guilds?.cache?.size || 0;
  const rawListeners = context.client?.listenerCount?.("raw") || 0;
  const memberChunkListeners = context.client?.listenerCount?.("guildMembersChunk") || 0;
  setMetric("queues", "api", apiQueue);
  setMetric("queues", "dbPending", dbQueue.pending || 0);
  console.log(`[METRICS] rss=${snap.memory.rssMb}MB heap=${snap.memory.heapUsedMb}/${snap.memory.heapTotalMb}MB external=${snap.memory.externalMb}MB buffers=${snap.memory.arrayBuffersMb}MB guilds=${guilds} apiQueue=${apiQueue} dbQueue=${dbQueue.pending || 0} dbRetry=${Math.ceil((dbQueue.retryInMs || 0) / 1000)}s confirmations=${pendingInteractions} rawListeners=${rawListeners} guildMembersChunkListeners=${memberChunkListeners} caches=${JSON.stringify(snap.caches)}`);
}

if (!metricsRuntime.interval) {
  metricsRuntime.interval = setInterval(logSoezyMetrics, METRIC_FLUSH_INTERVAL_MS);
  metricsRuntime.interval.unref?.();
}

Object.assign(globalThis, {
  __soezyMetrics: metrics,
  __soezyMetricsInterval: metricsRuntime.interval,
  soezyMetrics: metrics,
  incMetric,
  setMetric,
  timeMetric,
  recordCommandMetric,
  recordApiFailure,
  getSoezyMetricsSnapshot,
  logSoezyMetrics,
});

module.exports = {
  metrics,
  incMetric,
  setMetric,
  timeMetric,
  recordCommandMetric,
  recordApiFailure,
  getSoezyMetricsSnapshot,
  logSoezyMetrics,
};
