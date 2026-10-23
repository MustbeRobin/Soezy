"use strict";

const number = (path, label, min, max, value, step = 1) => ({ path, label, type: "number", min, max, default: value, step });
const choice = (path, label, options, value, legacyPaths = []) => ({ path, label, type: "select", options, default: value, legacyPaths });
const punishments = ["block", "warn", "timeout", "kick", "ban"];

const antiNukeGroups = {
  "Member Actions": [["antiban", "Anti Ban", "maxBans"], ["antiunban", "Anti Unban", null, 1], ["antikick", "Anti Kick / Prune", "maxKicks"], ["antimemberupdate", "Anti Member Update", "maxKicks"]],
  Channels: [["antichannelcreate", "Anti Channel Create", "maxChannelDelete"], ["antichanneldelete", "Anti Channel Delete", "maxChannelDelete"], ["antichannelupdate", "Anti Channel Update", "maxChannelDelete"]],
  Roles: [["antirolecreate", "Anti Role Create", "maxRoleDelete"], ["antiroledelete", "Anti Role Delete", "maxRoleDelete"], ["antiroleupdate", "Anti Role Update", "maxRoleDelete"], ["antimassroleremove", "Anti Mass Role Change", "maxRoleDelete"], ["antipermschange", "Anti Permission Overwrite", "maxChannelDelete"]],
  Webhooks: [["antiwebhookcreate", "Anti Webhook Create"], ["antiwebhookdelete", "Anti Webhook Delete"], ["antiwebhookupdate", "Anti Webhook Update"]],
  "Server Content": ["emoji", "sticker"].flatMap(kind => ["create", "delete", "update"].map(verb => [`anti${kind}${verb}`, `Anti ${kind[0].toUpperCase() + kind.slice(1)} ${verb[0].toUpperCase() + verb.slice(1)}`])),
  "Server Settings": [["antibot", "Anti Bot Add", "maxBotAdds", 1], ["antiguildupdate", "Anti Guild Update", "maxChannelDelete"], ["antiautomodcreate", "Anti AutoMod Create", null, 1], ["antiautomoddelete", "Anti AutoMod Delete", null, 1], ["antiautomod", "Anti AutoMod Update", "maxRoleDelete"]],
};

const antinuke = Object.entries(antiNukeGroups).flatMap(([group, entries]) => entries.map(([id, label, legacyLimit, fallback = 3]) => ({
  id,
  key: id,
  group,
  label,
  enabledPath: `antinuke.events.${id}`,
  fields: [
    number(`antinuke.features.${id}.limit`, "Actions before response", 1, 1000, fallback),
    choice(`antinuke.features.${id}.punishment`, "Action", ["ban", "kick", "strip"], "ban"),
  ],
  legacyLimit,
})));

const filter = (id, key, label, group, enabledPath, fields = []) => ({ id, key, label, group, enabledPath, fields });
const action = (key, legacyPaths = []) => choice(`automod.punishments.${key}`, "Punishment", punishments, "block", legacyPaths);
const automod = [
  filter("antispam", "antiSpam", "Anti-Spam", "Message Limits", "automod.antiSpam.enabled", [
    number("automod.antiSpam.maxMessages", "Messages", 2, 20, 5),
    number("automod.antiSpam.interval", "Window (ms)", 1000, 60000, 5000, 1000),
    number("automod.antiSpam.duration", "Timeout (ms)", 60000, 2419200000, 300000, 60000),
    action("spam", ["automod.antiSpam.action"]),
  ]),
  filter("duplicate", "duplicate", "Duplicate Detection", "Message Limits", "automod.advanced.duplicate.enabled", [
    number("automod.advanced.duplicate.requiredCount", "Messages", 2, 20, 3),
    number("automod.advanced.duplicate.windowMs", "Window (ms)", 1000, 60000, 30000, 1000),
    number("automod.advanced.duplicate.timeoutMs", "Timeout (ms)", 60000, 2419200000, 600000, 60000),
    action("duplicate", ["automod.advanced.duplicate.action"]),
  ]),
  filter("antimention", "antiMassMention", "Anti-Mention", "Native Filters", "automod.antiMassMention.enabled", [
    number("automod.antiMassMention.maxMentions", "Mentions", 1, 50, 5), action("mentions", ["automod.antiMassMention.action"]),
  ]),
  filter("anticaps", "antiCaps", "Anti-Caps", "Native Filters", "automod.antiCaps.enabled", [
    number("automod.antiCaps.percentage", "Caps (%)", 1, 100, 70),
    number("automod.antiCaps.minLength", "Minimum length", 1, 2000, 10),
    action("caps", ["automod.antiCaps.action"]),
  ]),
  filter("antiinvite", "antiInvite", "Anti-Invite", "Native Filters", "automod.antiInvite.enabled", [action("invite", ["automod.antiInvite.action"])]),
  filter("antilink", "antiLink", "Anti-Link", "Native Filters", "automod.antiLink.enabled", [action("antilink", ["antilink.action"])]),
  filter("zalgo", "antiZalgo", "Anti-Zalgo", "Native Filters", "security.antiZalgo", [action("zalgo")]),
  filter("everyone", "antiEveryoneBP", "Anti Everyone / Here", "Native Filters", "security.antiEveryoneBP", [action("everyone")]),
  filter("badwords", "badWords", "Bad Words", "Content Filters", "badWordEnabled", [
    action("badwords", ["badWordConfig.action"]),
    { path: "badWords", label: "Blocked words", type: "list", default: [] },
  ]),
  filter("nsfw", "nsfw", "NSFW Filter", "Content Filters", "nsfwProtection", [
    action("nsfw", ["nsfwConfig.action"]), number("nsfwConfig.timeoutMs", "Timeout (ms)", 60000, 2419200000, 300000, 60000),
  ]),
  filter("advscams", "scams", "Scam / Image Scan", "Content Filters", "automod.advanced.scams.enabled", [action("scams")]),
  filter("antibot", "antiBot", "Anti-Bot Join Protection", "Join Protection", "antibot.enabled", [choice("antibot.action", "Action", ["kick", "ban"], "kick")]),
  filter("accountage", "accountAge", "Account Age", "Join Protection", "accountAge.enabled", [
    number("accountAge.minDays", "Minimum days", 1, 3650, 7), choice("accountAge.action", "Action", ["kick", "ban"], "kick"),
  ]),
];

const fields = new Map();
for (const item of [...antinuke, ...automod]) {
  fields.set(item.enabledPath, { type: "boolean" });
  for (const field of item.fields) fields.set(field.path, field);
}
for (const root of ["antinuke", "automod", "wallSystem"]) {
  fields.set(`${root}.systemEnabled`, { type: "boolean" });
  fields.set(`${root}.enabled`, { type: "boolean" });
}
fields.set("antinuke.timeWindow", number("antinuke.timeWindow", "Window (ms)", 1000, 60000, 10000, 1000));
fields.set("antinuke.punishment", choice("antinuke.punishment", "Action", ["ban", "kick", "strip"], "ban"));

const get = (data, path) => path.split(".").reduce((value, key) => value?.[key], data);
function set(data, path, value) {
  const parts = path.split(".");
  let cursor = data;
  for (const key of parts.slice(0, -1)) cursor = cursor[key] ||= {};
  cursor[parts.at(-1)] = value;
}

function validate(path, value) {
  const field = fields.get(path);
  if (!field) return value;
  const valid = field.type === "boolean" ? typeof value === "boolean"
    : field.type === "number" ? typeof value === "number" && Number.isInteger(value) && value >= field.min && value <= field.max
      : field.type === "select" ? field.options.includes(value)
        : Array.isArray(value) && value.length <= 100 && value.every(word => typeof word === "string" && word.trim().length > 0 && word.length <= 60);
  if (!valid) throw Object.assign(new Error(`Invalid value for ${path}.`), { status: 400 });
  return value;
}

function applyAliases(g, applied) {
  for (const item of antinuke) {
    const featurePath = `antinuke.features.${item.id}`;
    if (Object.hasOwn(applied, item.enabledPath)) set(g, `${featurePath}.enabled`, applied[item.enabledPath]);
    for (const field of item.fields) {
      if (!Object.hasOwn(applied, field.path)) continue;
      if (field.path.endsWith(".limit")) set(g, `${featurePath}.limit`, applied[field.path]);
      if (field.path.endsWith(".punishment")) set(g, `${featurePath}.punishment`, applied[field.path]);
    }
  }

  for (const item of automod) {
    if (!Object.hasOwn(applied, item.enabledPath)) continue;
    const enabled = applied[item.enabledPath];
    set(g, `automod.features.${item.key}.enabled`, enabled);
    if (item.id === "antiinvite") set(g, "automod.advanced.invite.enabled", enabled);
    if (item.id === "antilink") set(g, "antilink.enabled", enabled);
    if (item.id === "advscams") {
      set(g, "automod.advanced.imageScam.enabled", enabled);
      set(g, "automod.features.imageScam.enabled", enabled);
    }
    if (item.id === "zalgo" || item.id === "everyone") set(g, `security.${item.key}`, enabled);
    if (item.id === "badwords") set(g, "badWordEnabled", enabled);
    if (item.id === "nsfw") set(g, "nsfwProtection", enabled);
    if (item.id === "antibot") set(g, "antibot.enabled", enabled);
    if (item.id === "accountage") {
      const days = g.accountAge?.minDays || 7;
      set(g, "security.savedAccountAgeDays", days);
      set(g, "security.accountAgeDays", enabled ? days : 0);
    }
  }

  for (const item of automod) for (const field of item.fields) {
    if (!Object.hasOwn(applied, field.path)) continue;
    for (const alias of field.legacyPaths || []) set(g, alias, applied[field.path]);
  }
  if (Object.hasOwn(applied, "automod.punishments.scams")) set(g, "automod.punishments.imageScam", applied["automod.punishments.scams"]);
  if (Object.hasOwn(applied, "automod.antiSpam.duration")) set(g, "automod.antiSpam.timeoutMs", applied["automod.antiSpam.duration"]);
  if (Object.hasOwn(applied, "nsfwConfig.timeoutMs")) set(g, "nsfwConfig.timeoutMs", applied["nsfwConfig.timeoutMs"]);

  for (const [path, key] of [["antinuke.systemEnabled", "antinuke"], ["automod.systemEnabled", "automod"], ["wallSystem.systemEnabled", "wallSystem"]]) {
    if (!Object.hasOwn(applied, path)) continue;
    set(g, `${key}.enabled`, applied[path]);
  }
  if (Object.hasOwn(applied, "antinuke.enabled")) set(g, "antinuke.systemEnabled", applied["antinuke.enabled"]);
  if (Object.hasOwn(applied, "automod.enabled")) set(g, "automod.systemEnabled", applied["automod.enabled"]);
  if (Object.hasOwn(applied, "wallSystem.enabled")) set(g, "wallSystem.systemEnabled", applied["wallSystem.enabled"]);
}

function readFieldValue(g, field) {
  const compatible = value => {
    if (value === undefined) return undefined;
    if (field.type !== "select") return value;
    if (field.options.includes(value)) return value;
    const legacy = ({ mute: "timeout", delete: "block" })[String(value).toLowerCase()];
    return field.options.includes(legacy) ? legacy : undefined;
  };
  const value = compatible(get(g, field.path));
  if (value !== undefined) return value;
  for (const alias of field.legacyPaths || []) {
    const legacy = compatible(get(g, alias));
    if (legacy !== undefined) return legacy;
  }
  if (field.type === "select" && field.path.startsWith("antinuke.features.") && field.path.endsWith(".punishment")) {
    const legacy = compatible(g.antinuke?.punishment);
    if (legacy !== undefined) return legacy;
  }
  if (field.type === "select" && field.path.startsWith("automod.punishments.")) {
    const legacy = compatible(g.automod?.punishment);
    if (legacy !== undefined) return legacy;
  }
  if (field.path.endsWith(".limit")) {
    const feature = field.path.split(".")[2];
    const item = antinuke.find(entry => entry.id === feature);
    const legacy = item?.legacyLimit && get(g, `antinuke.${item.legacyLimit}`);
    if (legacy !== undefined) return legacy;
  }
  return field.default;
}

function schema(g) {
  return {
    antinuke: antinuke.map(item => {
      const saved = g.antinuke?.features?.[item.key] || {};
      const legacyEnabled = g.antinuke?.events?.[item.key];
      return {
        ...item,
        enabled: typeof saved.enabled === "boolean" ? saved.enabled : legacyEnabled === true,
        fields: item.fields.map(field => ({ ...field, value: readFieldValue(g, field) })),
      };
    }),
    automod: automod.map(item => {
      const saved = g.automod?.features?.[item.key] || {};
      const legacyEnabled = get(g, item.enabledPath);
      return {
        ...item,
        enabled: typeof saved.enabled === "boolean" ? saved.enabled : legacyEnabled === true,
        fields: item.fields.map(field => ({ ...field, value: readFieldValue(g, field) })),
      };
    }),
  };
}

function dashboardUrl(guildId, section) {
  const base = process.env.SOEZY_DASHBOARD_URL || process.env.WEB_PUBLIC_URL || "https://soezy-dashboard.vercel.app";
  const url = new URL(`/dashboard/guild/${guildId}/${section}`, base);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid dashboard URL");
  return url.href;
}

module.exports = { antinuke, automod, fields, validate, applyAliases, schema, get, set, dashboardUrl };
