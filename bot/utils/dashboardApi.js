"use strict";
const http = require("node:http");
const crypto = require("node:crypto");
function createDashboardApi({ bridge, client, secret, port = 4760, host = "127.0.0.1" }) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("Dashboard API requires a secret of at least 32 characters.");
  const expected = Buffer.from(`Bearer ${secret}`);
  const error = (message, status) => Object.assign(new Error(message), { status });
  async function access(guildId, actorId) {
    if (!/^\d{17,20}$/.test(String(guildId)) || !/^\d{17,20}$/.test(String(actorId))) throw error("Invalid identity", 400);
    const guild = client.guilds.cache.get(guildId);
    if (!guild) throw error("Bot is not in this server", 404);
    if (bridge.canManageSecurity(guildId, actorId)) return;
    const member = guild.members.cache.get(actorId) || await guild.members.fetch(actorId).catch(() => null);
    if (!member || !(guild.ownerId === actorId || member.permissions.has(8n) || member.permissions.has(32n))) throw error("Forbidden", 403);
  }
  const server = http.createServer(async (req, res) => {
    const reply = (status, data) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
    const actual = Buffer.from(String(req.headers.authorization || ""));
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return reply(401, { error: "Unauthorized" });
    if (req.method !== "POST" || req.url !== "/rpc") return reply(404, { error: "Not found" });
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 131072) throw error("Request too large", 413); chunks.push(chunk); }
      let payload;
      try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw error("Invalid JSON", 400); }
      const { method, args = [] } = payload;
      if (!Array.isArray(args) || args.length > 3) throw error("Invalid arguments", 400);
      let result;
      if (["status", "health", "botIdentity", "botGuildIds", "scanBotCommands"].includes(method)) result = await bridge[method]();
      else if (method === "canManageSecurity") result = bridge.canManageSecurity(args[0], args[1]);
      else if (method === "guildsForSession") result = await bridge.guildsForSession({ user: args[0]?.user, guilds: args[0]?.guilds });
      else if (["safeConfig", "publicGuild", "auditEvents", "updateConfig"].includes(method)) {
        await access(args[0], method === "updateConfig" ? args[2] : args[1]);
        result = await bridge[method](...args);
      } else throw error("Unknown method", 400);
      reply(200, { ok: true, result: result instanceof Set ? [...result] : result });
    } catch (err) { reply(err.status || 500, { ok: false, error: err.status ? err.message : "Bot configuration request failed" }); }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return { server, start: () => new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, () => { server.off("error", reject); resolve(server.address()); }); }), close: () => new Promise(resolve => server.close(resolve)) };
}
module.exports = { createDashboardApi };
