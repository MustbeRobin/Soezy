"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { getLavalinkConfiguration, redactLavalinkError, loadLavalinkEnvironment, logLavalinkEnvironment } = require("../utils/lavalinkConfig");

test("Lavalink validates remote node settings and redacts credentials", () => {
  const resolve = () => getLavalinkConfiguration({ settings: {} });
  const keys = ["LAVALINK_HOST", "LAVALINK_PORT", "LAVALINK_PASSWORD", "LAVALINK_NAME", "LAVALINK_SECURE"];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, { LAVALINK_HOST: "78.154.103.22", LAVALINK_PORT: "12174", LAVALINK_PASSWORD: "test-secret", LAVALINK_NAME: "Wispbyte", LAVALINK_SECURE: "false" });
    assert.deepEqual(resolve(), { nodes: [{ name: "Wispbyte", url: "78.154.103.22:12174", auth: "test-secret", secure: false }], error: null });
    process.env.LAVALINK_SECURE = "true";
    assert.equal(resolve().nodes[0].secure, true);
    process.env.LAVALINK_SECURE = "invalid";
    assert.ok(resolve().error);
    process.env.LAVALINK_SECURE = "false";
    for (const port of ["0", "65536", "abc", "1.5"]) {
      process.env.LAVALINK_PORT = port;
      assert.ok(resolve().error);
    }
    process.env.LAVALINK_PORT = "12174";
    process.env.LAVALINK_HOST = "http://78.154.103.22";
    assert.ok(resolve().error);
    process.env.LAVALINK_HOST = "78.154.103.22";
    assert.equal(redactLavalinkError(new Error("test-secret test-secret")), "[REDACTED] [REDACTED]");
    delete process.env.LAVALINK_PASSWORD;
    assert.equal(resolve().nodes.length, 0);
  } finally {
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
});

const settings = { host: "78.154.103.22", port: 12174, name: "Wispbyte", secure: false };

function environmentFile(t, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "soezy-lavalink-env-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, ".env");
  if (content !== null) fs.writeFileSync(file, content);
  return file;
}

test("config.json selects non-secrets while the password comes only from LAVALINK_PASSWORD", () => {
  const env = { LAVALINK_HOST: "stale.invalid", LAVALINK_PORT: "99", LAVALINK_SECURE: "true", LAVALINK_PASSWORD: "current-test-value" };
  const result = getLavalinkConfiguration({ settings: { ...settings, password: "ignored", auth: "ignored" }, env });
  assert.deepEqual(result.nodes, [{ name: "Wispbyte", url: "78.154.103.22:12174", secure: false, auth: "current-test-value" }]);
  assert.equal(getLavalinkConfiguration({ settings, env: { LAVALINK_SERVER_PASSWORD: "not-a-bot-variable" } }).nodes.length, 0);
  assert.ok(getLavalinkConfiguration({ settings: { ...settings, secure: "invalid" }, env }).error);
});

test("project .env overrides stale PM2 Lavalink secrets but never unrelated environment variables", t => {
  const file = environmentFile(t, 'LAVALINK_PASSWORD="new:secret#fixture"\nREDIS_PASSWORD=must-not-apply\nDISCORD_TOKEN=must-not-apply\n');
  const env = { LAVALINK_PASSWORD: "old-secret-fixture", REDIS_PASSWORD: "keep-redis", DISCORD_TOKEN: "keep-token" };
  const status = loadLavalinkEnvironment({ file, env });
  assert.equal(env.LAVALINK_PASSWORD, "new:secret#fixture");
  assert.equal(env.REDIS_PASSWORD, "keep-redis");
  assert.equal(env.DISCORD_TOKEN, "keep-token");
  assert.deepEqual(status, { filePresent: true, passwordLoaded: true, source: "project .env", inheritedPasswordOverridden: true });
  const logs = [];
  logLavalinkEnvironment(status, { log: text => logs.push(text), warn: text => logs.push(text) });
  assert.equal(logs.join(" ").includes("secret-fixture"), false);
  assert.equal(logs.join(" ").includes("new:secret#fixture"), false);
  assert.equal(redactLavalinkError("old-secret-fixture new:secret#fixture new%3Asecret%23fixture"), "[REDACTED] [REDACTED] [REDACTED]");
});

test("empty .env password does not silently fall back to an inherited password", t => {
  const file = environmentFile(t, "LAVALINK_PASSWORD=\n");
  const env = { LAVALINK_PASSWORD: "stale-fixture" };
  assert.equal(loadLavalinkEnvironment({ file, env }).passwordLoaded, false);
  assert.ok(getLavalinkConfiguration({ settings, env }).error);
});

test("a missing .env supports explicit process environment without reading the server variable", t => {
  const file = environmentFile(t, null);
  const env = { LAVALINK_PASSWORD: "injected-fixture" };
  const status = loadLavalinkEnvironment({ file, env });
  assert.equal(status.filePresent, false);
  assert.equal(status.source, "process environment");
  assert.equal(getLavalinkConfiguration({ settings, env }).nodes[0].auth, "injected-fixture");
  assert.equal(loadLavalinkEnvironment({ file, env: { LAVALINK_SERVER_PASSWORD: "ignored-fixture" } }).passwordLoaded, false);
});

test("malformed password values are reported without trimming or echoing credentials", () => {
  for (const password of [" secret-fixture", "secret-fixture ", '"secret-fixture"', "secret\nfixture", "secret\0fixture"]) {
    const result = getLavalinkConfiguration({ settings, env: { LAVALINK_PASSWORD: password } });
    assert.equal(result.nodes.length, 0);
    assert.ok(result.error);
    assert.equal(result.error.includes(password), false);
  }
});
