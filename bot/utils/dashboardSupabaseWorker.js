"use strict";

const { createClient } = require("@supabase/supabase-js");

const REQUEST_TABLE = "soezy_dashboard_rpc";
const STATE_TABLE = "soezy_bot_state";

function rpcError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function toJsonSafe(value) {
  const serialized = JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") return item.toString();
    if (item instanceof Set) return [...item];
    return item;
  });
  return serialized === undefined ? null : JSON.parse(serialized);
}

function createDispatcher({ bridge, client }) {
  async function assertAccess(guildId, actorId) {
    if (!/^\d{17,20}$/.test(String(guildId)) || !/^\d{17,20}$/.test(String(actorId))) {
      throw rpcError("Invalid identity", 400);
    }
    const guild = client.guilds.cache.get(guildId);
    if (!guild) throw rpcError("Bot is not in this server", 404);
    if (bridge.canManageSecurity(guildId, actorId)) return;
    const member = guild.members.cache.get(actorId) || await guild.members.fetch(actorId).catch(() => null);
    if (!member || !(guild.ownerId === actorId || member.permissions.has(8n) || member.permissions.has(32n))) {
      throw rpcError("Forbidden", 403);
    }
  }

  return async function dispatch(method, args) {
    if (!Array.isArray(args) || args.length > 3) throw rpcError("Invalid arguments", 400);
    if (method === "safeConfig" && args[1] == null) {
      const guildId = String(args[0] || "");
      if (!/^\d{17,20}$/.test(guildId) || !client.guilds.cache.has(guildId)) throw rpcError("Bot is not in this server", 404);
      return bridge.safeConfig(guildId, null);
    }
    if (["safeConfig", "publicGuild", "auditEvents", "updateConfig"].includes(method)) {
      await assertAccess(args[0], method === "updateConfig" ? args[2] : args[1]);
      return bridge[method](...args);
    }
    if (method === "canManageSecurity") return bridge.canManageSecurity(args[0], args[1]);
    if (method === "guildsForSession") {
      return bridge.guildsForSession({ user: args[0]?.user, guilds: args[0]?.guilds });
    }
    if (method === "dashboardAction") {
      await assertAccess(args[0], args[2]);
      return bridge.dashboardAction(args[0], args[1], args[2]);
    }
    throw rpcError("Unknown method", 400);
  };
}

function createDashboardSupabaseWorker({ bridge, client, supabase, url, serviceKey }) {
  const db = supabase || createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const dispatch = createDispatcher({ bridge, client });
  const pollMs = Math.max(500, Number(process.env.SOEZY_DASHBOARD_POLL_MS || 1000));
  const snapshotMs = Math.max(5000, Number(process.env.SOEZY_DASHBOARD_SNAPSHOT_MS || 15000));
  let stopped = false;
  let busy = false;
  let timer;
  let lastSnapshotAt = 0;
  let lastCleanupAt = 0;
  let lastWarningAt = 0;

  function warnOncePerMinute(message) {
    if (Date.now() - lastWarningAt < 60000) return;
    lastWarningAt = Date.now();
    console.warn(message);
  }

  async function publishSnapshot() {
    const [statusResult, healthResult, identityResult, commandsResult, guildIdsResult] = await Promise.allSettled([
      bridge.status(),
      bridge.health(),
      bridge.botIdentity(),
      bridge.scanBotCommands(),
      bridge.botGuildIds()
    ]);
    if (statusResult.status !== "fulfilled") throw statusResult.reason;

    const status = toJsonSafe(statusResult.value || {});
    const health = healthResult.status === "fulfilled" ? toJsonSafe(healthResult.value || {}) : {};
    const identity = identityResult.status === "fulfilled" ? toJsonSafe(identityResult.value || {}) : {};
    const commands = commandsResult.status === "fulfilled" ? toJsonSafe(commandsResult.value || {}) : { categories: [], commands: [], errors: [] };
    const guildIds = guildIdsResult.status === "fulfilled"
      ? [...(guildIdsResult.value instanceof Set ? guildIdsResult.value : new Set(guildIdsResult.value || []))]
      : [];
    const now = new Date();
    const snapshot = toJsonSafe({ status, health, identity, commands, guildIds, updatedAt: now.toISOString() });
    const { error } = await db.from(STATE_TABLE).upsert({
      id: "primary",
      snapshot,
      updated_at: now.toISOString()
    }, { onConflict: "id" });
    if (error) throw error;
    lastSnapshotAt = now.getTime();
  }

  async function processRequests() {
    const { data: requests, error } = await db.from(REQUEST_TABLE)
      .select("id, method, args")
      .eq("state", "pending")
      .order("created_at", { ascending: true })
      .limit(5);
    if (error) throw error;

    for (const request of requests || []) {
      const claimedAt = new Date().toISOString();
      const { data: claimed, error: claimError } = await db.from(REQUEST_TABLE)
        .update({ state: "processing", updated_at: claimedAt })
        .eq("id", request.id)
        .eq("state", "pending")
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) continue;

      try {
        const result = toJsonSafe(await dispatch(request.method, request.args || []));
        const { error: updateError } = await db.from(REQUEST_TABLE)
          .update({ state: "succeeded", result, error: null, updated_at: new Date().toISOString() })
          .eq("id", request.id)
          .eq("state", "processing");
        if (updateError) throw updateError;
      } catch (error) {
        const safeMessage = error?.status ? error.message : "Bot configuration request failed";
        await db.from(REQUEST_TABLE)
          .update({ state: "failed", error: safeMessage,
            result: error?.publicMessage ? { error: { status: error.status, message: error.publicMessage } } : null,
            updated_at: new Date().toISOString() })
          .eq("id", request.id)
          .eq("state", "processing");
      }
    }
  }

  async function cleanup() {
    const now = Date.now();
    if (now - lastCleanupAt < 10 * 60 * 1000) return;
    lastCleanupAt = now;
    await db.from("soezy_web_sessions").delete().lt("expires_at", new Date(now).toISOString());
    await db.from(REQUEST_TABLE)
      .delete()
      .in("state", ["succeeded", "failed", "cancelled"])
      .lt("created_at", new Date(now - 24 * 60 * 60 * 1000).toISOString());
  }

  async function tick() {
    if (stopped || busy) return;
    busy = true;
    try {
      if (Date.now() - lastSnapshotAt >= snapshotMs) await publishSnapshot();
      await processRequests();
      await cleanup();
    } catch {
      warnOncePerMinute("[DASHBOARD] Supabase bridge sync failed; retrying.");
    } finally {
      busy = false;
      if (!stopped) {
        timer = setTimeout(tick, pollMs);
        timer.unref?.();
      }
    }
  }

  return {
    async start() {
      if (!db) throw new Error("Supabase client could not be initialized.");
      void tick();
      return this;
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    }
  };
}

module.exports = { createDashboardSupabaseWorker };
