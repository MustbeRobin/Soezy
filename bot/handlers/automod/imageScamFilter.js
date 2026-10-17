const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const IMAGE_KEYWORDS = [
  "mrbeast",
  "giveaway",
  "free",
  "usdt",
  "crypto",
  "withdraw successfully",
  "withdrawal success",
  "claim",
  "binance",
  "wallet",
  "airdrop",
];

function isImageAttachment(attachment) {
  const type = String(attachment.contentType || "").toLowerCase();
  const name = String(attachment.name || attachment.url || "").toLowerCase();
  return type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?)(\?|$)/i.test(name);
}

function collectImageSources(message) {
  const sources = [];

  for (const attachment of message.attachments?.values?.() || []) {
    if (isImageAttachment(attachment)) {
      sources.push({
        url: attachment.url,
        label: attachment.name || attachment.url,
        metadata: [attachment.name, attachment.description, attachment.url].filter(Boolean).join(" "),
      });
    }
  }

  for (const embed of message.embeds || []) {
    for (const item of [embed.image, embed.thumbnail]) {
      if (item?.url) {
        sources.push({
          url: item.url,
          label: item.url,
          metadata: [embed.title, embed.description, item.url].filter(Boolean).join(" "),
        });
      }
    }
  }

  return sources;
}

function keywordIndicators(text, keywords = IMAGE_KEYWORDS) {
  const clean = String(text || "").toLowerCase();
  return keywords.filter(keyword => clean.includes(keyword.toLowerCase()));
}

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

async function downloadImage(url, maxBytes = 8 * 1024 * 1024) {
  if (typeof fetch !== "function") return null;

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 10_000) : null;
  try {
    const response = await fetch(url, {
      signal: controller?.signal,
      headers: { "User-Agent": "Soezy-AutoMod/1.0" },
    });
    if (!response.ok) return null;

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength && contentLength > maxBytes) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) return null;
    return buffer;
  } catch {
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function ocrWithTesseract(url) {
  const buffer = await downloadImage(url);
  if (!buffer) return "";

  const extension = path.extname(new URL(url).pathname).replace(/[^.\w]/g, "") || ".png";
  const file = path.join(os.tmpdir(), `soezy-ocr-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`);
  await fs.writeFile(file, buffer);
  try {
    return await execFileAsync("tesseract", [file, "stdout", "--psm", "6"], { timeout: 15_000, windowsHide: true });
  } catch {
    return "";
  } finally {
    await fs.unlink(file).catch(() => {});
  }
}

async function ocrWithOcrSpace(url) {
  const key = process.env.OCR_SPACE_API_KEY;
  if (!key || typeof fetch !== "function") return "";

  try {
    const body = new URLSearchParams({
      apikey: key,
      url,
      language: "eng",
      isOverlayRequired: "false",
      detectOrientation: "true",
      scale: "true",
    });
    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) return "";
    const data = await response.json();
    return (data.ParsedResults || []).map(item => item.ParsedText).filter(Boolean).join("\n");
  } catch {
    return "";
  }
}

async function extractText(url) {
  const tesseractText = await ocrWithTesseract(url);
  if (tesseractText.trim()) return tesseractText;
  return await ocrWithOcrSpace(url);
}

async function check(message, cfg = {}) {
  const sources = collectImageSources(message);
  if (!sources.length) return null;

  const keywords = cfg.imageScam?.keywords || IMAGE_KEYWORDS;
  const minIndicators = Number(cfg.imageScam?.minIndicators || 2);
  const detected = new Set();
  const scanned = [];

  for (const source of sources.slice(0, cfg.imageScam?.maxImages || 3)) {
    const metadataHits = keywordIndicators(source.metadata, keywords);
    for (const hit of metadataHits) detected.add(hit);

    const ocrText = await extractText(source.url);
    scanned.push({ label: source.label, hadOcrText: Boolean(ocrText.trim()) });
    const ocrHits = keywordIndicators(ocrText, keywords);
    for (const hit of ocrHits) detected.add(hit);

    if (detected.size >= minIndicators) break;
  }

  if (detected.size < minIndicators) return null;

  return {
    type: "image-scam",
    title: "Image Scam Detection",
    reason: "Image scam indicators detected",
    indicators: [...detected].slice(0, 8),
    scanned,
    timeoutMs: 30 * 60 * 1000,
    action: "timeout",
    delete: true,
  };
}

module.exports = {
  IMAGE_KEYWORDS,
  check,
  collectImageSources,
  extractText,
  keywordIndicators,
};
