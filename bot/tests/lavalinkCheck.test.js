"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { verifyLavalink } = require("../deployment/lavalink-check");

const configuration = {
  error: null,
  nodes: [{ name: "Wispbyte", url: "78.154.103.22:12174", auth: "test-password", secure: false }],
};

test("Lavalink verifier authenticates to the configured v4 endpoint without leaking the password", async () => {
  const result = await verifyLavalink({
    configuration,
    fetchImpl: async (url, options) => {
      assert.equal(url, "http://78.154.103.22:12174/v4/info");
      assert.equal(options.headers.Authorization, "test-password");
      assert.equal(options.redirect, "error");
      assert.ok(options.signal instanceof AbortSignal);
      return { ok: true, json: async () => ({ version: { semver: "4.2.2" }, sourceManagers: ["youtube", "soundcloud"] }) };
    },
  });
  assert.equal(result.version, "4.2.2");
  assert.deepEqual(result.sources, ["youtube", "soundcloud"]);
  assert.equal(JSON.stringify(result).includes("test-password"), false);
});

test("Lavalink verifier reports invalid configuration, authentication, HTTP and response errors", async () => {
  await assert.rejects(verifyLavalink({ configuration: { error: "Missing password", nodes: [] } }), /Missing password/);
  for (const status of [401, 403]) {
    await assert.rejects(verifyLavalink({ configuration, fetchImpl: async () => ({ status }) }), /Authentication failed/);
  }
  await assert.rejects(verifyLavalink({ configuration, fetchImpl: async () => ({ status: 502 }) }), /HTTP 502/);
  await assert.rejects(verifyLavalink({ configuration, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), /did not return Lavalink/);
});

test("verifier distinguishes connection refused, timeout, DNS and network failures without leaking details", async () => {
  const cases = [
    [{ cause: { code: "ECONNREFUSED" } }, "CONNECTION_REFUSED"],
    [{ name: "TimeoutError" }, "TIMEOUT"],
    [{ cause: { code: "ETIMEDOUT" } }, "TIMEOUT"],
    [{ cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }, "TIMEOUT"],
    [{ cause: { errors: [{ code: "ECONNREFUSED" }] } }, "CONNECTION_REFUSED"],
    [{ cause: { code: "ENOTFOUND" } }, "DNS"],
    [{ cause: { code: "EAI_AGAIN" } }, "DNS"],
    [{ cause: { code: "ECONNRESET" } }, "NETWORK"],
  ];
  for (const [failure, code] of cases) {
    await assert.rejects(verifyLavalink({ configuration, fetchImpl: async () => { throw { message: "test-password", ...failure }; } }), error => {
      assert.equal(error.code, code);
      assert.equal(error.message.includes("test-password"), false);
      return true;
    });
  }
});

test("authentication diagnostics do not echo remote error bodies", async () => {
  let bodyRead = false;
  await assert.rejects(verifyLavalink({ configuration, fetchImpl: async () => ({ status: 401, json() { bodyRead = true; return { password: "test-password" }; } }) }), error => {
    assert.equal(error.code, "AUTH");
    assert.match(error.message, /HTTP 401/);
    return true;
  });
  assert.equal(bodyRead, false);
});

test("source diagnostics distinguish searchable metadata from playable audio", async () => {
  const urls = [];
  const result = await verifyLavalink({ configuration, checkSources: true, fetchImpl: async url => {
    urls.push(url);
    if (url.endsWith("/v4/info")) return Response.json({ version: { semver: "4.2.2" }, sourceManagers: ["youtube", "soundcloud"], plugins: [{ name: "youtube-plugin", version: "1.18.2" }] });
    if (url.includes("/youtube/stream/")) return new Response("private backend error", { status: 500 });
    return Response.json({ loadType: "search", data: [{ encoded: "fixture", info: { identifier: "fixture-video" } }] });
  } });
  assert.deepEqual(result.checks.map(item => item.status), ["tracks found", "unavailable (HTTP 500)", "tracks found"]);
  assert.equal(urls.length, 4);
  assert.doesNotMatch(JSON.stringify(result), /private backend error|test-password/);
});

test("source diagnostics cancel the audio stream after receiving a sample", async () => {
  let cancelled = false;
  const result = await verifyLavalink({ configuration, checkSources: true, fetchImpl: async url => {
    if (url.endsWith("/v4/info")) return Response.json({ version: { semver: "4.2.2" }, sourceManagers: ["youtube"], plugins: [{ name: "youtube-plugin", version: "1.18.2" }] });
    if (url.includes("/youtube/stream/")) return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([79, 103, 103, 83])); },
      cancel() { cancelled = true; },
    }), { headers: { "Content-Type": "audio/ogg" } });
    return Response.json({ loadType: "search", data: [{ encoded: "fixture", info: { identifier: "fixture-video" } }] });
  } });
  assert.equal(result.checks[1].status, "audio bytes received");
  assert.equal(cancelled, true);
});
