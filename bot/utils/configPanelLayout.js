"use strict";

function trimConfigDropdownFooter(component) {
  const raw = typeof component?.toJSON === "function" ? component.toJSON() : component;
  if (raw?.type !== 17 || !Array.isArray(raw.components)) return component;
  const heading = raw.components.flatMap(item => item.type === 9 ? item.components || [] : [item])
    .find(item => item.type === 10 && /^#{1,3}\s/.test(item.content || ""))?.content || "";
  if (!/^#{1,3}[^\n]*\b(config(?:uration)?|settings|control center|dashboard)\b/i.test(heading)) return component;
  const items = raw.components;
  const lastMenu = items.findLastIndex(item => item.type === 1 && item.components?.some(child => [3, 5, 6, 7, 8].includes(child.type)));
  if (lastMenu < 0) return component;
  let end = items.length;
  while (end > lastMenu + 1) {
    const item = items[end - 1];
    const footer = item.type === 10 && /^(?:-#|Requested by|Expires|designed by|Select an option|Use buttons)/i.test((item.content || "").trim()) && !/attention|warning|failed/i.test(item.content);
    if (item.type !== 14 && !footer) break;
    end--;
  }
  return end === items.length ? component : { ...raw, components: items.slice(0, end) };
}

module.exports = { trimConfigDropdownFooter };
