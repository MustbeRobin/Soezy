"use strict";

async function startDashboardSupabaseWorker({ client, rootDir, sandbox }) {
  if (!client) throw new Error("Discord client is not initialized");
  if (process.__soezyDashboardSupabaseWorker) return process.__soezyDashboardSupabaseWorker;

  const { createClient } = require("@supabase/supabase-js");
  const { createBotBridge } = require("./dashboardRuntime");
  const { createDashboardSupabaseWorker } = require("./dashboardSupabaseWorker");
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
  );
  const bridge = createBotBridge({
    config: {
      bot: {
        dir: rootDir,
        getClient: () => client,
        onConfigUpdated: async (guildId, applied) => {
          if (!Object.keys(applied || {}).some(key => /^(automod|security|badWord|nsfw|accountAge|antibot|antilink)/.test(key))) return null;
          const guild = client.guilds.cache.get(guildId);
          if (!guild || typeof sandbox?.soezyNativeAutomod?.syncFilters !== "function") {
            return { nativeAutomodSync: { status: "pending", message: "Settings were saved, but the bot is not connected to this server yet; Discord AutoMod rules have not synchronized." } };
          }
          const ruleCount = await sandbox.soezyNativeAutomod.syncFilters(guild, sandbox.soezyNativeAutomodDeps);
          return { nativeAutomodSync: { status: "synced", ruleCount, message: "Discord AutoMod rules are synchronized." } };
        }
      }
    }
  });
  const worker = createDashboardSupabaseWorker({ bridge, client, supabase });
  await worker.start();
  process.__soezyDashboardSupabaseWorker = worker;
  console.log("[DASHBOARD] Supabase bridge worker started; publishing bot status and processing dashboard requests.");
  return worker;
}

module.exports = { startDashboardSupabaseWorker };
