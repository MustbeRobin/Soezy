"use strict";

const MAX_STORED_LIST_ENTRIES = 100;

function expiryTime(value) {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) return value.getTime();
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric > 0 && numeric < 100000000000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function active(record, now = Date.now()) {
  if (!record || typeof record !== "object") return false;
  const expiresAt = expiryTime(record.expiresAt ?? record.premiumUntil ?? record.expires);
  return expiresAt !== null && now < expiresAt;
}

function planName(record) {
  const plan = String(record?.plan || "plus").toLowerCase();
  return ["plus", "pro", "ultra"].includes(plan) ? plan : "plus";
}

function resolvePlan(db, userId, guildId, now = Date.now()) {
  const userPlan = db?.premium?.users?.[String(userId || "")];
  if (active(userPlan, now)) return planName(userPlan);

  const guildPlan = db?.premium?.guilds?.[String(guildId || "")] || db?.guilds?.[String(guildId || "")]?.premium;
  if (active(guildPlan, now)) return planName(guildPlan);

  const shopPlan = db?.shopPremium?.[String(userId || "")]?.[String(guildId || "")];
  if (active(shopPlan, now)) return planName(shopPlan);
  return null;
}

function securityListLimit(db, userId, guildId, now = Date.now()) {
  const plan = resolvePlan(db, userId, guildId, now);
  if (plan === "ultra") return MAX_STORED_LIST_ENTRIES;
  if (plan === "pro") return 10;
  if (plan === "plus") return 3;
  return 1;
}

module.exports = { MAX_STORED_LIST_ENTRIES, active, expiryTime, resolvePlan, securityListLimit };
