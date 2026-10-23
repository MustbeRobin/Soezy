const { test } = require("node:test");
const assert = require("node:assert/strict");
const { databaseHealthStatus } = require("../utils/dashboardRuntime");

test("reports Redis as the primary database instead of the stale JSON bootstrap file", () => {
  const status = databaseHealthStatus({
    store: { client: { isReady: true }, revision: "17", db: {}, batch: null },
    databaseStat: { mtimeMs: 100, size: 500 },
    guildCount: 8,
    runtimeDb: {}
  });
  assert.equal(status.ok, true);
  assert.equal(status.connected, true);
  assert.equal(status.mode, "redis");
  assert.equal(status.revision, "17");
  assert.equal(status.file, null);
  assert.equal(status.updatedAt, null);
});

test("reports a disconnected Redis store and pending writes without claiming it is healthy", () => {
  const status = databaseHealthStatus({
    store: { client: { isReady: false }, revision: "17", db: {}, batch: { id: "pending" } },
    databaseStat: { mtimeMs: 100, size: 500 },
    guildCount: 8,
    runtimeDb: {}
  });
  assert.equal(status.ok, false);
  assert.equal(status.connected, false);
  assert.equal(status.mode, "redis");
  assert.equal(status.pendingWrites, true);
  assert.equal(status.file, null);
});
