const DEFAULT_ROUTE_DELAY_MS = 125;
const GLOBAL_BURST_LIMIT = 45;
const GLOBAL_BURST_WINDOW_MS = 1000;
const QUEUE_CLEANUP_INTERVAL_MS = 60 * 1000;

function apiQueueDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}

function routeKeyFromRequest(method, route) {
  const raw = String(route || "unknown");
  return `${String(method || "GET").toUpperCase()}:${raw
    .replace(/\d{17,20}/g, ":id")
    .replace(/\/reactions\/[^/]+/g, "/reactions/:emoji")}`;
}

class PriorityRequestQueue {
  constructor(options = {}) {
    this.routeDelayMs = options.routeDelayMs || DEFAULT_ROUTE_DELAY_MS;
    this.running = false;
    this.queues = { critical: [], high: [], normal: [], low: [] };
    this.routeNextAt = new Map();
    this.globalTimestamps = [];
    this.recentJobs = new Map();
    this.maxPending = options.maxPending || 1000;
  }

  size() {
    return this.queues.critical.length + this.queues.high.length + this.queues.normal.length + this.queues.low.length;
  }

  enqueue(route, task, options = {}) {
    const priority = ["critical", "high", "normal", "low", "background"].includes(options.priority)
      ? (options.priority === "background" ? "low" : options.priority)
      : inferQueuePriority(route, options);
    const key = options.key || null;
    if (key && this.recentJobs.has(key)) return this.recentJobs.get(key).promise;
    if (this.size() >= this.maxPending + (priority === "critical" ? 50 : 0)) {
      return Promise.reject(Object.assign(new Error("Discord request queue is full; retry shortly"), { code: "QUEUE_FULL" }));
    }

    const job = {
      route,
      task,
      priority,
      attempts: 0,
      maxRetries: options.maxRetries ?? 3,
      resolve: null,
      reject: null,
      createdAt: Date.now(),
    };

    const promise = new Promise((resolve, reject) => {
      job.resolve = resolve;
      job.reject = reject;
    });
    if (key) {
      this.recentJobs.set(key, { promise, createdAt: Date.now() });
      const cleanup = () => setTimeout(() => this.recentJobs.delete(key), 5000).unref?.();
      promise.then(cleanup, cleanup);
    }

    this.queues[priority].push(job);
    this.pump();
    return promise;
  }

  nextJob() {
    return this.queues.critical.shift() || this.queues.high.shift() || this.queues.normal.shift() || this.queues.low.shift() || null;
  }

  async waitForGlobalBurst() {
    const now = Date.now();
    this.globalTimestamps = this.globalTimestamps.filter(ts => now - ts < GLOBAL_BURST_WINDOW_MS);
    if (this.globalTimestamps.length >= GLOBAL_BURST_LIMIT) {
      const wait = GLOBAL_BURST_WINDOW_MS - (now - this.globalTimestamps[0]);
      await apiQueueDelay(wait);
    }
    this.globalTimestamps.push(Date.now());
  }

  async waitForRoute(route) {
    const nextAt = this.routeNextAt.get(route) || 0;
    if (nextAt > Date.now()) await apiQueueDelay(nextAt - Date.now());
    this.routeNextAt.set(route, Date.now() + this.routeDelayMs);
  }

  async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.size() > 0) {
        const job = this.nextJob();
        if (!job) break;
        try {
          await this.waitForGlobalBurst();
          await this.waitForRoute(job.route);
          const result = await job.task();
          incMetric?.("api", job.route, 1);
          job.resolve(result);
        } catch (err) {
          const retryAfter = Number(err?.retry_after || err?.retryAfter || err?.rawError?.retry_after || 0) * 1000;
          const isRateLimit = err?.status === 429 || err?.code === 429 || retryAfter > 0;
          if (isRateLimit) incMetric?.("rateLimits", job.route, 1);
          if (job.attempts++ < job.maxRetries && (isRateLimit || err?.code === "ETIMEDOUT" || err?.code === "ECONNRESET")) {
            await apiQueueDelay(retryAfter || Math.min(5000, 250 * job.attempts));
            this.queues[job.priority].unshift(job);
          } else {
            if (err?.code !== "EMERGENCY_PAUSED" && typeof recordApiFailure === "function") recordApiFailure(job.route, err);
            job.reject(err);
          }
        }
      }
    } finally {
      this.running = false;
      if (this.size() > 0) setImmediate(() => this.pump());
    }
  }

  cleanup() {
    for (const [route, nextAt] of this.routeNextAt) {
      if (nextAt < Date.now() - 60000) this.routeNextAt.delete(route);
    }
    const cutoff = Date.now() - 30000;
    for (const [key, entry] of this.recentJobs) {
      if (!entry || entry.createdAt < cutoff) this.recentJobs.delete(key);
    }
  }
}

const soezyApiQueue = globalThis.soezyApiQueue || (globalThis.soezyApiQueue = new PriorityRequestQueue());

function inferQueuePriority(route, options = {}) {
  const kind = String(options.kind || options.category || route || "").toLowerCase();
  if (/moderation|ban|kick|timeout|mute|delete|bulk-delete|permissions/.test(kind)) return "high";
  if (/config|settings|guild|channel|role|webhook/.test(kind)) return "high";
  if (/logging|audit|transcript|metrics|presence/.test(kind)) return "low";
  if (/fun|gif|meme|image|avatar|banner/.test(kind)) return "low";
  return "normal";
}

function queueDiscordRequest(route, task, options = {}) {
  return soezyApiQueue.enqueue(route, task, options);
}

function installSoezyRestQueue(rest, label = "rest") {
  if (!rest || rest.__soezyQueued) return rest;
  const methods = ["get", "post", "put", "patch", "delete"];
  for (const method of methods) {
    if (typeof rest[method] !== "function") continue;
    const original = rest[method].bind(rest);
    rest[method] = function queuedRestMethod(route, options) {
      const policy = globalThis.soezyEmergency?.requestPolicy(method, route) || {};
      const pausedError = () => Object.assign(new Error("Nonessential request paused during Anti-Nuke emergency"), { code: "EMERGENCY_PAUSED" });
      if (policy.paused) return Promise.reject(pausedError());
      const bucket = routeKeyFromRequest(method, route);
      const priority = policy.priority || (method === "get" ? inferQueuePriority(bucket, { kind: "read" }) : inferQueuePriority(bucket));
      return queueDiscordRequest(bucket, () => {
        if (!policy.priority && globalThis.soezyEmergency?.requestPolicy(method, route)?.paused) throw pausedError();
        return original(route, options);
      }, { priority });
    };
  }
  rest.__soezyQueued = true;
  console.log(`[QUEUE] Discord REST queue installed for ${label}.`);
  return rest;
}

if (!globalThis.__soezyApiQueueCleanupInterval) {
  globalThis.__soezyApiQueueCleanupInterval = setInterval(() => soezyApiQueue.cleanup(), QUEUE_CLEANUP_INTERVAL_MS);
  globalThis.__soezyApiQueueCleanupInterval.unref?.();
}

Object.assign(globalThis, {
  PriorityRequestQueue,
  soezyApiQueue,
  queueDiscordRequest,
  installSoezyRestQueue,
  routeKeyFromRequest,
  inferQueuePriority,
});

module.exports = {
  PriorityRequestQueue,
  soezyApiQueue,
  queueDiscordRequest,
  installSoezyRestQueue,
  routeKeyFromRequest,
  inferQueuePriority,
};
