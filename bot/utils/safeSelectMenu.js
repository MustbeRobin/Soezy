"use strict";
(() => {

function cleanSelectText(value, fallback, max = 100) {
  const text = String(value ?? fallback ?? "").replace(/\s+/g, " ").trim();
  return (text || String(fallback || "Option")).slice(0, max);
}

function normalizeSelectOption(option, index = 0) {
  const raw = option && typeof option === "object" ? option : {};
  const label = cleanSelectText(raw.label, `Option ${index + 1}`, 100);
  const value = cleanSelectText(raw.value, label.toLowerCase().replace(/[^a-z0-9_-]+/g, "_") || `option_${index + 1}`, 100);
  const normalized = { label, value };
  if (raw.description !== undefined && raw.description !== null) normalized.description = cleanSelectText(raw.description, "", 100);
  if (raw.emoji && typeof raw.emoji === "object" && (raw.emoji.id || raw.emoji.name)) normalized.emoji = raw.emoji;
  else if (typeof raw.emoji === "string" && raw.emoji.trim()) normalized.emoji = raw.emoji.trim();
  if (typeof raw.default === "boolean") normalized.default = raw.default;
  return normalized;
}

function safeSelectOptions(options = []) {
  const seen = new Set();
  const out = [];
  for (const option of Array.isArray(options) ? options : []) {
    const normalized = normalizeSelectOption(option, out.length);
    if (!normalized.value || seen.has(normalized.value)) continue;
    seen.add(normalized.value);
    out.push(normalized);
    if (out.length >= 25) break;
  }
  return out.length ? out : [{ label: "No options available", value: "noop", description: "Nothing can be selected right now" }];
}

function createSafeSelectMenu({ customId, placeholder, options = [], minValues = 1, maxValues = 1, disabled = false } = {}) {
  const safeOptions = safeSelectOptions(options);
  const safeMax = Math.min(safeOptions.length, Math.max(1, Number(maxValues) || 1));
  const safeMin = Math.min(safeMax, Math.max(0, Number(minValues) || 0));
  return new StringSelectMenuBuilder()
    .setCustomId(cleanSelectText(customId, "safe_select", 100))
    .setPlaceholder(cleanSelectText(placeholder, "Choose an option...", 150))
    .setMinValues(safeMin)
    .setMaxValues(safeMax)
    .setDisabled(!!disabled || safeOptions[0]?.value === "noop")
    .addOptions(safeOptions);
}

const api = { cleanSelectText, normalizeSelectOption, safeSelectOptions, createSafeSelectMenu };
globalThis.soezySafeSelectMenu = api;
Object.assign(globalThis, api);
module.exports = api;
})();
