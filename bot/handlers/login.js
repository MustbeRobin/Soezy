/* ================= BOT LOGIN ================= */
var __soezyLoginRoot = typeof process !== "undefined" ? process : globalThis;
// ── Singleton guard: prevents duplicate login + duplicate interval timers ──────
// The VM sandbox in handlers/index.js can execute this file more than once if
// the command registry's require() chain causes a side-effect re-entry.
// Wrapping everything here ensures client.login() is called EXACTLY ONCE and
// all setInterval timers are created exactly once.
if (typeof __soezyLoginRoot.__soezyLoginDone !== "undefined") {
  console.log("[LOGIN] Singleton guard hit — skipping duplicate login.");
} else {
  __soezyLoginRoot.__soezyLoginDone = true;
  globalThis.__soezyLoginDone = true;

  if (typeof validateStartupEnvironment === "function") {
    validateStartupEnvironment({ rootDir: __dirname, config });
  }

  function isTransientLoginError(err) {
    const code = String(err?.code || "");
    const status = Number(err?.status || 0);
    return ["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(code) ||
      [429, 500, 502, 503, 504].includes(status) ||
      [429, 500, 502, 503, 504].includes(Number(code)) ||
      err?.name === "RateLimitError" ||
      err?.message?.toLowerCase?.()?.includes("rate limit");
  }

  function loginWithRetry(attempt = 1) {
    client.login(config.token).catch(err => {
      console.error("Failed to login:", err);
      global.client = client;
      if (!isTransientLoginError(err)) {
        process.exit(1);
        return;
      }

      const retryDelay = Math.min(60_000, 5_000 * attempt);
      console.warn(`[LOGIN] Network/Gateway login failed. Retrying in ${Math.round(retryDelay / 1000)}s (attempt ${attempt + 1}).`);
      setTimeout(() => loginWithRetry(attempt + 1), retryDelay).unref?.();
    });
  }

  loginWithRetry();

  // ── Avatar rotator (checks every hour) ──
  setInterval(async () => {
    for (const [gId, g] of Object.entries(db.guilds || {})) {
      const ra = g.rotateAvatar;
      if (!ra || !ra.images || ra.images.length < 2) continue;
      const intervalMs = (ra.intervalHours || 24) * 3600000;
      if (!ra.lastRotated || Date.now() - ra.lastRotated >= intervalMs) {
        const url = ra.images[Math.floor(Math.random() * ra.images.length)];
        try {
          const res = await fetch(url); const buf = Buffer.from(await res.arrayBuffer());
          await client.user.setAvatar(buf);
          ra.lastRotated = Date.now(); saveDB();
        } catch { }
      }
    }
  }, 60 * 60 * 1000);

  // ── AntiNuke: auto-refresh snapshots every 30 minutes ────────────────────────
  // The comment on takeGuildSnapshot said "refreshed every 30 min" but the interval
  // was never actually created — this is the fix.
  setInterval(async () => {
    for (const [gId, g] of Object.entries(db.guilds || {})) {
      if (!g.antinuke?.enabled) continue;
      const guild = client.guilds.cache.get(gId);
      if (guild) await takeGuildSnapshot(guild).catch(() => { });
    }
    console.log(`[ANTINUKE] Snapshots refreshed for all enabled guilds`);
  }, 30 * 60 * 1000);

} // end __soezyLoginDone guard
