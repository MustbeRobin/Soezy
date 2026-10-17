"use strict";

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>()]+|\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?:\/[^\s<>()]*)?/gi;

function normalizeDomain(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/^\*\./, "").replace(/[.,!?;:)\]}]+$/g, "");
  if (!raw) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function isAllowedDomain(host, allowedDomains = []) {
  const normalizedHost = normalizeDomain(host);
  if (!normalizedHost) return false;
  return (Array.isArray(allowedDomains) ? allowedDomains : []).some(value => {
    const domain = normalizeDomain(value);
    return domain && (normalizedHost === domain || normalizedHost.endsWith(`.${domain}`));
  });
}

function extractLinks(content) {
  const matches = String(content || "").match(URL_PATTERN) || [];
  return [...new Set(matches.map(value => value.replace(/[.,!?;:)\]}]+$/g, "")).filter(Boolean))];
}

function check(message, config = {}) {
  const links = extractLinks(message?.content);
  const blocked = links.filter(link => {
    const host = normalizeDomain(link);
    return host && !isAllowedDomain(host, config.allowedDomains);
  });
  if (!blocked.length) return null;
  return {
    type: "antiLink",
    title: "Anti-Link",
    reason: "A link was posted where links are not allowed",
    indicators: blocked.slice(0, 10),
    delete: true,
  };
}

module.exports = { check, extractLinks, isAllowedDomain, normalizeDomain };
