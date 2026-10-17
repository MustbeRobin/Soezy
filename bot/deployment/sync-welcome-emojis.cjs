"use strict";
const { REST, Routes } = require("discord.js");
const config = require("../config.json");
async function main() {
  const rest = new REST({ version: "10" }).setToken(config.token);
  const app = await rest.get(Routes.oauth2CurrentApplication());
  const route = Routes.applicationEmojis(app.id);
  const { items } = await rest.get(route);
  for (const [name, id] of [["welcome_ping", "1515040064231440497"], ["welcome_arrow", "1533375796612431874"]]) {
    let emoji = items.find(item => item.name === name);
    if (!emoji) {
      const response = await fetch(`https://cdn.discordapp.com/emojis/${id}.png`);
      if (!response.ok) throw new Error(`Emoji image unavailable: ${name}`);
      const image = `data:image/png;base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
      emoji = await rest.post(route, { body: { name, image } });
    }
    console.log(`${name}=<:${emoji.name}:${emoji.id}>`);
  }
}
main().catch(error => { console.error(`Emoji upload failed: ${error.code || error.name}`); process.exitCode = 1; });
