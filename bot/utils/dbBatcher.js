/* ================= DB BATCHER SHIM =================
 * The project already queues database writes in dbWriteQueue.js. This wrapper
 * adds dirty-dbBatchRuntimeState metadata and a single scheduling API for new code.
 */
(() => {
const dbBatchRuntimeState = globalThis.__soezyDbBatchState || (globalThis.__soezyDbBatchState = {
  dirtySince: 0,
  dirtyReasons: new Map(),
});

function markDbDirty(reason = "unknown") {
  if (dbBatchRuntimeState.dirtyReasons.size >= 100 && !dbBatchRuntimeState.dirtyReasons.has(reason)) reason = "other";
  if (!dbBatchRuntimeState.dirtySince) dbBatchRuntimeState.dirtySince = Date.now();
  dbBatchRuntimeState.dirtyReasons.set(reason, (dbBatchRuntimeState.dirtyReasons.get(reason) || 0) + 1);
}

function resetDbBatchState() {
  dbBatchRuntimeState.dirtySince = 0;
  dbBatchRuntimeState.dirtyReasons.clear();
}

function scheduleDbSave(reason = "unknown") {
  markDbDirty(reason);
  if (typeof saveDB === "function") saveDB();
}

function getDbBatchState() {
  return {
    dirtySince: dbBatchRuntimeState.dirtySince,
    dirtyReasons: Object.fromEntries(dbBatchRuntimeState.dirtyReasons),
  };
}

Object.assign(globalThis, { markDbDirty, scheduleDbSave, getDbBatchState, resetDbBatchState });
module.exports = { markDbDirty, scheduleDbSave, getDbBatchState };
})();
