"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");
(async () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../config/settings.js"), "utf8");
  const matches = [...source.matchAll(/(stats_\w+):\s*'<(a?):[^:]+:(\d+)>'/g)];
  const rest = new REST({ version: "10" }).setToken(require("../config.json").token);
  const app = await rest.get(Routes.oauth2CurrentApplication());
  if (app.id !== "1456175060128632996") throw new Error("Token does not belong to Soezy");
  const route = Routes.applicationEmojis(app.id);
  const { items } = await rest.get(route);
  for (const [, key, animated, id] of matches) {
    let emoji = items.find(item => item.name === key);
    if (!emoji) {
      const ext = animated ? "gif" : "png";
      const response = await fetch(`https://cdn.discordapp.com/emojis/${id}.${ext}`, { signal: AbortSignal.timeout(30000) });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error(`Cannot download ${key}: HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 256 * 1024) throw new Error(`${key} exceeds the emoji upload size limit`);
      emoji = await rest.post(route, { body: { name: key, image: `data:image/${ext};base64,${bytes.toString("base64")}` } });
      items.push(emoji);
    }
    console.log(`${key}: '<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>',`);
  }
})().catch(error => { console.error(`Stats emoji upload failed: ${error.code || "error"} ${error.message}`); process.exitCode = 1; });
