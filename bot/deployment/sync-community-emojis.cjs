"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");
async function main() {
  const root = path.resolve(__dirname, "..");
  const settings = fs.readFileSync(path.join(root, "config/settings.js"), "utf8");
  const block = settings.split("// Community-provided emoji set")[1].split("// Personality emojis")[0];
  const matches = [...block.matchAll(/\w+:\s*'<(a?):([^:]+):(\d+)>'/g)];
  matches.push([null, "a", "thinking", "1487769302462501046"]);
  const config = require("../config.json");
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN || config.token);
  const app = await rest.get(Routes.oauth2CurrentApplication());
  const route = Routes.applicationEmojis(app.id);
  const { items } = await rest.get(route);
  const replacements = new Map();
  for (const [, animated, originalName, id] of matches) {
    const name = id === "1538446629726846976" ? "6_babi" : originalName;
    let emoji = items.find(item => item.name === name);
    if (!emoji) {
      const ext = animated ? "gif" : "png";
      const response = await fetch(`https://cdn.discordapp.com/emojis/${id}.${ext}`);
      if (!response.ok) throw new Error(`Image unavailable for ${name}: ${response.status}`);
      const image = `data:image/${ext};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
      emoji = await rest.post(route, { body: { name, image } });
      items.push(emoji);
    }
    replacements.set(id, `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`);
    console.log(`Verified ${name}`);
  }
  for (const dir of ["config", "utils", "events", "commands", "handlers", "systems"]) {
    function walk(folder) {
      for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
        const file = path.join(folder, item.name);
        if (item.isDirectory()) walk(file);
        else if (file.endsWith(".js")) {
          const before = fs.readFileSync(file, "utf8");
          const after = before.replace(/<a?:[^:>]+:(\d+)>/g, (value, id) => replacements.get(id) || value);
          if (after !== before) fs.writeFileSync(file, after);
        }
      }
    }
    walk(path.join(root, dir));
  }
  console.log(`Synced ${replacements.size} application emojis and source references.`);
}
main().catch(error => { console.error(`Emoji sync failed: ${error.code || error.name}: ${error.message?.replace(/Bot\s+\S+/g, "[redacted]")}`); process.exitCode = 1; });
