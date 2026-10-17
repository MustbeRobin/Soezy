"use strict";
const categories = ["all", "spam", "mentions", "caps", "invite", "duplicate", "scams", "imageScam", "antilink", "zalgo", "everyone", "badwords", "nsfw"];
function normalize(category) {
  const key = String(category || "").toLowerCase();
  return ({ mention: "mentions", antiinvite: "invite", advinvite: "invite", scam: "scams", "image-scam": "imageScam", imagescam: "imageScam", "anti-link": "antilink", badword: "badwords", "bad-word": "badwords" })[key] || categories.find(value => value.toLowerCase() === key);
}
function resolve(am, category) {
  const key = normalize(category);
  return am?.punishments?.[key] || (key === "antilink" ? am?.punishments?.invite : null) || am?.punishment;
}
function set(am, category, action) {
  category = normalize(category);
  action = String(action).toLowerCase();
  if (!category) throw new Error(`Category must be: ${categories.join(", ")}.`);
  if (!["warn", "timeout", "kick", "ban", "block"].includes(action)) throw new Error("Punishment must be warn, timeout, kick, ban, or block.");
  if (category === "all") {
    am.punishment = action;
    am.punishments = {};
    if (am.advanced) am.advanced.punishment = action;
  } else (am.punishments ||= {})[category] = action;
  return category;
}
module.exports = { categories, resolve, set };
