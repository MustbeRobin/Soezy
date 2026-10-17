"use strict";

const { getLavalinkConfiguration, redactLavalinkError, loadLavalinkEnvironment, logLavalinkEnvironment } = require("../utils/lavalinkConfig");

function verificationError(code, message) {
  return Object.assign(new Error(message), { code });
}

function networkError(error) {
  const codes = new Set();
  const pending = [error];
  const seen = new Set();
  while (pending.length && seen.size < 16) {
    const item = pending.pop();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    codes.add(item.code);
    codes.add(item.name);
    if (item.cause) pending.push(item.cause);
    if (Array.isArray(item.errors)) pending.push(...item.errors);
  }
  if (["TimeoutError", "AbortError", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"].some(code => codes.has(code))) {
    return verificationError("TIMEOUT", "Connection timed out. Check whether Lavalink is running and the port is reachable.");
  }
  if (codes.has("ECONNREFUSED")) return verificationError("CONNECTION_REFUSED", "Connection refused. Nothing is accepting connections at the configured address/port.");
  if (codes.has("ENOTFOUND") || codes.has("EAI_AGAIN")) return verificationError("DNS", "DNS lookup failed. Check the configured hostname and DNS service.");
  return verificationError("NETWORK", "Network/TLS request failed. Check routing, firewall rules and the secure setting.");
}

async function verifyLavalink({ configuration = getLavalinkConfiguration(), fetchImpl = globalThis.fetch, checkSources = false } = {}) {
  if (configuration.error || !configuration.nodes.length) {
    throw verificationError("CONFIG", configuration.error || "No Lavalink node configured");
  }
  const node = configuration.nodes[0];
  const url = `${node.secure ? "https" : "http"}://${node.url}/v4/info`;
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: node.auth },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
  } catch (error) {
    throw networkError(error);
  }
  if (response.status === 401 || response.status === 403) {
    throw verificationError("AUTH", `HTTP ${response.status}: Authentication failed. The server is reachable but rejected LAVALINK_PASSWORD. Match it to the secret used by the running Lavalink instance.`);
  }
  if (!response.ok) throw verificationError("HTTP", `Lavalink returned HTTP ${response.status}`);
  let info;
  try {
    info = await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) throw verificationError("RESPONSE", "The endpoint did not return valid Lavalink JSON.");
    throw networkError(error);
  }
  if (typeof info?.version?.semver !== "string" || !info.version.semver.startsWith("4.") || !Array.isArray(info.sourceManagers)) {
    throw verificationError("RESPONSE", "The endpoint did not return Lavalink v4 server information");
  }
  const result = { node: node.name, address: node.url, version: info.version.semver, sources: info.sourceManagers,
    plugins: (info.plugins || []).map(plugin => ({ name: plugin.name, version: plugin.version })) };
  if (checkSources) {
    result.checks = [];
    for (const prefix of ["ytsearch", "scsearch"]) {
      try {
        const target = new URL(url);
        target.pathname = "/v4/loadtracks";
        target.searchParams.set("identifier", `${prefix}:sombr we never dated`);
        const response = await fetchImpl(target.href, { headers: { Authorization: node.auth }, signal: AbortSignal.timeout(15000), redirect: "error" });
        if (!response.ok) throw verificationError("HTTP", `HTTP ${response.status}`);
        const loaded = await response.json();
        const tracks = Array.isArray(loaded.data) ? loaded.data : loaded.data?.tracks || (loaded.data?.encoded ? [loaded.data] : []);
        result.checks.push({ source: prefix, status: tracks.length ? "tracks found" : "no playable metadata", count: tracks.length });
        if (prefix === "ytsearch" && tracks[0]?.info?.identifier && info.plugins?.some(plugin => /youtube/i.test(plugin.name))) {
          target.pathname = `/youtube/stream/${encodeURIComponent(tracks[0].info.identifier)}`;
          target.search = "";
          const audio = await fetchImpl(target.href, { headers: { Authorization: node.auth }, signal: AbortSignal.timeout(20000), redirect: "error" });
          let received = false;
          try {
            if (audio.ok && /audio|video|octet-stream/i.test(audio.headers.get("content-type") || "")) {
              const reader = audio.body.getReader();
              try { const first = await reader.read(); received = !first.done && first.value?.byteLength > 0; }
              finally { await reader.cancel(); }
            }
          } finally { if (audio.body && !audio.body.locked) await audio.body.cancel().catch(() => {}); }
          result.checks.push({ source: "YouTube audio", status: received ? "audio bytes received" : `unavailable (HTTP ${audio.status})` });
        }
      } catch (error) {
        result.checks.push({ source: prefix, status: `check failed (${error.code || networkError(error).code})` });
      }
    }
  }
  return result;
}

if (require.main === module) {
  Promise.resolve().then(() => {
    logLavalinkEnvironment(loadLavalinkEnvironment());
    const configuration = getLavalinkConfiguration();
    if (configuration.nodes[0]) {
      const node = configuration.nodes[0];
      console.log(redactLavalinkError(`[LAVALINK] Target: ${node.name} ${node.url}; secure: ${node.secure}`));
    }
    return verifyLavalink({ configuration, checkSources: process.argv.includes("--sources") });
  }).then(result => {
    console.log(`[LAVALINK] Connected and authenticated: ${result.node} (${result.address})`);
    console.log(`[LAVALINK] Version: ${result.version}`);
    console.log(`[LAVALINK] Sources: ${result.sources.join(", ")}`);
    console.log(`[LAVALINK] Plugins: ${result.plugins.map(plugin => `${plugin.name} ${plugin.version}`).join(", ") || "none"}`);
    for (const check of result.checks || []) console.log(`[LAVALINK] ${check.source}: ${check.status}${check.count !== undefined ? ` (${check.count})` : ""}`);
    console.log("[LAVALINK] HTTP check passed; Discord voice playback must be tested separately.");
  }).catch(error => {
    console.error(`[LAVALINK] Verification failed (${error.code || "CONFIG"}): ${redactLavalinkError(error)}`);
    process.exitCode = 1;
  });
}

module.exports = { verifyLavalink };
