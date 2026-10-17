/* A write always represents the newest in-memory snapshot, not an ever-growing
 * task queue. This makes disk-full incidents recoverable without a retry storm. */
(() => {
const dbWriteFs = require("fs");
const dbWritePath = require("path");
const DB_WRITE_MIN_INTERVAL_MS = 1500;
const DB_WRITE_RETRY_BASE_MS = 5000;
const DB_WRITE_RETRY_MAX_MS = 5 * 60 * 1000;
const BACKUP_INTERVAL_MS = 15 * 60 * 1000;
const MAX_BACKUPS = 5;
const ERROR_LOG_COOLDOWN_MS = 60 * 1000;
const dbWriteState = globalThis.__soezyDbWriteState || (globalThis.__soezyDbWriteState = {
  timer: null, inProgress: false, pending: false, filePath: null, getValue: null,
  lastBackupAt: 0, failureCount: 0, backoffUntil: 0, lastErrorSignature: null,
  lastErrorLoggedAt: 0, lastWriteAt: 0, activePromise: null, stopped: false,
});
if (globalThis.soezyDatabase && !globalThis.soezyDatabase.resumeWrites) {
  const resume = () => {
    dbWriteState.backoffUntil = 0;
    dbWriteState.failureCount = 0;
    if (dbWriteState.timer) { clearTimeout(dbWriteState.timer); dbWriteState.timer = null; }
    if (dbWriteState.pending && !dbWriteState.inProgress) scheduleFlush(0);
  };
  globalThis.soezyDatabase.resumeWrites = resume;
  globalThis.soezyDatabase.client.on("ready", resume);
}

function ensureDir(dir) { if (!dbWriteFs.existsSync(dir)) dbWriteFs.mkdirSync(dir, { recursive: true }); }
function isDiskFullError(err) { return err?.code === "ENOSPC" || /no space left on device|enospc/i.test(String(err?.message || "")); }
function retryDelayMs() { return Math.min(DB_WRITE_RETRY_MAX_MS, DB_WRITE_RETRY_BASE_MS * (2 ** Math.min(dbWriteState.failureCount, 6))); }
function logWriteFailure(err) {
  const signature = `${err?.code || "ERR"}:${String(err?.message || err).slice(0, 240)}`;
  const now = Date.now();
  if (signature === dbWriteState.lastErrorSignature && now - dbWriteState.lastErrorLoggedAt < ERROR_LOG_COOLDOWN_MS) return;
  dbWriteState.lastErrorSignature = signature;
  dbWriteState.lastErrorLoggedAt = now;
  console.error(`[DB] Safe write failed${isDiskFullError(err) ? " (disk full)" : ""}; retaining the latest state and retrying in ${Math.ceil(Math.max(0, dbWriteState.backoffUntil - now) / 1000)}s: ${signature}`);
}
function scheduleFlush(delayMs = DB_WRITE_MIN_INTERVAL_MS) {
  if (dbWriteState.stopped || dbWriteState.timer || !dbWriteState.filePath || typeof dbWriteState.getValue !== "function") return;
  dbWriteState.timer = setTimeout(() => { dbWriteState.timer = null; flushDatabaseWrite(); }, Math.max(0, delayMs, dbWriteState.backoffUntil - Date.now()));
  dbWriteState.timer.unref?.();
}
async function rotateDatabaseBackups(dbPath) {
  const now = Date.now();
  if (now - dbWriteState.lastBackupAt < BACKUP_INTERVAL_MS || !dbWriteFs.existsSync(dbPath)) return;
  const backupDir = dbWritePath.join(dbWritePath.dirname(dbPath), "logs", "db-backups");
  ensureDir(backupDir);
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  const backupPath = dbWritePath.join(backupDir, `database-${stamp}.json`);
  const backupTmp = dbWritePath.join(backupDir, "database-backup.tmp");
  try {
    await dbWriteFs.promises.copyFile(dbPath, backupTmp);
    await dbWriteFs.promises.rename(backupTmp, backupPath);
  } catch (err) {
    await dbWriteFs.promises.unlink(backupTmp).catch(() => {});
    throw err;
  }
  dbWriteState.lastBackupAt = now;
  // Only auto-generated snapshots rotate. Never delete manual/pre-migration backups.
  const backups = (await dbWriteFs.promises.readdir(backupDir)).filter(name => /^database-\d{4}-\d{2}-\d{2}T[\d-]+Z\.json$/.test(name)).sort();
  while (backups.length > MAX_BACKUPS) await dbWriteFs.promises.unlink(dbWritePath.join(backupDir, backups.shift()));
}
async function writeSnapshot(filePath, value) {
  const dbPath = dbWritePath.resolve(filePath); const tmp = `${dbPath}.tmp`; const json = JSON.stringify(value, null, 2);
  JSON.parse(json); // never replace the database with invalid JSON
  try { await dbWriteFs.promises.unlink(tmp); } catch (err) { if (err?.code !== "ENOENT") throw err; }
  try {
    const handle = await dbWriteFs.promises.open(tmp, "w");
    try { await handle.writeFile(json, "utf8"); await handle.sync(); }
    finally { await handle.close(); }
    await dbWriteFs.promises.rename(tmp, dbPath);
  }
  catch (err) { try { await dbWriteFs.promises.unlink(tmp); } catch {} throw err; }
  // Persistence takes priority over snapshots if storage is scarce.
  try { await rotateDatabaseBackups(dbPath); }
  catch (err) {
    dbWriteState.lastBackupAt = Date.now();
    console.warn(`[DB] Backup deferred: ${err.code || "IO_ERROR"}. Database write succeeded.`);
  }
}
function queueDatabaseWrite(filePath, getValue) {
  dbWriteState.filePath = filePath; dbWriteState.getValue = getValue; dbWriteState.pending = true;
  if (!dbWriteState.inProgress) scheduleFlush(DB_WRITE_MIN_INTERVAL_MS);
  return getDbWriteQueueStats();
}
function flushDatabaseWrite(filePath = null, getValue = null) {
  if (filePath) dbWriteState.filePath = filePath;
  if (getValue) { dbWriteState.getValue = getValue; dbWriteState.pending = true; }
  if (dbWriteState.inProgress) {
    if (!getValue) return dbWriteState.activePromise;
    return dbWriteState.activePromise.then(saved => dbWriteState.pending ? flushDatabaseWrite() : saved);
  }
  if (!dbWriteState.filePath || typeof dbWriteState.getValue !== "function") return Promise.resolve(false);
  if (Date.now() < dbWriteState.backoffUntil) { scheduleFlush(dbWriteState.backoffUntil - Date.now()); return Promise.resolve(false); }
  if (dbWriteState.timer) { clearTimeout(dbWriteState.timer); dbWriteState.timer = null; }
  dbWriteState.inProgress = true; dbWriteState.pending = false;
  dbWriteState.activePromise = performWrite();
  return dbWriteState.activePromise;
}
async function performWrite() {
  try {
    if (globalThis.soezyDatabase) await globalThis.soezyDatabase.write(dbWriteState.getValue());
    else await writeSnapshot(dbWriteState.filePath, dbWriteState.getValue());
    globalThis.resetDbBatchState?.();
    dbWriteState.failureCount = 0; dbWriteState.backoffUntil = 0; dbWriteState.lastErrorSignature = null; dbWriteState.lastWriteAt = Date.now();
    globalThis.incMetric?.("queues", "dbWrites", 1); return true;
  } catch (err) {
    dbWriteState.failureCount += 1; dbWriteState.backoffUntil = Date.now() + retryDelayMs(); dbWriteState.pending = true;
    globalThis.incMetric?.("queues", "dbWriteFailures", 1); logWriteFailure(err); return false;
  } finally {
    dbWriteState.inProgress = false;
    if (dbWriteState.pending) scheduleFlush(dbWriteState.backoffUntil > Date.now() ? dbWriteState.backoffUntil - Date.now() : DB_WRITE_MIN_INTERVAL_MS);
  }
}
async function shutdownDatabaseWrites(filePath, getValue) {
  dbWriteState.stopped = true;
  if (dbWriteState.timer) { clearTimeout(dbWriteState.timer); dbWriteState.timer = null; }
  if (dbWriteState.activePromise) await dbWriteState.activePromise;
  return flushDatabaseWrite(filePath, getValue);
}
function safeWriteJson(filePath, value) {
  return flushDatabaseWrite(filePath, () => value);
}
function getDbWriteQueueStats() { return { pending: dbWriteState.pending ? 1 : 0, inProgress: dbWriteState.inProgress ? 1 : 0, failures: dbWriteState.failureCount, retryInMs: Math.max(0, dbWriteState.backoffUntil - Date.now()), lastWriteAt: dbWriteState.lastWriteAt }; }
Object.assign(globalThis, { queueDatabaseWrite, flushDatabaseWrite, safeWriteJson, rotateDatabaseBackups, getDbWriteQueueStats, shutdownDatabaseWrites });
module.exports = { queueDatabaseWrite, flushDatabaseWrite, safeWriteJson, rotateDatabaseBackups, getDbWriteQueueStats, shutdownDatabaseWrites };
})();
