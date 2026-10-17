/* ================= SUBCOMMAND RESOLVER ================= */
(() => {
const ACTION_ALIASES = Object.freeze({
  add: ["add", "set"],
  set: ["set", "add"],
  edit: ["edit", "change", "replace", "update"],
  remove: ["remove", "delete"],
  enable: ["enable", "on"],
  disable: ["disable", "off"],
  list: ["list", "view", "show"],
});

const ACTION_LOOKUP = new Map();
for (const [canonical, aliases] of Object.entries(ACTION_ALIASES)) {
  for (const alias of aliases) {
    if (!ACTION_LOOKUP.has(alias)) ACTION_LOOKUP.set(alias, canonical);
  }
}

function normalizeSubcommand(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseAction(value, fallback = null) {
  const normalized = normalizeSubcommand(value);
  if (!normalized) return fallback;
  return ACTION_LOOKUP.get(normalized) || normalized || fallback;
}

function resolveSubcommand(source, options = {}) {
  const fallback = options.fallback ?? null;
  const allowed = options.allowed ? new Set(options.allowed.map(parseAction)) : null;
  let raw = null;

  if (typeof source === "string") raw = source;
  else if (Array.isArray(source)) raw = source[0];
  else if (source?.options?.getSubcommand) raw = source.options.getSubcommand(false);
  else if (source?.subcommand) raw = source.subcommand;
  else if (source?.action) raw = source.action;

  const action = parseAction(raw, fallback);
  if (allowed && action && !allowed.has(action)) return fallback;
  return action;
}

Object.assign(globalThis, {
  ACTION_ALIASES,
  normalizeSubcommand,
  parseAction,
  resolveSubcommand,
});

module.exports = { ACTION_ALIASES, normalizeSubcommand, parseAction, resolveSubcommand };
})();
