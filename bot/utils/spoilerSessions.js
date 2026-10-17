"use strict";

// Spoilers contain base64 attachments, so an entry-count limit alone is unsafe.
class SpoilerSessionStore extends Map {
  constructor({ maxBytes = 32 * 1024 * 1024, maxEntries = 1000 } = {}) {
    super();
    this.maxBytes = maxBytes;
    this.maxEntries = maxEntries;
  }
  cleanup(now = Date.now()) {
    for (const [key, value] of this) if ((value.expiresAt || 0) <= now) this.delete(key);
  }
  bytes(value) { return 2 * ((value?.attachment?.buffer?.length || 0) + (value?.text?.length || 0)); }
  get usedBytes() { let total = 0; for (const value of this.values()) total += this.bytes(value); return total; }
  set(key, value) {
    this.cleanup();
    if ((!this.has(key) && this.size >= this.maxEntries) || this.usedBytes - this.bytes(this.get(key)) + this.bytes(value) > this.maxBytes) {
      throw new Error("Spoiler storage is busy. Try again after older spoilers expire.");
    }
    return super.set(key, value);
  }
}

let downloads = 0;
async function downloadSpoilerAttachment(attachment) {
  const limit = 5 * 1024 * 1024;
  if (downloads >= 4) throw new Error("Too many attachment downloads. Try again shortly.");
  if (attachment.size > limit) throw new Error("Spoiler attachments must be at most 5 MB.");
  downloads++;
  try {
    const response = await fetch(attachment.url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Attachment download failed (${response.status})`);
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > limit) throw new Error("Spoiler attachments must be at most 5 MB.");
      chunks.push(chunk);
    }
    return { name: attachment.name || "spoiler-attachment", buffer: Buffer.concat(chunks, bytes).toString("base64") };
  } finally { downloads--; }
}
module.exports = { SpoilerSessionStore, downloadSpoilerAttachment };
