// Never keep rejected promises (and the object graphs they close over) alive.
const pendingRejections = globalThis.__soezyPendingRejections || (globalThis.__soezyPendingRejections = new WeakMap());

function installCrashRecovery() {
  if (globalThis.__soezyCrashRecoveryInstalled) return;
  globalThis.__soezyCrashRecoveryInstalled = true;

  process.on("unhandledRejection", (reason, promise) => {
    pendingRejections.set(promise, { reason, at: Date.now() });
    console.error("[CRASH] Unhandled rejection:", reason);
  });

  process.on("rejectionHandled", promise => {
    pendingRejections.delete(promise);
  });

  process.on("uncaughtException", err => {
    console.error("[CRASH] Uncaught exception caught:", err);
  });

  process.on("uncaughtExceptionMonitor", err => {
    console.error("[CRASH] Uncaught exception monitor:", err);
  });

}

function installClientRecovery(client) {
  if (!client || client.__soezyRecoveryInstalled) return;
  client.__soezyRecoveryInstalled = true;
  client.on("error", err => console.error("[CLIENT] Error:", err));
  client.on("shardError", (err, shardId) => console.error(`[CLIENT] Shard ${shardId} error:`, err));

  client.on("shardDisconnect", (closeEvent, shardId) => {
    console.warn(`[CLIENT] Shard ${shardId} disconnected (code=${closeEvent?.code}, reason=${closeEvent?.reason || "none"}). Reconnecting automatically.`);
  });

  client.on("shardReconnecting", shardId => console.warn(`[CLIENT] Shard ${shardId} reconnecting.`));
  client.on("shardResume", (shardId, replayedEvents) => console.log(`[CLIENT] Shard ${shardId} resumed (${replayedEvents} events replayed).`));

  client.on("rateLimit", info => {
    incMetric?.("rateLimits", info?.route || "discord", 1);
    console.warn("[CLIENT] Discord rate limit:", info);
  });
}


installCrashRecovery();
if (typeof client !== "undefined") installClientRecovery(client);

Object.assign(globalThis, {
  pendingRejections,
  installCrashRecovery,
  installClientRecovery,
});

module.exports = {
  pendingRejections,
  installCrashRecovery,
  installClientRecovery,
};
