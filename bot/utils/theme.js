"use strict";

const DEFAULT_COLOR = 0x808080;
const LEGACY_DEFAULT_COLOR = 0x5865F2;
const SUCCESS_COLOR = 0x57F287;
const ERROR_COLOR = 0xED4245;
const WARNING_COLOR = 0xFEE75C;

const themeState = globalThis.__soezyTheme || (globalThis.__soezyTheme = {
  defaultColor: DEFAULT_COLOR,
  successColor: SUCCESS_COLOR,
  errorColor: ERROR_COLOR,
  warningColor: WARNING_COLOR,
});

function parseColor(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 0xFFFFFF) return value;
  if (typeof value === "string" && /^#?[0-9a-f]{6}$/i.test(value.trim())) {
    return parseInt(value.trim().replace(/^#/, ""), 16);
  }
  return null;
}

function getGuildThemeValue(guildId) {
  if (!guildId) return null;
  try {
    const gd = typeof globalThis.guildData === "function"
      ? globalThis.guildData(guildId)
      : globalThis.db?.guilds?.[guildId];
    return gd?.theme?.color ?? gd?.themeColor ?? globalThis.db?.guildSettings?.[guildId]?.themeColor ?? null;
  } catch {
    return null;
  }
}

function getThemeColor(guildId = null, fallback = DEFAULT_COLOR) {
  const guildThemeColor = parseColor(getGuildThemeValue(guildId));
  // Older installs may have persisted the former default as a guild theme.
  const normalizedGuildColor = guildThemeColor === LEGACY_DEFAULT_COLOR ? DEFAULT_COLOR : guildThemeColor;
  return normalizedGuildColor ?? parseColor(fallback) ?? themeState.defaultColor;
}

function getSuccessColor() {
  return themeState.successColor;
}

function getErrorColor() {
  return themeState.errorColor;
}

function getWarningColor() {
  return themeState.warningColor;
}

function resolveThemeColor(color, guildId = null) {
  return parseColor(color) ?? getThemeColor(guildId);
}

function themeColor(guildId = null) {
  return getThemeColor(guildId);
}

function applyTheme(target, guildId = null, fallback = DEFAULT_COLOR) {
  const color = getThemeColor(guildId, fallback);
  if (target?.setColor) target.setColor(color);
  return target;
}

/**
 * Apply the guild theme color to an EmbedBuilder.
 * @param {EmbedBuilder} embed
 * @param {string|null} guildId
 * @returns {EmbedBuilder}
 */
function setEmbedTheme(embed, guildId = null) {
  return embed?.setColor?.(getThemeColor(guildId)) ?? embed;
}

/**
 * Create a pre-themed embed using a builder function.
 * Usage: buildThemedEmbed(guildId, e => e.setTitle("Hi").setDescription("Hello"))
 * @param {string|null} guildId
 * @param {function} builderFn  - receives a plain object with setTitle/setDescription etc.
 * @returns {{ color: number, [key: string]: any }}
 */
function buildThemedEmbed(guildId, builderFn) {
  const color = getThemeColor(guildId);
  const data = { color };
  const proxy = {
    setTitle: v => { data.title = v; return proxy; },
    setDescription: v => { data.description = v; return proxy; },
    setFooter: v => { data.footer = v; return proxy; },
    setImage: v => { data.image = { url: v }; return proxy; },
    setThumbnail: v => { data.thumbnail = { url: v }; return proxy; },
    setURL: v => { data.url = v; return proxy; },
    setColor: v => { data.color = parseColor(v) ?? color; return proxy; },
    addFields: (...fields) => { data.fields = [...(data.fields || []), ...fields.flat()]; return proxy; },
    toJSON: () => data,
  };
  if (typeof builderFn === "function") builderFn(proxy);
  return data;
}

Object.assign(globalThis, {
  DEFAULT_COLOR,
  getThemeColor,
  getSuccessColor,
  getErrorColor,
  getWarningColor,
  resolveThemeColor,
  themeColor,
  applyTheme,
  setEmbedTheme,
  buildThemedEmbed,
});

module.exports = {
  DEFAULT_COLOR,
  getThemeColor,
  getSuccessColor,
  getErrorColor,
  getWarningColor,
  resolveThemeColor,
  themeColor,
  applyTheme,
  setEmbedTheme,
  buildThemedEmbed,
};
