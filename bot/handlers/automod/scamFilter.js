const { findInvites } = require("./inviteFilter");
const { similarity } = require("./duplicateFilter");

const DEFAULT_SCAM_PHRASES = [
  "free nitro",
  "claim now",
  "giveaway",
  "crypto giveaway",
  "withdraw successfully",
  "usdt giveaway",
  "click here to claim",
  "earn money fast",
  "join my server",
  "join or gay",
];

const SHORTENER_DOMAINS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "cutt.ly",
  "rebrand.ly",
  "shorturl.at",
  "s.id",
  "rb.gy",
  "grabify.link",
  "iplogger.org",
  "lnkd.in",
  "v.gd",
]);

const domainAgeCache = new Map();
const URL_REGEX = /\bhttps?:\/\/[^\s<>()]+/gi;

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textFromMessage(message) {
  const embedText = (message.embeds || [])
    .flatMap(embed => [
      embed.title,
      embed.description,
      embed.url,
      embed.footer?.text,
      embed.author?.name,
      ...(embed.fields || []).flatMap(field => [field.name, field.value]),
    ])
    .filter(Boolean)
    .join("\n");

  return [message.content, embedText].filter(Boolean).join("\n");
}

function phraseMatches(text, phrases = DEFAULT_SCAM_PHRASES, threshold = 0.82) {
  const cleanText = normalize(text);
  if (!cleanText) return [];

  const words = cleanText.split(" ").filter(Boolean);
  const found = [];

  for (const phrase of phrases) {
    const cleanPhrase = normalize(phrase);
    if (!cleanPhrase) continue;
    if (cleanText.includes(cleanPhrase)) {
      found.push({ phrase, score: 1 });
      continue;
    }

    const phraseWords = cleanPhrase.split(" ").filter(Boolean);
    const span = Math.max(1, phraseWords.length);
    for (let i = 0; i <= words.length - span; i += 1) {
      const candidate = words.slice(i, i + span).join(" ");
      const score = similarity(candidate, cleanPhrase);
      if (score >= threshold) {
        found.push({ phrase, score: Number(score.toFixed(2)) });
        break;
      }
    }
  }

  return found;
}

function extractUrls(text) {
  const urls = [];
  String(text || "").replace(URL_REGEX, match => {
    urls.push(match.replace(/[.,;!?]+$/, ""));
    return match;
  });
  return urls;
}

function hostnameFromUrl(raw) {
  try {
    const url = new URL(raw);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function isShortener(domain) {
  return SHORTENER_DOMAINS.has(String(domain || "").toLowerCase());
}

async function getDomainAgeDays(domain, timeoutMs = 2500) {
  if (!domain || typeof fetch !== "function") return null;
  const cached = domainAgeCache.get(domain);
  if (cached && Date.now() - cached.checkedAt < 6 * 60 * 60 * 1000) return cached.days;

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      signal: controller?.signal,
      headers: { "User-Agent": "Soezy-AutoMod/1.0" },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const registration = (data.events || []).find(event =>
      ["registration", "registered", "domain registration"].includes(String(event.eventAction || "").toLowerCase())
    );
    const date = registration?.eventDate ? new Date(registration.eventDate) : null;
    if (!date || Number.isNaN(date.getTime())) return null;
    const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
    domainAgeCache.set(domain, { days, checkedAt: Date.now() });
    return days;
  } catch {
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function emojiCount(text) {
  const unicodeEmoji = String(text || "").match(/\p{Extended_Pictographic}/gu) || [];
  const customEmoji = String(text || "").match(/<a?:\w+:\d+>/g) || [];
  return unicodeEmoji.length + customEmoji.length;
}

async function check(message, cfg = {}) {
  const text = textFromMessage(message);
  const phrases = cfg.scams?.phrases || DEFAULT_SCAM_PHRASES;
  const fuzzyThreshold = cfg.scams?.fuzzyThreshold || 0.82;
  const phraseHits = phraseMatches(text, phrases, fuzzyThreshold);

  if (phraseHits.length) {
    return {
      type: "scam",
      title: "Scam Phrase Detection",
      reason: "Scam phrase detected",
      indicators: phraseHits.slice(0, 5).map(hit => `${hit.phrase}${hit.score < 1 ? ` (${hit.score})` : ""}`),
      delete: true,
    };
  }

  const suspicious = [];
  const urls = extractUrls(text);
  const inviteHits = findInvites(text);
  if (inviteHits.length) suspicious.push("Discord invite link");

  for (const url of urls) {
    const domain = hostnameFromUrl(url);
    if (!domain) continue;
    if (isShortener(domain)) suspicious.push(`URL shortener: ${domain}`);

    const minAgeDays = Number(cfg.suspiciousLinks?.minDomainAgeDays ?? cfg.minDomainAgeDays ?? 14);
    if (minAgeDays > 0) {
      const ageDays = await getDomainAgeDays(domain, cfg.suspiciousLinks?.domainLookupTimeoutMs || 2500);
      if (typeof ageDays === "number" && ageDays >= 0 && ageDays < minAgeDays) {
        suspicious.push(`Young domain: ${domain} (${ageDays}d old)`);
      }
    }
  }

  const mentionCount = (message.mentions?.users?.size || 0) + (message.mentions?.roles?.size || 0) + (message.mentions?.everyone ? 1 : 0);
  const maxMentions = Number(cfg.suspiciousLinks?.maxMentions || 8);
  if (mentionCount >= maxMentions) suspicious.push(`Excessive mentions: ${mentionCount}`);

  const emojis = emojiCount(text);
  const maxEmojis = Number(cfg.suspiciousLinks?.maxEmojis || 18);
  if (emojis >= maxEmojis) suspicious.push(`Excessive emojis: ${emojis}`);

  if (!suspicious.length) return null;

  return {
    type: "suspicious-link",
    title: "Suspicious Link Detection",
    reason: "Suspicious content indicators detected",
    indicators: [...new Set(suspicious)].slice(0, 6),
    delete: true,
  };
}

module.exports = {
  DEFAULT_SCAM_PHRASES,
  SHORTENER_DOMAINS,
  check,
  extractUrls,
  getDomainAgeDays,
  phraseMatches,
};
