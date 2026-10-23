const fs = require("fs/promises");
const path = require("path");
const vm = require("vm");
const { createRequire } = require("module");

const rootDir = path.resolve(__dirname, "..");
const rootRequire = createRequire(path.join(rootDir, "index.js"));
require("dotenv").config({ path: path.join(rootDir, ".env") });
require("dotenv").config({ path: path.join(rootDir, "deployment", "dashboard-supabase.env") });
const { loadLavalinkEnvironment, logLavalinkEnvironment } = require("../utils/lavalinkConfig");
logLavalinkEnvironment(loadLavalinkEnvironment());
const runtimeRoot = typeof process !== "undefined" ? process : globalThis;

const runtimeFiles = require("./runtime-files").map(file => path.join(rootDir, file));

async function loadDatabase() {
  const dbPath = path.join(rootDir, "database.json");
  try {
    const raw = await fs.readFile(dbPath, "utf8");
    if (!raw || !raw.trim()) throw new Error("database.json is empty");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("database.json root must be an object");
    return parsed;
  } catch (e) {
    console.warn("[DB] Failed to load database.json:", e.message);
    const backupDir = path.join(rootDir, "logs", "db-backups");
    try {
      const names = (await fs.readdir(backupDir))
        .filter(name => name.startsWith("database-") && name.endsWith(".json"));
      const backups = (await Promise.all(names.map(async name => ({
        name, modified: (await fs.stat(path.join(backupDir, name))).mtimeMs,
      })))).sort((a, b) => b.modified - a.modified).map(entry => entry.name);
      for (const backup of backups) {
        try {
          const raw = await fs.readFile(path.join(backupDir, backup), "utf8");
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            console.warn(`[DB] Recovered database from backup ${backup}.`);
            return parsed;
          }
        } catch (backupErr) {
          console.warn(`[DB] Backup ${backup} was not usable: ${backupErr.message}`);
        }
      }
    } catch {
      // No backup directory yet.
    }
    if (e.code === "ENOENT") return {};
    throw new Error("No valid database or backup available; refusing to overwrite existing data", { cause: e });
  }
}

// ── Singleton boot guard ──────────────────────────────────────────────────────
// Prevents duplicate initialization if this file is ever required more than
// once (e.g. from the command registry's require() chain running alongside the
// VM context execution). We store the flag on globalThis so it is visible both
// inside and outside the VM sandbox.
if (runtimeRoot.__soezyBootStarted) {
  console.warn("[BOOT] handlers/index.js was required more than once — ignoring duplicate call.");
  return;
}
runtimeRoot.__soezyBootStarted = true;
globalThis.__soezyBootStarted = true;

async function start() {
  const { openDatabase } = require("../utils/redisDatabase");
  let store;
  while (!store) {
    try { store = await openDatabase(); }
    catch (error) {
      console.error(`[DB] Redis startup/migration not ready: ${error.message}. JSON remains untouched; retrying in 30s.`);
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }
  const db = store.db;
  globalThis.soezyDatabase = store;
  runtimeRoot.__soezyRuntimeStats = runtimeRoot.__soezyRuntimeStats || {
    loadedFiles: [],
    listenerAdds: {},
    listenerSkips: {},
    handlerAdds: {},
    handlerSkips: {},
    duplicateFiles: [],
  };
  globalThis.__soezyRuntimeStats = runtimeRoot.__soezyRuntimeStats;

  const sandbox = Object.create(globalThis);
  Object.assign(sandbox, {
    require: rootRequire,
    module,
    exports,
    __dirname: rootDir,
    __filename: path.join(rootDir, "index.js"),
    __soezyPreloadedDB: db,
    soezyDatabase: store,
    console,
    process,
    Buffer,
  });
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);

  const seen = new Set();
  for (const file of runtimeFiles) {
    const resolved = path.resolve(file);
    if (seen.has(resolved)) {
      console.warn(`[BOOT] Skipping duplicate runtime file: ${path.relative(rootDir, file)}`);
      runtimeRoot.__soezyRuntimeStats.duplicateFiles.push(path.relative(rootDir, file));
      continue;
    }
    seen.add(resolved);
    const shortName = path.relative(rootDir, file);
    console.log(`[BOOT] Loading: ${shortName}`);
    const source = await fs.readFile(file, "utf8");
    sandbox.__soezyLoadingRuntimeFile = shortName;
    try {
      vm.runInContext(source, context, { filename: file, displayErrors: true });
    } finally {
      sandbox.__soezyLoadingRuntimeFile = null;
    }
    runtimeRoot.__soezyRuntimeStats.loadedFiles.push(shortName);
    console.log(`[BOOT] Loaded:  ${shortName}`);
  }

  const stats = sandbox.__soezyRuntimeStats || runtimeRoot.__soezyRuntimeStats;
  if (typeof sandbox.validateRuntimeFiles === "function") {
    sandbox.validateRuntimeFiles(runtimeFiles, rootDir);
  }
  if (typeof sandbox.validateThemeRuntime === "function") {
    sandbox.validateThemeRuntime(require("./runtime-files"), rootDir);
  }
  if (typeof sandbox.validateCommandExports === "function" && sandbox.commandCollection) {
    sandbox.validateCommandExports(sandbox.commandCollection);
  }
  console.log(`[BOOT] Runtime files loaded: ${stats.loadedFiles.length}`);
  console.log(`[BOOT] Commands loaded: ${sandbox.__soezyCommandCount || 0} registry, ${sandbox.__soezySlashCommandCount || 0} slash payloads`);
  console.log(`[BOOT] Events registered: ${Object.entries(stats.listenerAdds).map(([event, count]) => `${event}=${count}`).join(", ") || "none"}`);
  const skipped = Object.values(stats.listenerSkips).reduce((sum, count) => sum + count, 0) +
    Object.values(stats.handlerSkips).reduce((sum, count) => sum + count, 0);
  if (skipped > 0) console.warn(`[BOOT] Duplicate listener/handler skips: ${skipped}`);
  console.log("[BOOT] All files loaded. Bot is now connecting to Discord...");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (supabaseUrl && supabaseServiceKey && !process.__soezyDashboardSupabaseWorker) {
    try {
      const client = process.__soezyDiscordClient || sandbox.client || globalThis.client;
      if (!client) throw new Error("Discord client is not initialized");
      const { createBotBridge } = require("../utils/dashboardRuntime");
      const bridge = createBotBridge({ config: { bot: { dir: rootDir, getClient: () => client, onConfigUpdated: async (id, applied) => {
        const guild = client.guilds.cache.get(id);
        if (!Object.keys(applied || {}).some(key => /^(automod|security|badWord|nsfw|accountAge|antibot|antilink)/.test(key))) return null;
        if (!guild || typeof sandbox?.soezyNativeAutomod?.syncFilters !== "function") {
          return { nativeAutomodSync: { status: "pending", message: "Settings were saved, but the bot is not connected to this server yet; Discord AutoMod rules have not synchronized." } };
        }
        const ruleCount = await sandbox.soezyNativeAutomod.syncFilters(guild, sandbox.soezyNativeAutomodDeps);
        return { nativeAutomodSync: { status: "synced", ruleCount, message: "Discord AutoMod rules are synchronized." } };
      }, onCommunityUpdated: async (id, module) => {
        if (module === "autoresponder" || module === "autoreact") sandbox.refreshRuntime(id, module);
      } } } });
      const { createClient } = require("@supabase/supabase-js");
      const { createDashboardSupabaseWorker } = require("../utils/dashboardSupabaseWorker");
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
      });
      const worker = createDashboardSupabaseWorker({ bridge, client, supabase });
      await worker.start();
      process.__soezyDashboardSupabaseWorker = worker;
      console.log("[DASHBOARD] Supabase bridge worker started; publishing bot status and processing dashboard requests.");
    } catch (error) {
      console.error("[DASHBOARD] Supabase bridge failed to start:", error.message);
    }
  } else if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("[DASHBOARD] Supabase bridge is disabled; set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
}

start().catch(err => {
  console.error("[BOOT] Failed to start bot:", err);
  process.exit(1);
});
