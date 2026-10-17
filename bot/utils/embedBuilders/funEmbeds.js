/* ================= FUN EMBED BUILDERS ================= */
const SOEZY_FUN_COOLDOWNS = new Map();
const SOEZY_ROASTS = [
  "you look like you say ‘do you know who I am’ in arguments.",
  "you got the confidence of a billionaire and the logic of a potato.",
  "you are the reason shampoo has instructions.",
  "you look easy to draw.",
  "you have two brain cells and both are fighting for third place.",
  "your personality is just loud wrong answers.",
  "you look like you smell your own fingers after eating chips.",
  "you talk like a podcast nobody asked for.",
  "you are built like an unfinished side quest.",
  "you look like your favorite hobby is ruining group projects.",
  "you have the survival instincts of a goldfish.",
  "you probably lose arguments with mirrors.",
  "you look like you call teachers ‘bro’.",
  "you got rejected by autocorrect.",
  "your barber deserves jail time.",
  "you look like you type with one finger and full confidence.",
  "you have the energy of a wet sock.",
  "you probably moan when stretching.",
  "you look like you ask for extra ketchup then forget to eat.",
  "your face looks AI generated with bad prompts.",
  "you sound like you sniff while talking.",
  "you look like you blame lag in singleplayer games.",
  "your opinions feel sponsored by bad decisions.",
  "you look like you breathe loudly in quiet rooms.",
  "you are proof that being loud is not the same as being funny.",
  "you look like you still say ‘ez’ after losing.",
  "you probably think deodorant is optional.",
  "you got the emotional depth of a plastic spoon.",
  "you look like your phone screen is greasy right now.",
  "you probably start drama then ask ‘why everyone mad’.",
  "you look like you bark during arguments.",
  "your selfies probably scare facial recognition.",
  "you look like you eat cereal with a fork.",
  "you bring absolutely nothing to the table except noise.",
  "you look like your search history needs legal supervision.",
  "you probably think pineapple on pizza is a personality.",
  "your existence feels like a typo.",
  "you look like you leave people on read then reply instantly to drama.",
  "you got the fashion sense of a lost tourist.",
  "you probably clap when your microwave finishes.",
  "you look like your laugh starts with a snort.",
  "you are built like expired yogurt.",
  "you probably say ‘hear me out’ before every bad idea.",
  "you look like you ask strangers for charger cables.",
  "your aura screams low battery.",
  "you probably whisper ‘crazy work’ after causing the problem.",
  "you look like you drink straight from the carton.",
  "you got the vibe of someone who chews with their mouth open.",
  "you probably screenshot NFTs unironically.",
  "you look like you think flirting is just being annoying."
];

const SOEZY_PICKUP_LINES = [
  "you must be trouble because my heart ignores every warning around you.",
  "if looks could kill, you would already have life sentences.",
  "you smile like you know exactly what you are doing to me.",
  "you are the reason eye contact feels dangerous.",
  "i was doing fine until you showed up looking like that.",
  "you lowkey owe me compensation for distracting me this hard.",
  "your voice could probably fix my mood instantly.",
  "i would lose every argument on purpose just to keep talking to you.",
  "you look like the type to ruin my sleep schedule and honestly worth it.",
  "you make flirting feel way too easy.",
  "if being attractive was illegal you would never see daylight again.",
  "you got me smiling at my phone like an idiot.",
  "you seem like the type of person people accidentally fall for.",
  "you make confidence disappear real fast.",
  "your eyes are doing illegal levels of damage.",
  "you look expensive emotionally.",
  "i could probably listen to you talk for hours and still want more.",
  "you make my standards disappear respectfully.",
  "you look like my next bad decision.",
  "your attention feels dangerously addictive.",
  "you are literally my type and it is annoying.",
  "i blame you for every distraction today.",
  "you flirt like you know you are winning.",
  "you got me acting softer than usual.",
  "you look way too good to be real.",
  "your smile deserves its own warning label.",
  "i would fold instantly in front of you.",
  "you make teasing feel romantic somehow.",
  "you are unfairly attractive honestly.",
  "you got me rereading messages like a loser.",
  "i just know your hugs hit different.",
  "you look like you give dangerous amounts of attention.",
  "you make butterflies feel aggressive.",
  "your energy is stupidly attractive.",
  "i would definitely risk embarrassment for you.",
  "you are the type of pretty that causes staring problems.",
  "you could ruin my focus with one text.",
  "i know for a fact you look good in oversized hoodies.",
  "you sound like comfort and chaos mixed together.",
  "you got me kicking my feet mentally.",
  "i would absolutely let you bully me a little.",
  "you make compliments feel insufficient.",
  "your vibe feels like late night attachment issues.",
  "you probably look even better when sleepy.",
  "you are dangerously easy to think about.",
  "you got that ‘text me more’ kind of energy.",
  "i would pause my game for you and that says a lot.",
  "you look like you steal hoodies professionally.",
  "your existence feels flirty somehow.",
  "you are way too easy to get attached to."
];

const SOEZY_JOKES = [
  "Why don't scientists trust atoms? Because they make up everything.",
  "Why did the scarecrow win an award? He was outstanding in his field.",
  "Why don't eggs tell jokes? They would crack each other up.",
  "What do you call fake spaghetti? An impasta.",
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "I told my computer I needed a break, and it opened a KitKat ad.",
  "Why was the math book sad? It had too many problems."
];

function seededRate(userId, salt, min = 0, max = 100) {
  // Rate resets weekly — week number changes every 7 days
  const weekNum = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  const raw = String(userId || "0") + salt + String(weekNum);
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  return min + (Math.abs(hash) % (max - min + 1));
}

function checkFunCooldown(userId, command, ms = 8000) {
  const key = `${userId}:${command}`;
  const now = Date.now();
  const until = SOEZY_FUN_COOLDOWNS.get(key) || 0;
  if (until > now) return Math.ceil((until - now) / 1000);
  SOEZY_FUN_COOLDOWNS.set(key, now + ms);
  return 0;
}

function buildFunResultContainer(title, body, footer, imageUrl = null) {
  const c = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${title}`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(body.slice(0, 1900)));
  if (imageUrl) c.addMediaGalleryComponents(g => g.addItems(i => i.setURL(imageUrl)));
  return c
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t => t.setContent(`-# ${footer}`));
}

function funDisplayName(user) {
  return user?.displayName || user?.globalName || user?.username || user?.user?.displayName || user?.user?.username || "Someone";
}

function funAvatarUrl(user) {
  return user?.displayAvatarURL?.({ dynamic: true, size: 256 }) ||
    user?.user?.displayAvatarURL?.({ dynamic: true, size: 256 }) ||
    "https://cdn.discordapp.com/embed/avatars/0.png";
}

function funAvatarPng(user) {
  return user?.displayAvatarURL?.({ extension: "png", size: 512, forceStatic: true }) ||
    user?.user?.displayAvatarURL?.({ extension: "png", size: 512, forceStatic: true }) ||
    "https://cdn.discordapp.com/embed/avatars/0.png";
}

function withFunEmoji(command, title) {
  return String(title || "Fun").trim();
}

function buildFunEmbed({ title, description = " ", image = null, requester = null, guildId = null }) {
  const embed = new EmbedBuilder()
    .setColor(getThemeColor(guildId));
  const titleText = String(title || "").trim();
  const bodyText = String(description || "").trim();
  const message = bodyText && bodyText !== titleText && bodyText !== "."
    ? `${titleText || "Fun"}\n${bodyText}`
    : `${titleText || "Fun"}`;
  if (requester) {
    embed.setAuthor({
      name: (image ? (titleText || "Fun") : funDisplayName(requester)).replace(/\s+/g, " ").slice(0, 256),
      iconURL: funAvatarUrl(requester),
    });
  }
  if (!image || (bodyText && bodyText !== "." && bodyText !== titleText)) {
    embed.setDescription((image ? bodyText : message).slice(0, 4096) || " ");
  }
  if (image) embed.setImage(image);
  return embed;
}

function isPerfectShipPair(user1, user2) {
  const id1 = String(user1?.id || "");
  const id2 = String(user2?.id || "");
  const perfectPair = new Set();
  return id1 !== id2 && perfectPair.has(id1) && perfectPair.has(id2);
}

function buildShipEmbed({ title, user1, user2, score = 0, requester = null, guildId = null }) {
  const left = funDisplayName(user1);
  const right = funDisplayName(user2);
  const numeric = Math.max(0, Math.min(200, Number(score) || 0));
  return buildFunEmbed({
    title: withFunEmoji("ship", title),
    description: `**${left}** + **${right}**\nCompatibility: **${numeric}%**`,
    requester,
    guildId,
  });
}

function buildCompatibilityBar(score) {
  const numeric = Math.max(0, Math.min(200, Number(score) || 0));
  const filled = Math.max(0, Math.min(10, Math.round((numeric / 200) * 10)));
  return `${"█".repeat(filled)}${"░".repeat(10 - filled)}`;
}

function shipVerdict(score) {
  const numeric = Number(score) || 0;
  if (numeric >= 200) return "Perfect match";
  if (numeric >= 90) return "Soulmate energy";
  if (numeric >= 70) return "Strong match";
  if (numeric >= 45) return "Could work";
  if (numeric >= 20) return "Needs patience";
  return "This is like asking a fish to climb a tree.";
}

function shipHeart() {
  return typeof getEmoji === "function" ? getEmoji("heart") : "💗";
}

async function fetchShipImage(user1, user2) {
  const left = encodeURIComponent(funAvatarPng(user1));
  const right = encodeURIComponent(funAvatarPng(user2));
  try {
    const res = await fetch(`https://nekobot.xyz/api/imagegen?type=ship&user1=${left}&user2=${right}`, {
      headers: { "User-Agent": "SoezyBot/1.0" },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return isValidGif(data?.message) ? data.message : null;
  } catch {
    return null;
  }
}

async function fetchImageBuffer(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "SoezyBot/1.0" },
    signal: AbortSignal.timeout(3500),
  });
  if (!res.ok) throw new Error(`avatar fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function buildShipCardAttachment(user1, user2, score) {
  if (typeof require !== "function" || typeof AttachmentBuilder === "undefined") return null;
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    return null;
  }

  try {
    const numeric = Math.max(0, Math.min(200, Number(score) || 0));
    const [leftRaw, rightRaw] = await Promise.all([
      fetchImageBuffer(funAvatarPng(user1)),
      fetchImageBuffer(funAvatarPng(user2)),
    ]);
    const left = await sharp(leftRaw).resize(260, 190, { fit: "cover", position: "center" }).png().toBuffer();
    const right = await sharp(rightRaw).resize(260, 190, { fit: "cover", position: "center" }).png().toBuffer();
    const centerSvg = Buffer.from(`
      <svg width="80" height="190" viewBox="0 0 80 190" xmlns="http://www.w3.org/2000/svg">
        <rect width="80" height="190" fill="#e63878"/>
        <path d="M40 67 C29 51 8 57 8 78 C8 103 40 120 40 120 C40 120 72 103 72 78 C72 57 51 51 40 67Z" fill="#111217" opacity="0.55"/>
        <text x="40" y="101" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" fill="#ffffff">${numeric}%</text>
      </svg>
    `);
    const mask = Buffer.from(`
      <svg width="600" height="190" viewBox="0 0 600 190" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="600" height="190" rx="6" ry="6" fill="#fff"/>
      </svg>
    `);
    const card = await sharp({
      create: {
        width: 600,
        height: 190,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        { input: left, left: 0, top: 0 },
        { input: centerSvg, left: 260, top: 0 },
        { input: right, left: 340, top: 0 },
        { input: mask, blend: "dest-in" },
      ])
      .png()
      .toBuffer();
    return new AttachmentBuilder(card, { name: "ship-card.png" });
  } catch {
    return null;
  }
}

// A local avatar card for `patpat`: no third-party image API is needed, so the
// command remains reliable even when GIF/image services are unavailable.
async function buildPatPatPayload({ user, target, guildId = null }) {
  const targetName = funDisplayName(target).replace(/[&<>]/g, "").slice(0, 42) || "Friend";
  const fallback = () => ({
    embeds: [new EmbedBuilder()
      .setColor(getThemeColor(guildId))
      .setTitle(`${funDisplayName(user)} gives ${targetName} pats!`)
      .setDescription("pat pat pat ✨")
      .setThumbnail(funAvatarUrl(target))]
  });
  if (typeof require !== "function" || typeof AttachmentBuilder === "undefined") return fallback();
  let sharp;
  try { sharp = require("sharp"); } catch { return fallback(); }
  try {
    const avatarRaw = await fetchImageBuffer(funAvatarPng(target));
    const frameSpecs = [
      { y: 58, h: 170, pawY: 34 },
      { y: 77, h: 145, pawY: 72 },
      { y: 58, h: 170, pawY: 34 },
    ];
    const frames = [];
    for (const spec of frameSpecs) {
      const avatar = await sharp(avatarRaw).resize(170, spec.h, { fit: "cover", position: "center" }).png().toBuffer();
      const mask = Buffer.from(`<svg width="170" height="${spec.h}" xmlns="http://www.w3.org/2000/svg"><rect width="170" height="${spec.h}" rx="24" fill="#fff"/></svg>`);
      const roundedAvatar = await sharp(avatar).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
      const scene = Buffer.from(`<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffb5d1"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs><rect width="256" height="256" fill="url(#bg)"/><text x="128" y="25" text-anchor="middle" font-family="Arial" font-size="19" font-weight="800" fill="#fff">PAT PAT!</text><ellipse cx="128" cy="238" rx="88" ry="11" fill="#51316f" opacity=".26"/><g transform="translate(0 ${spec.pawY})"><ellipse cx="177" cy="19" rx="50" ry="25" fill="#f7c4a2"/><circle cx="145" cy="12" r="12" fill="#f7c4a2"/><circle cx="165" cy="4" r="12" fill="#f7c4a2"/><circle cx="187" cy="3" r="12" fill="#f7c4a2"/><circle cx="208" cy="10" r="11" fill="#f7c4a2"/></g></svg>`);
      const { data } = await sharp(scene).composite([{ input: roundedAvatar, left: 43, top: spec.y }]).raw().toBuffer({ resolveWithObject: true });
      frames.push(data);
    }
    const card = encodeSoezyAnimatedGif(frames, 256, 256, [9, 8, 9]);
    const attachment = new AttachmentBuilder(card, { name: "patpat.gif" });
    return {
      embeds: [new EmbedBuilder()
        .setColor(getThemeColor(guildId))
        .setTitle(`${funDisplayName(user)} gives ${targetName} pats!`)
        .setDescription("pat pat pat ✨")
        .setImage("attachment://patpat.gif")],
      files: [attachment],
    };
  } catch {
    return fallback();
  }
}

// Tiny dependency-free GIF encoder for short avatar effects. It uses a stable
// 3/3/2 RGB palette, which keeps outputs small enough for Discord attachments.
function encodeSoezyAnimatedGif(frames, width, height, delays = []) {
  const bytes = [];
  const put = (...values) => bytes.push(...values.map(value => value & 255));
  const word = value => put(value, value >> 8);
  put(...Buffer.from("GIF89a")); word(width); word(height); put(0xF7, 0, 0);
  for (let i = 0; i < 256; i++) put(((i >> 5) & 7) * 255 / 7, ((i >> 2) & 7) * 255 / 7, (i & 3) * 85);
  // NETSCAPE loop extension: 0 means loop indefinitely.
  put(0x21, 0xFF, 11, ...Buffer.from("NETSCAPE2.0"), 3, 1, 0, 0, 0);
  const encodeFrame = rgba => {
    const pixels = new Uint8Array(width * height);
    for (let i = 0, p = 0; p < pixels.length; p++, i += 4) pixels[p] = (rgba[i] & 0xE0) | ((rgba[i + 1] & 0xE0) >> 3) | ((rgba[i + 2] & 0xC0) >> 6);
    const clear = 256, end = 257; let next = 258, size = 9; const dict = new Map(); const bits = []; let current = pixels[0];
    const write = code => { for (let bit = 0; bit < size; bit++) bits.push((code >> bit) & 1); };
    write(clear);
    for (let i = 1; i < pixels.length; i++) {
      const key = `${current},${pixels[i]}`;
      if (dict.has(key)) current = dict.get(key);
      else {
        write(current); dict.set(key, next++); current = pixels[i];
        if (next === (1 << size) && size < 12) size++;
        if (next >= 4096) { write(clear); dict.clear(); next = 258; size = 9; }
      }
    }
    write(current); write(end);
    const packed = []; for (let i = 0; i < bits.length; i += 8) packed.push(bits.slice(i, i + 8).reduce((value, bit, index) => value | (bit << index), 0));
    return packed;
  };
  frames.forEach((frame, index) => {
    put(0x21, 0xF9, 4, 0);
    word(delays[index] || 8); put(0, 0);
    put(0x2C); word(0); word(0); word(width); word(height); put(0); put(8);
    const data = encodeFrame(frame); for (let i = 0; i < data.length; i += 255) put(Math.min(255, data.length - i), ...data.slice(i, i + 255)); put(0);
  });
  put(0x3B); return Buffer.from(bytes);
}

async function buildImageFunPayload({ operation, sourceUrl, target = null, requester = null, guildId = null }) {
  const labels = {
    deepfry: "Deep Fried",
    invert: "Inverted",
    reshade: "Reshaded",
    giffeffect: "GIF Effect",
    quote: "Quote Card",
  };
  const fallback = reason => ({
    components: [createErrorContainer("Image Processing Failed", reason || "I could not process that image. Try a PNG, JPG, WEBP, or GIF.")],
    flags: MessageFlags.IsComponentsV2,
  });
  if (!sourceUrl) return fallback("Attach an image, provide an image URL, or mention a user.");
  if (typeof require !== "function" || typeof AttachmentBuilder === "undefined") return fallback("The image processor is not available right now.");
  let sharp;
  try { sharp = require("sharp"); } catch { return fallback("The image processor is not installed."); }
  try {
    const raw = await fetchImageBuffer(sourceUrl);
    let output;
    let filename;
    if (operation === "quote") {
      const avatar = await sharp(raw).resize(140, 140, { fit: "cover", position: "center" }).png().toBuffer();
      const name = funDisplayName(target || requester).replace(/[&<>]/g, "").slice(0, 40);
      const card = Buffer.from(`<svg width="720" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="720" height="300" rx="26" fill="#24252a"/><rect x="0" width="14" height="300" fill="#8b5cf6"/><text x="205" y="125" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#fff">“A moment worth sharing.”</text><text x="205" y="174" font-family="Arial, sans-serif" font-size="23" fill="#c7c7d1">— ${name}</text></svg>`);
      const mask = Buffer.from(`<svg width="140" height="140" xmlns="http://www.w3.org/2000/svg"><circle cx="70" cy="70" r="68" fill="#fff"/></svg>`);
      const avatarRound = await sharp(avatar).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
      output = await sharp(card).composite([{ input: avatarRound, left: 42, top: 80 }]).gif({ effort: 4 }).toBuffer();
      filename = "quote-card.gif";
    } else {
      let image = sharp(raw).rotate();
      if (operation === "deepfry") image = image.modulate({ brightness: 1.25, saturation: 2.4 }).sharpen({ sigma: 2 });
      if (operation === "invert") image = image.negate({ alpha: false });
      if (operation === "reshade") image = image.normalise().modulate({ brightness: 1.08, saturation: 1.12 }).sharpen();
      if (operation === "giffeffect") {
        output = await image.modulate({ brightness: 1.08, saturation: 1.45 }).gif({ effort: 4 }).toBuffer();
        filename = "giffeffect.gif";
      } else {
        output = await image.gif({ effort: 4 }).toBuffer();
        filename = `${operation}.gif`;
      }
    }
    const attachment = new AttachmentBuilder(output, { name: filename });
    return {
      embeds: [new EmbedBuilder().setColor(getThemeColor(guildId)).setTitle(labels[operation] || "Image Effect").setImage(`attachment://${filename}`)],
      files: [attachment],
    };
  } catch {
    return fallback();
  }
}

async function buildShipPayload({ title, user1, user2, score = 0, requester = null, guildId = null }) {
  const left = funDisplayName(user1);
  const right = funDisplayName(user2);
  const numeric = Math.max(0, Math.min(200, Number(score) || 0));
  const attachment = await buildShipCardAttachment(user1, user2, numeric);
  if (!attachment) return buildShipContainerPayload({ title, user1, user2, score: numeric, requester, guildId });
  const leftMention = user1?.id ? `<@${user1.id}>` : left;
  const rightMention = user2?.id ? `<@${user2.id}>` : right;
  const embed = new EmbedBuilder()
    .setColor(getThemeColor(guildId))
    .setDescription(`**${shipHeart()} ${leftMention} & ${rightMention} - ${numeric}%**\n\n${shipVerdict(numeric)}`)
    .setImage("attachment://ship-card.png");
  return { embeds: [embed], files: [attachment] };
}

function buildShipContainerPayload({ title, user1, user2, score = 0, requester = null, guildId = null }) {
  const left = funDisplayName(user1);
  const right = funDisplayName(user2);
  const numeric = Math.max(0, Math.min(200, Number(score) || 0));
  const leftMention = user1?.id ? `<@${user1.id}>` : left;
  const rightMention = user2?.id ? `<@${user2.id}>` : right;
  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${shipHeart()} ${leftMention} & ${rightMention} - ${numeric}%`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(`${shipVerdict(numeric)}\n${shipHeart()} ${left} + ${right} ${shipHeart()}`))
    .addMediaGalleryComponents(g => g
      .addItems(i => i.setURL(funAvatarPng(user1)))
      .addItems(i => i.setURL(funAvatarPng(user2)))
    )
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  applyTheme(container, guildId);
  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

function buildRateBar(score, max = 100) {
  const numeric = Math.max(0, Math.min(max, Number(score) || 0));
  const filled = Math.max(0, Math.min(12, Math.round((numeric / max) * 12)));
  return `${"█".repeat(filled)}${"░".repeat(12 - filled)}`;
}

let soezyAxiosClient = null;
function getSoezyAxiosClient() {
  if (soezyAxiosClient !== null) return soezyAxiosClient || null;
  try {
    soezyAxiosClient = require("axios");
  } catch {
    soezyAxiosClient = false;
  }
  return soezyAxiosClient || null;
}

function createSoezyTimeoutSignal(timeoutMs = 3000) {
  if (typeof AbortController === "undefined") return { signal: undefined, cleanup: () => {} };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

async function fetchJsonWithFallback(url, options = {}) {
  const timeoutMs = options.timeoutMs || 3000;
  const headers = {
    "User-Agent": "SoezyBot/1.0",
    Accept: "application/json",
    ...(options.headers || {}),
  };

  if (typeof fetch === "function") {
    const timeout = createSoezyTimeoutSignal(timeoutMs);
    try {
      const res = await fetch(url, { headers, signal: timeout.signal });
      if (!res.ok) return null;
      return await res.json().catch(() => null);
    } catch {
      // Fall through to axios for older or partially polyfilled runtimes.
    } finally {
      timeout.cleanup();
    }
  }

  const axios = getSoezyAxiosClient();
  if (!axios) return null;
  try {
    const res = await axios.get(url, {
      headers,
      timeout: timeoutMs,
      validateStatus: status => status >= 200 && status < 300,
    });
    return res.data || null;
  } catch {
    return null;
  }
}

function extractGifUrls(data) {
  const results = Array.isArray(data?.results) ? data.results : [];
  const candidates = [
    data?.url,
    data?.link,
    data?.gif,
    data?.image,
    data?.results?.[0]?.url,
    data?.results?.[0]?.image,
    data?.results?.[0]?.gif,
    data?.results?.[0]?.media_formats?.gif?.url,
    data?.results?.[0]?.media_formats?.tinygif?.url,
    data?.media_formats?.gif?.url,
    data?.media_formats?.tinygif?.url,
    ...results.flatMap(item => [
      item?.url,
      item?.image,
      item?.gif,
      item?.media_formats?.gif?.url,
      item?.media_formats?.tinygif?.url,
    ]),
  ];
  return [...new Set(candidates.filter(isValidGif))];
}

function extractGifUrl(data) {
  return extractGifUrls(data)[0] || null;
}

async function fetchSoezyMeme() {
  const endpoints = [
    "https://meme-api.com/gimme",
    "https://meme-api.com/gimme/memes"
  ];
  for (const url of endpoints) {
    const data = await fetchJsonWithFallback(url, { timeoutMs: 3000 });
    if (data?.url) return { title: data.title || "Fresh meme", url: data.url, source: data.postLink || data.subreddit || "meme-api.com" };
  }
  return null;
}

/* ── Anime GIF fetcher with multi-API fallback ─────────────────────────────
   Primary  : waifu.pics  (no key, SFW endpoint)
   Fallback : nekos.best  (no key, SFW endpoint)
   Each entry maps an action name → [waifuType, nekosBestType]
   If a type is null the API is skipped for that action.
─────────────────────────────────────────────────────────────────────────── */
const ANIME_GIF_MAP = {
  hug:        ["hug",          "hug"],
  kiss:       ["kiss",         "kiss"],
  peck:       ["kiss",         "kiss"],
  cuddle:     ["cuddle",       "cuddle"],
  pat:        ["pat",          "pat"],
  slap:       ["slap",         "slap"],
  bonk:       ["bonk",         "bonk"],
  punch:      [null,           "punch"],
  bite:       ["bite",         "bite"],
  poke:       ["poke",         "poke"],
  blush:      ["blush",        "blush"],
  horny:      ["blush",        "blush"],
  feed:       ["feed",         "feed"],
  tickle:     ["tickle",       "tickle"],
  wave:       ["wave",         "wave"],
  cry:        ["cry",          "cry"],
  dance:      ["dance",        "dance"],
  smile:      ["smile",        "smile"],
  run:        [null,           "run"],
  pout:       [null,            "pout"],
  confused:   ["confused",     "confused"],
  sleep:      ["sleep",        "sleep"],
  sleepy:     ["sleep",        "sleep"],
  angry:      ["angry",        "angry"],
  stare:      [null,            "stare"],
  wink:       ["wink",         "wink"],
  thumbsup:   [null,           "thumbsup"],
  facepalm:   ["facepalm",     "facepalm"],
  shrug:      [null,           "shrug"],
  highfive:   ["highfive",     "highfive"],
  handhold:   ["handhold",     "handhold"],
  boop:       [null,          "boop"],
  nom:        [null,            "nom"],
  lick:       ["lick",         "lick"],
  blushkiss:  ["flyingkiss",   "flyingkiss"],
  instantkiss:["kiss",         "kiss"],
  instanthug: ["hug",          "hug"],
  instantslap:["slap",         "slap"],
  extremkiss: ["kisses",       "kisses"],
  extremhug:  ["hug",          "hug"],
  extremslap: ["slap",         "slap"],
  // Keep this suggestive action limited to non-explicit anime horny/blush GIFs.
  fuck:       ["blush",        "blush"],
  // Use a supported anime action and a concrete fallback so yeet never
  // produces an embed with a missing image.
  yeet:       ["punch",         "punch"],
  bully:      ["bully",        null],
  torture:    ["kill",         "shoot"],
  laugh:      ["laugh",        "laugh"],
  lmao:       ["laugh",        "laugh"],
  kidnap:     ["hug",            "hug"],
  kill:       ["kill",         "shoot"],
};

const ANIME_GIF_FALLBACKS = {
  hug: "https://media.tenor.com/1T1B8HcWalQAAAAC/anime-hug.gif",
  kiss: "https://media.tenor.com/F02Ep3b2jJgAAAAC/cute-kawai.gif",
  cuddle: null,
  cry: null,
  dance: "https://media.tenor.com/Ws6Dm1ZW_vMAAAAC/anime-dance.gif",
  smile: null,
  poke: null,
  slap: "https://media.tenor.com/rVXByOZKidMAAAAC/anime-slap.gif",
  bonk: "https://media.tenor.com/rVXByOZKidMAAAAC/anime-slap.gif",
  punch: null,
  bite: null,
  blush: null,
  peck: "https://media.tenor.com/F02Ep3b2jJgAAAAC/cute-kawai.gif",
  pat: null,
  wave: null,
  run: null,
  horny: "https://media.tenor.com/LC0KYmGSC4AAAAAC/blush-anime.gif",
  feed: "https://media.tenor.com/ugWk7d7cXfMAAAAC/anime-feed.gif",
  tickle: "https://media.tenor.com/L5t6W8l5pSAAAAAC/anime-tickle.gif",
  pout: "https://media.tenor.com/g3UY1Q0Yk6EAAAAC/anime-pout.gif",
  confused: null,
  sleep: null,
  sleepy: null,
  angry: null,
  stare: null,
  wink: null,
  thumbsup: null,
  facepalm: null,
  shrug: null,
  highfive: "https://media.tenor.com/0PV7ny3EPkEAAAAC/anime-high-five.gif",
  handhold: null,
  boop: "https://media.tenor.com/Kqk-k1I1vHYAAAAC/anime-boop.gif",
  nom: null,
  lick: null,
  blushkiss: "https://media.tenor.com/F02Ep3b2jJgAAAAC/cute-kawai.gif",
  instantkiss: "https://media.tenor.com/F02Ep3b2jJgAAAAC/cute-kawai.gif",
  instanthug: "https://media.tenor.com/1T1B8HcWalQAAAAC/anime-hug.gif",
  instantslap: "https://media.tenor.com/rVXByOZKidMAAAAC/anime-slap.gif",
  extremkiss: "https://media.tenor.com/F02Ep3b2jJgAAAAC/cute-kawai.gif",
  extremhug: "https://media.tenor.com/1T1B8HcWalQAAAAC/anime-hug.gif",
  extremslap: "https://media.tenor.com/rVXByOZKidMAAAAC/anime-slap.gif",
  fuck: "https://media.tenor.com/LC0KYmGSC4AAAAAC/blush-anime.gif",
  yeet: "https://media.tenor.com/rVXByOZKidMAAAAC/anime-slap.gif",
  bully: null,
  torture: null,
  laugh: null,
  lmao: null,
  kidnap: "https://media.tenor.com/1T1B8HcWalQAAAAC/anime-hug.gif",
  kill: null,
};
globalThis.__soezyGifFallbacks = ANIME_GIF_FALLBACKS;
const recentGifCache = globalThis.__soezyRecentGifCache || (globalThis.__soezyRecentGifCache = new Map());
const ANIME_GIF_FALLBACK_POOLS = {
  hug: [
    ANIME_GIF_FALLBACKS.hug,
    "https://media.tenor.com/9e1aE_xBLCsAAAAC/anime-hug.gif",
  ],
  run: [],
  kidnap: [
    ANIME_GIF_FALLBACKS.kidnap,
    "https://media.tenor.com/9e1aE_xBLCsAAAAC/anime-hug.gif",
  ],
  laugh: [
    ANIME_GIF_FALLBACKS.laugh,
  ],
  smile: [],
  bonk: [ANIME_GIF_FALLBACKS.bonk],
  yeet: [
    ANIME_GIF_FALLBACKS.yeet,
    "https://media.tenor.com/0PV7ny3EPkEAAAAC/anime-high-five.gif",
  ],
  bully: [ANIME_GIF_FALLBACKS.bully],
  torture: [
    ANIME_GIF_FALLBACKS.torture,
  ],
  kill: [
    ANIME_GIF_FALLBACKS.kill,
  ],
  fuck: [
    ANIME_GIF_FALLBACKS.fuck,
    ANIME_GIF_FALLBACKS.horny,
  ],
};

function isValidGif(url) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
  const clean = url.split("?")[0].toLowerCase();
  return clean.endsWith(".gif") ||
    clean.endsWith(".png") ||
    clean.endsWith(".jpg") ||
    clean.endsWith(".jpeg") ||
    clean.endsWith(".webp") ||
    clean.endsWith(".webp") ||
    url.includes("media.tenor.com") ||
    url.includes("c.tenor.com") ||
    url.includes("nekobot.xyz") ||
    url.includes("nekos.best") ||
    url.includes("cdn");
}

async function isReachableGif(url) {
  if (!isValidGif(url)) return false;
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": "SoezyBot/1.0" },
      signal: AbortSignal.timeout(2500),
    });
    if (response.ok) return true;
  } catch {
    // Some image hosts reject HEAD requests; verify with a tiny ranged GET.
  }
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "SoezyBot/1.0", Range: "bytes=0-32" },
      signal: AbortSignal.timeout(2500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function chooseReachableGif(action, urls = []) {
  const recent = recentGifCache.get(String(action || "").toLowerCase()) || [];
  const candidates = [...new Set(urls.filter(isValidGif))]
    .sort((a, b) => Number(recent.includes(a)) - Number(recent.includes(b)));
  for (const url of candidates) {
    if (await isReachableGif(url)) {
      chooseFreshGif(action, [url]);
      return url;
    }
  }
  return null;
}

function fallbackAnimeGif(action) {
  const key = String(action || "hug").toLowerCase();
  const aliasKey = key
    .replace(/^extrem/, "")
    .replace(/^instant/, "");
  return ANIME_GIF_FALLBACKS[key] ||
    ANIME_GIF_FALLBACKS[aliasKey] ||
    (key === "sleep" ? ANIME_GIF_FALLBACKS.sleepy : null) ||
    null;
}

function getFallbackGif(action) {
  const key = String(action || "hug").toLowerCase();
  const aliasKey = key.replace(/^extrem/, "").replace(/^instant/, "");
  const pool = [...new Set([
    ...(ANIME_GIF_FALLBACK_POOLS[key] || []),
    ...(ANIME_GIF_FALLBACK_POOLS[aliasKey] || []),
    fallbackAnimeGif(key),
  ].filter(isValidGif))];
  const fresh = chooseFreshGif(key, pool);
  if (fresh) return fresh;
  const recent = recentGifCache.get(key) || [];
  const rerollPool = pool.filter(url => url !== recent[0]);
  const picked = rerollPool[Math.floor(Math.random() * rerollPool.length)] || pool[0] || null;
  if (!picked) return null;
  recentGifCache.set(key, [picked, ...recent.filter(url => url !== picked)].slice(0, 5));
  return picked;
}

function chooseFreshGif(action, urls = []) {
  const key = String(action || "hug").toLowerCase();
  const valid = [...new Set(urls.filter(isValidGif))];
  if (!valid.length) return null;
  const recent = recentGifCache.get(key) || [];
  const fresh = valid.filter(url => !recent.includes(url));
  const pool = fresh.length ? fresh : valid.filter(url => url !== recent[0]);
  const pickedFrom = pool.length ? pool : valid;
  const picked = pickedFrom[Math.floor(Math.random() * pickedFrom.length)];
  recentGifCache.set(key, [picked, ...recent.filter(url => url !== picked)].slice(0, 5));
  return picked;
}

function tenorQueryForAction(action) {
  const key = String(action || "anime reaction").toLowerCase();
  const map = {
    run: "anime running",
    kill: "anime kill",
    bully: "anime bully",
    torture: "anime torture",
    kidnap: "funny anime kidnapping",
    punch: "anime punch",
    slap: "anime slap",
    hug: "anime hug",
    kiss: "anime kiss",
    cuddle: "anime cuddle",
    pat: "anime head pat",
    cry: "anime cry",
    dance: "anime dance",
    laugh: "anime laugh",
    smile: "anime smile",
    bonk: "anime bonk",
    yeet: "anime yeet throw",
    nom: "anime nom eating",
    peck: "anime peck kiss",
    boop: "anime nose boop",
    facepalm: "anime facepalm",
    shrug: "anime shrug",
    confused: "anime confused",
    stare: "anime stare",
    fuck: "anime horny blush",
  };
  return map[key] || `anime ${key}`;
}

async function fetchTenorGif(action) {
  const key = process.env.TENOR_API_KEY || process.env.TENOR_KEY;
  if (!key) return null;
  const params = new URLSearchParams({
    key,
    q: tenorQueryForAction(action),
    limit: "12",
    media_filter: "gif,tinygif",
    contentfilter: "medium",
  });
  const data = await fetchJsonWithFallback(`https://tenor.googleapis.com/v2/search?${params.toString()}`, { timeoutMs: 3000 });
  const urls = (data?.results || [])
    .map(item => item?.media_formats?.gif?.url || item?.media_formats?.tinygif?.url)
    .filter(isValidGif);
  return chooseFreshGif(action, urls);
}

function otakuGifReaction(action) {
  const map = {
    peck: "kiss",
    horny: "blush",
    sleepy: "sleep",
    boop: "boop",
    nom: "nom",
    blushkiss: "kiss",
    instantkiss: "kiss",
    instanthug: "hug",
    instantslap: "slap",
    extremkiss: "kiss",
    extremhug: "hug",
    extremslap: "slap",
    fuck: "horny",
    yeet: "punch",
    bully: "bully",
    torture: "torture",
    lmao: "laugh",
    kidnap: "hug",
  };
  return map[action] || action || "hug";
}

async function fetchAnimeGif(action) {
  const key = action?.toLowerCase() || "hug";
  const [waifuType, nekoType] = ANIME_GIF_MAP[key] || [null, null];
  const candidates = [];
  const tenorGif = await fetchTenorGif(key);
  if (tenorGif) candidates.push(tenorGif);

  // ── 1. waifu.pics ──────────────────────────────────────────────────────
  if (waifuType) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const data = await fetchJsonWithFallback(`https://api.waifu.pics/sfw/${waifuType}`, { timeoutMs: 3000 });
      candidates.push(...extractGifUrls(data));
    }
  }

  // ── 2. nekos.best (fallback) ───────────────────────────────────────────
  if (nekoType) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const data = await fetchJsonWithFallback(`https://nekos.best/api/v2/${nekoType}`, { timeoutMs: 3000 });
      candidates.push(...extractGifUrls(data));
    }
  }

  const otakuType = otakuGifReaction(key);
  for (let attempt = 0; attempt < 2; attempt++) {
    const otakuData = await fetchJsonWithFallback(`https://api.otakugifs.xyz/gif?reaction=${encodeURIComponent(otakuType)}`, { timeoutMs: 3000 });
    candidates.push(...extractGifUrls(otakuData));
  }

  const reachable = await chooseReachableGif(key, candidates);
  if (reachable) return reachable;
  const fallback = getFallbackGif(key);
  return (await isReachableGif(fallback)) ? fallback : null;
}

async function runSoezyFunCommand(command, context) {
  const rateAliases = {
    howgay: "gayrate",
    howlesbian: "lesbianrate",
    howugly: "uglyrate",
    hownigga: "niggarate",
    howsimp: "simprate",
    howcute: "cuterate",
    howhorny: "hornyrate",
    howpretty: "prettyrate",
    howbaby: "babyrate",
    howcrazy: "crazyrate",
    howsus: "susrate",
  };
  command = rateAliases[String(command || "").toLowerCase()] || command;
  const user = context.user;
  const target = context.target || user;
  const target2 = context.target2 || null;
  const guildId = context.guildId || context.guild?.id || null;
  const display = funDisplayName(user);
  const cooldown = checkFunCooldown(user.id, command);
  if (cooldown > 0) {
    return { embeds: [buildFunEmbed({ title: "Slow Down", description: `Try again in \`${cooldown}s\`.`, requester: user, guildId })] };
  }
  if (command === "roast") {
    const roast = SOEZY_ROASTS[Math.floor(Math.random() * SOEZY_ROASTS.length)];
    return { embeds: [buildFunEmbed({ title: withFunEmoji(command, `${display}'s Roast`), description: `${target} ${roast}`, requester: user, guildId })] };
  }
  if (command === "pickupline") {
    const line = SOEZY_PICKUP_LINES[Math.floor(Math.random() * SOEZY_PICKUP_LINES.length)];
    return { embeds: [buildFunEmbed({ title: withFunEmoji(command, `${display}'s Pickup Line`), description: line, requester: user, guildId })] };
  }
  if (command === "joke") {
    const joke = SOEZY_JOKES[Math.floor(Math.random() * SOEZY_JOKES.length)];
    return { embeds: [buildFunEmbed({ title: withFunEmoji(command, `${display}'s Joke`), description: joke, requester: user, guildId })] };
  }
  if (command === "meme") {
    const meme = await fetchSoezyMeme();
    if (!meme) return { embeds: [buildFunEmbed({ title: "Meme API Down", description: "Could not fetch a meme right now. Try again shortly.", requester: user, guildId })] };
    return { embeds: [buildFunEmbed({ title: withFunEmoji(command, `${display}'s Meme`), description: `[${meme.title}](${meme.source})`, image: meme.url, requester: user, guildId })] };
  }
  if (command === "run") {
    let gif = await fetchAnimeGif("run");
    if (!gif || !isValidGif(gif)) gif = getFallbackGif("run");
    if (!gif) {
      return { embeds: [buildFunEmbed({ title: "GIF Unavailable", description: "The running GIF service is unavailable right now. Please try again shortly.", requester: user, guildId })] };
    }
    const titles = [
      `${display} is running away`,
      `${display} sprinted off`,
      `${display} has left the chat`,
      `Nobody can catch ${display} right now`,
      `Look at ${display} go`
    ];
    const title = withFunEmoji(command, titles[Math.floor(Math.random() * titles.length)]);
    return { embeds: [buildFunEmbed({ title, description: " ", image: gif, requester: user, guildId })] };
  }
  const gifActions = new Set([
    "hug", "kiss", "peck", "cuddle", "pat", "slap", "punch", "bite", "poke", "smile",
    "blush", "horny", "feed", "tickle", "wave", "cry", "dance", "pout", "confused",
    "sleep", "sleepy", "angry", "stare", "wink", "thumbsup", "facepalm", "shrug",
    "highfive", "bonk", "handhold", "boop", "nom", "lick", "blushkiss",
    "instantkiss", "instanthug", "instantslap", "extremkiss", "extremhug", "extremslap", "fuck", "yeet", "bully", "torture", "laugh", "lmao",
    "kidnap", "kill",
  ]);
  if (gifActions.has(command)) {
    const base = command.replace(/^extrem/, "");
    let gif = await fetchAnimeGif(command);
    if (!gif || !isValidGif(gif)) gif = getFallbackGif(command);
    if (!gif) {
      return { embeds: [buildFunEmbed({ title: "GIF Unavailable", description: `The ${command} GIF service is unavailable right now. Please try again shortly.`, requester: user, guildId })] };
    }
    const verbs = {
      hug: "hugged", kiss: "kissed", peck: "pecked", cuddle: "cuddled", pat: "patted",
      slap: "slapped", punch: "punched", bite: "bit", poke: "poked", smile: "smiled at", blush: "blushed at", horny: "felt bold around",
      feed: "fed", tickle: "tickled", wave: "waved at", cry: "cried with", dance: "danced with",
      pout: "pouted at", confused: "looked confused near", sleep: "fell asleep near", sleepy: "got sleepy near", angry: "got angry at", stare: "stared at",
      wink: "winked at", thumbsup: "gave a thumbs up to", facepalm: "facepalmed at", shrug: "shrugged at",
      highfive: "high-fived", bonk: "bonked", handhold: "held hands with", boop: "booped", nom: "nommed", lick: "licked",
      blushkiss: "shyly kissed", instantkiss: "instantly kissed", instanthug: "instantly hugged", instantslap: "instantly slapped", extremkiss: "extremely kissed", extremhug: "extremely hugged", extremslap: "extremely slapped",
      fuck: "went feral on", yeet: "yeeted", bully: "bullied", torture: "tortured", laugh: "laughed at", lmao: "laughed hard at",
      kidnap: "kidnapped", kill: "eliminated",
    };
    const targetName = target?.id === user.id && !["blush", "cry", "dance", "wave", "pout", "sleepy", "angry", "stare"].includes(base)
      ? "themself"
      : funDisplayName(target);
    const actionText = verbs[command] || verbs[base] || "interacted with";
    const soloTitles = {
      blush: `${display} is blushing`,
      cry: `${display} is crying`,
      dance: `${display} is dancing`,
      wave: `${display} is waving`,
      pout: `${display} is pouting`,
      confused: `${display} is confused`,
      sleep: `${display} is sleeping`,
      sleepy: `${display} is sleepy`,
      angry: `${display} is angry`,
      stare: `${display} is staring`,
      thumbsup: `${display} gives a thumbs up`,
      facepalm: `${display} facepalms`,
      shrug: `${display} shrugs`,
    };
    const rawTitle = target?.id === user.id && soloTitles[command]
      ? soloTitles[command]
      : `${display} ${actionText} ${targetName}`;
    const title = withFunEmoji(command, rawTitle);
    return { embeds: [buildFunEmbed({ title, description: " ", image: gif, requester: user, guildId })] };
  }
  if (command === "ship") {
    const other = target2 || target;
    const score = isPerfectShipPair(target, other)
      ? 200
      : seededRate(`${target.id}:${other.id}`, "ship", 0, 100);
    return await buildShipPayload({ title: "Ship Meter", user1: target, user2: other, score, requester: user, guildId });
  }
  if (command === "lovemeter" || command === "loverate") {
    const score = seededRate(`${user.id}:${target.id}`, "love");
    return await buildShipPayload({ title: "Love Meter", user1: user, user2: target, score, requester: user, guildId });
  }
  const labels = {
    gayrate:    ["Rainbow Rate",  "rainbow energy"],
    simprate:   ["Simp Rate",     "simp levels"],
    howhot:     ["Hotness Check", "heat"],
    iq:         ["IQ Scanner",    "IQ"],
    cuterate:   ["Cute Rate",     "cute energy"],
    hornyrate:  ["Horny Rate",    "chaos"],
    lesbianrate:["Lesbian Rate",  "sapphic sparkle"],
    prettyrate: ["Pretty Rate",   "pretty points"],
    babyrate:   ["Baby Rate",     "baby energy"],
    crazyrate:  ["Crazy Rate",    "wildness"],
    susrate:    ["Sus Rate",      "suspicion"],
    simpcheck:  ["Simp Check",    "simp levels"],
    niggarate:  ["N-Word Rate",   "n-word energy"],
    uglyrate:   ["Ugly Rate",     "ugly energy"],
  };
  const [title, label] = labels[command] || ["Rate", "score"];
  const isIq = command === "iq";
  const score = isIq ? seededRate(target.id, command, 40, 200) : seededRate(target.id, command);
  const suffix = isIq ? "" : "%";
  const numeric = Math.max(0, Math.min(isIq ? 200 : 100, Number(score) || 0));
  const displayValue = `${numeric}${suffix}`;

  const avatarUrl = target.displayAvatarURL?.({ dynamic: true, size: 256 })
    || target.user?.displayAvatarURL?.({ dynamic: true, size: 256 })
    || "https://cdn.discordapp.com/embed/avatars/0.png";
  const profileUrl = `https://discord.com/users/${target.id}`;
  const targetDisplay = funDisplayName(target);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${withFunEmoji(command, `${targetDisplay}'s ${title}`)}`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addSectionComponents(s => s
      .addTextDisplayComponents(t => t.setContent(
        `[${targetDisplay}](${profileUrl})\n` +
        `${label}: **${displayValue}**\n` +
        `${buildRateBar(numeric, isIq ? 200 : 100)}`
      ))
      .setThumbnailAccessory(th => th.setURL(avatarUrl))
    )
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(`-# Requested by ${funDisplayName(user)}`));

  applyTheme(container, guildId);
  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

Object.assign(globalThis, {
  buildFunEmbed,
  buildShipEmbed,
  buildShipContainerPayload,
  buildShipPayload,
  buildPatPatPayload,
  buildImageFunPayload,
  isPerfectShipPair,
  fetchAnimeGif,
  fetchTenorGif,
  isValidGif,
  getFallbackGif,
  runSoezyFunCommand,
});
