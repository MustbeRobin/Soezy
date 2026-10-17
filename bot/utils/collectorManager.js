/* ================= COLLECTOR MANAGER SHIM =================
 * Collector/session lifecycle helpers live in utils/interactionManager.js.
 * This file is kept in the runtime load list for backward compatibility only.
 */
(() => {
if (!globalThis.__soezyCollectors) globalThis.__soezyCollectors = new Map();
if (!globalThis.__soezyCollectorSessions) globalThis.__soezyCollectorSessions = new Map();
})();
