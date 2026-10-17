(() => {
function installSaveHandler() {
  if (globalThis.__soezySaveHandlerInstalled) return false;
  globalThis.__soezySaveHandlerInstalled = true;

  async function flush(reason = "manual") {
    try {
      if (typeof flushDatabaseWrite === "function") {
        const saved = await flushDatabaseWrite("./database.json", () => db);
        if (!saved) return false;
      } else if (typeof _flushDB === "function") {
        await _flushDB();
      }
      console.log(`[DB] Flush complete (${reason}).`);
      return true;
    } catch (err) {
      console.error(`[DB] Flush failed (${reason}):`, err);
      return false;
    }
  }

  globalThis.forceSaveDB = flush;

  let stopping = false;
  async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    let saved = false;
    try {
      saved = await shutdownDatabaseWrites("./database.json", () => db);
      if (!saved && globalThis.soezyDatabase) {
        try { await globalThis.soezyDatabase.preservePending(db); }
        catch (error) { console.error(`[DB] Could not preserve unsynced changes: ${error.code || error.message}`); }
      }
      if (!saved) console.error("[DB] Primary-store shutdown flush failed. Check the pending recovery snapshot before restarting.");
      if (typeof client !== "undefined") await client.destroy();
      if (globalThis.soezyDatabase) {
        await globalThis.soezyDatabase.close();
        await require("./utils/redis").closeRedis();
      }
    } catch (err) { console.error(`[DB] Shutdown failed: ${err.code || err.message}`); }
    if (signal !== "beforeExit") process.exit(saved ? 0 : 1);
  }
  process.once("beforeExit", () => shutdown("beforeExit"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  console.log("[DB] Save handler installed.");
  return true;
}

installSaveHandler();

module.exports = { installSaveHandler };
})();
