/* ================= UTILITY AND MEDIA EMBED BUILDERS ================= */
/* ================= MEDIA DELETE LOG FUNCTIONS ================= */

const soezySharp = require("sharp");
const SOEZY_STICKER_MAX_BYTES = 512 * 1024;

const mediaDeleteLogDedupe = globalThis.__soezyMediaDeleteLogDedupe || (globalThis.__soezyMediaDeleteLogDedupe = new Map());
const mediaDeleteMessageCache = globalThis.__soezyMediaDeleteMessageCache || (globalThis.__soezyMediaDeleteMessageCache = new Map());
const MEDIA_LOG_CACHE_TTL = 2 * 60 * 60 * 1000;

function pruneMediaLogCaches(now = Date.now()) {
  for (const [key, timestamp] of mediaDeleteLogDedupe) {
    if (now - timestamp > 60_000) mediaDeleteLogDedupe.delete(key);
  }
  for (const [key, entry] of mediaDeleteMessageCache) {
    if (now - entry.cachedAt > MEDIA_LOG_CACHE_TTL) mediaDeleteMessageCache.delete(key);
  }
  while (mediaDeleteMessageCache.size > 5000) {
    mediaDeleteMessageCache.delete(mediaDeleteMessageCache.keys().next().value);
  }
}

function messageHasLoggableMedia(msg) {
  if (msg?.attachments?.size > 0) return true;
  if (/(?:https?:\/\/[^\s<>"]+\.(?:jpe?g|png|gif|webp|avif|mp4|webm|mov|m4v)(?:\?[^\s<>"]*)?|https?:\/\/(?:tenor\.com|media\.tenor\.com|c\.tenor\.com|media\d*\.giphy\.com|giphy\.com)[^\s<>"]*)/i.test(msg?.content || "")) return true;
  return Boolean(msg?.embeds?.some?.(embed =>
    [embed.url, embed.image?.url, embed.thumbnail?.url, embed.video?.url].filter(Boolean).length
  ));
}

function cacheMediaMessageForDelete(msg) {
  if (!msg?.id || !msg?.guild || !msg?.author || !messageHasLoggableMedia(msg)) return false;
  pruneMediaLogCaches();
  mediaDeleteMessageCache.set(msg.id, { message: msg, cachedAt: Date.now() });
  return true;
}

function getCachedMediaMessageForDelete(messageId) {
  if (!messageId) return null;
  pruneMediaLogCaches();
  return mediaDeleteMessageCache.get(messageId)?.message || null;
}

async function resolveMediaLogChannel(guild, channelId) {
  if (!guild || !channelId) return null;
  const channel = guild.channels?.cache?.get(channelId) || await guild.channels?.fetch?.(channelId).catch(() => null) || null;
  return channel?.isTextBased?.() && typeof channel.send === "function" ? channel : null;
}

async function logDeletedMedia(msg, reason = "Manual Delete") {
  const guildId = msg?.guildId || msg?.guild?.id;
  if (!guildId || !msg?.guild || !msg?.author) return;
  const gd = guildData(guildId);
  const logChannelId = gd.media?.deleteLogsChannel || gd.mediaDeleteChannel;
  if (!logChannelId) return;

  const logChannel = await resolveMediaLogChannel(msg.guild, logChannelId);
  if (!logChannel) return;

  // ── Helper: resolve media type from URL + contentType ──────────────────────
  const resolveMediaType = (url = "", contentType = "") => {
    const ext = url.split("?")[0].split(".").pop().toLowerCase();
    if (contentType.startsWith("image/gif") || ext === "gif")                    return "gif";
    if (contentType.startsWith("image/") || ["jpg","jpeg","png","webp"].includes(ext)) return "image";
    if (contentType.startsWith("video/") || ["mp4","webm","mov"].includes(ext))  return "video";
    if (/tenor\.com|giphy\.com/.test(url))                                       return "gif";
    return "file";
  };

  // ── Collect all media items: attachments + inline links + embed GIFs ───────
  const mediaItems = [];

  // 1. File attachments
  for (const [, att] of (msg.attachments || [])) {
    mediaItems.push({
      url:      att.url,
      proxyUrl: att.proxyURL,
      fileName: att.name || "unknown",
      type:     resolveMediaType(att.url, att.contentType || ""),
      source:   "attachment",
    });
  }

  // 2. Inline media URLs from message content (images, GIFs, videos, Tenor, Giphy, Discord CDN)
  const MEDIA_URL_RE = /(https?:\/\/[^\s<>"]+\.(?:jpg|jpeg|png|gif|webp|mp4|webm|mov)(?:\?[^\s<>"]*)?|https?:\/\/(?:tenor\.com|media\.tenor\.com|c\.tenor\.com|media\d*\.giphy\.com|giphy\.com)[^\s<>"]*)/gi;
  const seenUrls = new Set(mediaItems.map(i => i.url));
  for (const [, url] of (msg.content?.matchAll(MEDIA_URL_RE) || [])) {
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    mediaItems.push({
      url,
      proxyUrl: url,
      fileName: url.split("/").pop().split("?")[0] || "linked-media",
      type:     resolveMediaType(url, ""),
      source:   "link",
    });
  }

  // 3. Discord-attached embeds (Tenor GIFs, image embeds Discord auto-generates)
  for (const embed of (msg.embeds || [])) {
    const candidates = [embed.url, embed.image?.url, embed.thumbnail?.url, embed.video?.url].filter(Boolean);
    for (const url of candidates) {
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      mediaItems.push({
        url, proxyUrl: url,
        fileName: embed.title || "embed-media",
        type:   /tenor\.com|giphy\.com/.test(url) ? "gif" : resolveMediaType(url, ""),
        source: "embed",
      });
    }
  }

  if (mediaItems.length === 0) return;

  pruneMediaLogCaches();
  const dedupeKey = `${guildId}:${msg.channel?.id || "unknown"}:${msg.id || "unknown"}`;
  const previousLog = mediaDeleteLogDedupe.get(dedupeKey) || 0;
  if (Date.now() - previousLog < 60_000) return;
  mediaDeleteLogDedupe.set(dedupeKey, Date.now());
  mediaDeleteMessageCache.delete(msg.id);

  if (!gd.mediaDeleteLogs) gd.mediaDeleteLogs = {};
  if (!gd.mediaDeleteLogs[guildId]) gd.mediaDeleteLogs[guildId] = [];

  // ── Send one Components V2 log container per media item ───────────────────
  for (const item of mediaItems) {
    const logId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

    // Persist to DB
    gd.mediaDeleteLogs[guildId].push({
      id: logId, guildId, channelId: msg.channel.id,
      userId: msg.author.id, username: msg.author.tag,
      mediaUrl: item.url, proxyUrl: item.proxyUrl,
      mediaType: item.type, fileName: item.fileName,
      messageContent: msg.content, source: item.source,
      reason, timestamp: Date.now(),
    });
    const isVideo = item.type === "video";
    const attachCount = msg.attachments?.size || 0;

    // Render image/GIF inline — skipped for video (Discord can't embed video in image field)
    const files = [];
    const directMedia = item.source === "attachment" || /\.(?:jpe?g|png|gif|webp|avif|mp4|webm|mov|m4v)(?:[?#]|$)/i.test(item.url);
    if (directMedia) {
      try {
        const buffer = typeof downloadFile === "function"
          ? await downloadFile(item.url)
          : Buffer.from(await (await fetch(item.url)).arrayBuffer());
        if (buffer?.length && buffer.length <= 24 * 1024 * 1024) {
          const safeName = String(item.fileName || `deleted-media-${msg.id}`).replace(/[^\w.\-]/g, "_").slice(0, 96) || `deleted-media-${msg.id}`;
          files.push(new AttachmentBuilder(buffer, { name: safeName }));
        }
      } catch (err) {
        console.warn(`[MEDIA] delete re-upload failed guild=${guildId} message=${msg.id}: ${err.message}`);
      }
    }
    const buttons = [];
    if (item.url) buttons.push(new ButtonBuilder().setLabel("View Media").setStyle(ButtonStyle.Link).setURL(item.url));
    if (item.source === "attachment" && item.proxyUrl && item.proxyUrl !== item.url) {
      buttons.push(
        new ButtonBuilder().setLabel("Download").setStyle(ButtonStyle.Link).setURL(item.proxyUrl)
      );
    }
    const row = buttons.length ? new ActionRowBuilder().addComponents(...buttons) : null;

    await sendLoggingContainer(logChannel, "mediaDelete", {
      guild: msg.guild,
      title: "Media Deleted",
      icon: EMOJIS.delete || EMOJIS.soezy_warning,
      actor: msg.author,
      fields: [
        { name: "Channel", value: `${msg.channel} (\`${msg.channel.id}\`)` },
        ...(attachCount > 0 ? [{ name: "Attachments", value: attachCount }] : []),
        { name: "Media", value: item.fileName || item.type || "Unknown" },
        { name: "Source", value: item.source },
        { name: "Reason", value: reason },
      ],
      media: !isVideo && files.length === 0 ? [item.url] : [],
      components: row ? [row] : [],
      files,
    }).catch(error => {
      console.warn(`[MEDIA] delete log send failed guild=${guildId} channel=${logChannelId}: ${error.message}`);
    });
  }
  saveDB();
}

async function logUploadedMedia(msg, reason = "Media Upload") {
  const guildId = msg.guildId || msg.guild?.id;
  if (!guildId || !msg.guild || !msg.attachments?.size) return;

  const gd = guildData(guildId);
  const mediaCfg = gd.media || {};
  const logChannelId = mediaCfg.uploadLogsChannel || mediaCfg.deleteLogsChannel || gd.mediaDeleteChannel;
  const configuredLogChannels = [mediaCfg.uploadLogsChannel, mediaCfg.deleteLogsChannel, gd.mediaDeleteChannel].filter(Boolean);
  if (!logChannelId || configuredLogChannels.includes(msg.channel?.id)) return;

  const logChannel = await resolveMediaLogChannel(msg.guild, logChannelId);
  if (!logChannel) return;

  const mediaAttachments = [...msg.attachments.values()].filter(att => {
    const url = String(att.url || att.proxyURL || "");
    const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
    return /^(?:image|video)\//.test(att.contentType || "") || ["jpg", "jpeg", "png", "gif", "webp", "avif", "mp4", "webm", "mov", "m4v"].includes(ext);
  });
  if (!mediaAttachments.length) return;

  const maxBytes = 24 * 1024 * 1024;
  for (const att of mediaAttachments) {
    const size = Number(att.size || 0);
    if (size > maxBytes) {
      await sendLoggingContainer(logChannel, "mediaUploadSkipped", {
        guild: msg.guild,
        title: "Media Upload Skipped",
        actor: msg.author,
        fields: [
          { name: "Channel", value: `${msg.channel} (\`${msg.channel.id}\`)` },
          { name: "File", value: att.name || "image" },
          { name: "Reason", value: "File is too large to re-upload." },
          { name: "Original", value: msg.url || att.url },
        ],
      }).catch(() => {});
      continue;
    }

    try {
      const sourceUrl = att.url || att.proxyURL;
      const buffer = typeof downloadFile === "function"
        ? await downloadFile(sourceUrl)
        : Buffer.from(await (await fetch(sourceUrl)).arrayBuffer());
      if (!buffer?.length || buffer.length > maxBytes) continue;

      const safeName = String(att.name || `media-${msg.id}.png`).replace(/[^\w.\-]/g, "_").slice(0, 96) || `media-${msg.id}.png`;
      const file = new AttachmentBuilder(buffer, { name: safeName });
      const isImage = String(att.contentType || "").startsWith("image/") || /\.(?:jpe?g|png|gif|webp|avif)(?:[?#]|$)/i.test(sourceUrl);
      await sendLoggingContainer(logChannel, "mediaUpload", {
        guild: msg.guild,
        title: "Media Uploaded",
        actor: msg.author,
        fields: [
          { name: "Channel", value: `${msg.channel} (\`${msg.channel.id}\`)` },
          { name: "Message", value: msg.url || "Unknown" },
          { name: "File", value: `${safeName}${size ? ` (${Math.ceil(size / 1024)} KB)` : ""}` },
          { name: "Reason", value: reason },
        ],
        media: isImage ? [`attachment://${safeName}`] : [],
        files: [file],
      }).catch(() => {});
    } catch (err) {
      console.warn(`[MEDIA] upload log failed guild=${guildId} message=${msg.id}: ${err.message}`);
    }
  }
}

Object.assign(globalThis, {
  cacheMediaMessageForDelete,
  getCachedMediaMessageForDelete,
  messageHasLoggableMedia,
});

/* ================= STICKER STEAL FUNCTIONS ================= */

async function stealStickerEnhanced(guild, sticker, stolenBy) {
  try {
    let stickerUrl = sticker.url;

    if (sticker.format === 3) {
      throw new Error("Lottie stickers cannot be stolen (Discord limitation)");
    }

    const stickerBuffer = await downloadStickerBuffer(stickerUrl);
    const prepared = await prepareStickerMedia(stickerBuffer, sticker.name);

    const newSticker = await guild.stickers.create({
      file: prepared.buffer,
      name: prepared.name,
      tags: sticker.tags || 'emoji',
      description: sticker.description?.slice(0, 100) || `Stolen from another server`,
      reason: `Sticker stolen by ${stolenBy.tag}`
    });

    return {
      success: true,
      sticker: newSticker,
      originalName: sticker.name
    };
  } catch (error) {
    console.error("Sticker steal error:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

function sanitizeStickerName(name = "stolen") {
  const safe = String(name || "stolen")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, 30);
  return safe || "stolen";
}

function getStickerMediaKind(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer.subarray(0, 3).toString("ascii") === "GIF") return "gif";
  if (buffer.subarray(0, 2).toString("ascii") === "BM") return "bmp";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xd8])) || buffer.subarray(0, 3).toString("ascii") === "JFIF") return "jpeg";
  return null;
}

async function downloadStickerBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download the image (HTTP ${response.status}).`);
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > 8 * 1024 * 1024) throw new Error("The source image is too large to process.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 8 * 1024 * 1024) throw new Error("The source image is too large to process.");
  return buffer;
}

async function prepareStickerMedia(buffer, requestedName = "stolen") {
  const kind = getStickerMediaKind(buffer);
  if (!kind || !["png", "gif", "jpeg", "webp"].includes(kind)) {
    throw new Error("Unsupported image format. Use PNG, JPG, JPEG, WEBP, or GIF.");
  }

  const metadata = await soezySharp(buffer, { animated: kind === "gif" }).metadata();
  if (!metadata.width || !metadata.height || metadata.width > 320 || metadata.height > 320) {
    throw new Error("Sticker images must be 320x320 pixels or smaller.");
  }

  let output = buffer;
  let format = kind;
  if (kind === "jpeg" || kind === "webp") {
    output = await soezySharp(buffer).png().toBuffer();
    format = "png";
  }
  if (output.length > SOEZY_STICKER_MAX_BYTES) {
    throw new Error("The image is too large for a Discord sticker (512 KB maximum).");
  }

  return { buffer: output, format, name: sanitizeStickerName(requestedName) };
}

async function stealMediaSticker(guild, mediaUrl, name, stolenBy) {
  const buffer = await downloadStickerBuffer(mediaUrl);
  const prepared = await prepareStickerMedia(buffer, name);
  return guild.stickers.create({
    file: prepared.buffer,
    name: prepared.name,
    tags: "stolen",
    description: "Stolen from a message image",
    reason: `Sticker stolen by ${stolenBy.tag}`
  });
}

async function stealEmojiEnhanced(guild, emoji, newName, stolenBy) {
  try {
    let emojiUrl;
    let animated = false;

    if (typeof emoji === 'object') {
      emojiUrl = emoji.url || `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}`;
      animated = emoji.animated || false;
    } else {
      const emojiMatch = emoji.match(/<(a)?:(\w+):(\d+)>/);
      if (!emojiMatch) {
        throw new Error("Invalid emoji format");
      }
      animated = emojiMatch[1] === 'a';
      const emojiId = emojiMatch[3];
      emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${animated ? 'gif' : 'png'}?size=128&quality=lossless`;
    }

    const emojiBuffer = await downloadFile(emojiUrl);

    const newEmoji = await guild.emojis.create({
      attachment: emojiBuffer,
      name: newName.slice(0, 32).replace(/[^a-zA-Z0-9_]/g, '_'),
      reason: `Emoji stolen by ${stolenBy.tag}`
    });

    return {
      success: true,
      emoji: newEmoji,
      animated: animated
    };
  } catch (error) {
    console.error("Emoji steal error:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function stealEmojiFromUrl(guild, url, name, stolenBy) {
  try {
    const emojiBuffer = await downloadFile(url);
    const animated = url.includes('.gif');

    const newEmoji = await guild.emojis.create({
      attachment: emojiBuffer,
      name: name.slice(0, 32).replace(/[^a-zA-Z0-9_]/g, '_'),
      reason: `Emoji added by ${stolenBy.tag}`
    });

    return {
      success: true,
      emoji: newEmoji,
      animated: animated
    };
  } catch (error) {
    console.error("Emoji from URL error:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

function parseEmojisFromContent(content) {
  const emojiRegex = /<(a)?:(\w+):(\d+)>/g;
  const emojis = [];
  let match;

  while ((match = emojiRegex.exec(content)) !== null) {
    emojis.push({
      animated: match[1] === 'a',
      name: match[2],
      id: match[3],
      url: `https://cdn.discordapp.com/emojis/${match[3]}.${match[1] === 'a' ? 'gif' : 'png'}?size=128&quality=lossless`,
      full: match[0]
    });
  }

  return emojis;
}

function isValidImageUrl(url) {
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
  const urlLower = url.toLowerCase();
  return imageExtensions.some(ext => urlLower.includes(ext));
}

/*  Emoji navigator container builder  */
function buildEmojiNavContainer(emojis, index, userId, channelId, msgId) {
  const emoji = emojis[index];
  const total = emojis.length;
  const base = `steal_nav_${userId}_${channelId}_${msgId}`;
  const pickBase = `steal_pick_${userId}_${channelId}_${msgId}`;

  const navFirst = new ButtonBuilder().setCustomId(`${base}_0_f`).setEmoji(getStatusEmojiObject("Action", "backword")).setStyle(ButtonStyle.Secondary).setDisabled(index === 0);
  const navPrev = new ButtonBuilder().setCustomId(`${base}_${index - 1}_p`).setEmoji(getStatusEmojiObject("Action", "back")).setStyle(ButtonStyle.Secondary).setDisabled(index === 0);
  const navPage = new ButtonBuilder().setCustomId(`steal_nav_page_noop`).setLabel(`${index + 1} / ${total}`).setStyle(ButtonStyle.Secondary).setDisabled(true);
  const navNext = new ButtonBuilder().setCustomId(`${base}_${index + 1}_n`).setEmoji(getStatusEmojiObject("Action", "next")).setStyle(ButtonStyle.Secondary).setDisabled(index === total - 1);
  const navLast = new ButtonBuilder().setCustomId(`${base}_${total - 1}_l`).setEmoji(getStatusEmojiObject("Action", "forward")).setStyle(ButtonStyle.Secondary).setDisabled(index === total - 1);

  const stealEmoji = new ButtonBuilder().setCustomId(`${pickBase}_emoji_${index}`).setLabel('Steal as Emoji').setStyle(ButtonStyle.Primary);
  const stealSticker = new ButtonBuilder().setCustomId(`${pickBase}_sticker_${index}`).setLabel('Steal as Sticker').setStyle(ButtonStyle.Secondary);

  return new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(
      `### ${emoji.animated ? EMOJIS.sparkle : EMOJIS.image} Emoji ${index + 1} of ${total}`
    ))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addSectionComponents(section => section
      .addTextDisplayComponents(t => t.setContent(
        `${EMOJIS.arrow} **${emoji.name}**\n` +
        `${EMOJIS.arrow} ${emoji.animated ? `Animated` : `Static`}\n` +
        `-# ${EMOJIS.arrow} Navigate or pick a format to steal`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(emoji.url))
    )
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(r => r.addComponents(navFirst, navPrev, navPage, navNext, navLast))
    .addActionRowComponents(r => r.addComponents(stealEmoji, stealSticker));
}
