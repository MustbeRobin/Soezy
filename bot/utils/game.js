'use strict';

const {
 ContainerBuilder,
 SeparatorBuilder,
 TextDisplayBuilder,
 ActionRowBuilder,
 ButtonBuilder,
 ButtonStyle,
 SeparatorSpacingSize,
 MessageFlags
} = require('discord.js');
const {
 getThemeColor,
 getSuccessColor,
 getErrorColor,
 getWarningColor,
} = require('./theme');

// ═══════════════════════════════════════════════════════════════
// SET YOUR GITHUB PAGES URL BELOW
// ═══════════════════════════════════════════════════════════════
const CHESS_GAME_URL = 'https://izkiwi.github.io/chess/';

// ═══════════════════════════════════════════════════════════════
// FIREBASE — injected via init(db) called from index.js
// e.g. require('./game').init(firebaseDb);
// ═══════════════════════════════════════════════════════════════
let _db = null;

// roomId → { whiteMsg, blackMsg, listener, timeout }
const pendingGames = new Map();

// Safety: auto-clean entries after 24 h even if Firebase never fires
const GAME_TTL_MS = 24 * 60 * 60 * 1000;

// ── Container style helpers (mirrors index.js) ────────────────
const C2_ICON = {
 success: '<a:1yay:1486758439794245793>',
 error: '<a:swhy:1487769488060321984>',
 warning: '<a:scry:1487769483631394878>',
 info: '<a:thinking:1559656266261995620>',
};
const C2_COLOR = {
 success: getSuccessColor(),
 error: getErrorColor(),
 warning: getWarningColor(),
 info: getThemeColor(null),
};
const ARROW = '<a:zyarrow:1487457493549453339>';

/**
 * Build a standard reply ContainerBuilder — same pattern as index.js.
 * @param {"success"|"error"|"warning"|"info"} type
 * @param {string} title
 * @param {string} description
 * @param {{name,value}[]} [fields]
 * @param {string|null} [thumbnail] URL
 */
function buildReplyContainer(type, title, description, fields = [], thumbnail = null) {
 const icon = C2_ICON[type] || C2_ICON.info;
 const container = new ContainerBuilder();

 // Strip leading custom/unicode emoji from title to prevent double-emoji
 const cleanTitle = String(title || "Notice")
 .replace(/^#{1,6}\s*/, '')
 .replace(/^(\s*(<a?:[^:>]+:\d+>|[\p{Emoji_Presentation}\p{Extended_Pictographic}])\s*)+/u, '')
 .replace(/\*\*/g, '')
 .trim();
 const headerText = `### ${icon} ${cleanTitle || "Notice"}`;

 // ── Header (section with optional thumbnail) ──────────────────
 if (thumbnail) {
 container.addSectionComponents(section =>
 section
 .addTextDisplayComponents(text => text.setContent(headerText))
 .setThumbnailAccessory(thumb => thumb.setURL(thumbnail))
 );
 } else {
 container.addTextDisplayComponents(
 new TextDisplayBuilder().setContent(headerText)
 );
 }

 // ── Separator ─────────────────────────────────────────────────
 container.addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small).setDivider(true));

 // ── Description body — prefix each line with arrow ────────────
 if (description) {
 const bodyLines = description.split('\n').map(line => {
 if (line.trim() === '') return '';
 if (line.startsWith('<a:zyarrow') || line.startsWith('```') || line.startsWith('-#')) return line;
 return `${ARROW} ${line}`;
 }).join('\n');
 container.addTextDisplayComponents(
 new TextDisplayBuilder().setContent(bodyLines)
 );
 }

 // ── Optional extra fields ─────────────────────────────────────
 if (fields && fields.length > 0) {
 container.addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small));
 const fieldLines = fields.map(f => `${ARROW} ${String(f.name || "").replace(/\*\*/g, "").trim()}: ${f.value}`).join('\n');
 container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fieldLines));
 }

 return container;
}

// ── helpers ───────────────────────────────────────────────────
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genRoomId() {
 return Array.from({ length: 6 }, () =>
 ROOM_CHARS[Math.random() * ROOM_CHARS.length | 0]
 ).join('');
}

function _buildGameDM({ gameUrl, isWhite, opponentTag, timestamp }) {
 const myRole = isWhite ? ' White ♔' : ' Black ♚';
 const oppRole = isWhite ? ' Black ♚' : ' White ♔';
 const type = isWhite ? 'success' : 'info';

 const container = buildReplyContainer(
 type,
 ' Chess — Your Game is Ready!',
 `You are: **${myRole}**\nOpponent: **${oppRole}** — ${opponentTag}\n\nClick the button below to open the board.\n-# Keep your DMs open so you receive future challenges!`
 );

 container.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true));
 container.addActionRowComponents(row => row.addComponents(
 new ButtonBuilder()
 .setLabel('Open Chess Board')
 .setStyle(ButtonStyle.Link)
 .setURL(gameUrl)
 ));
 container.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small));
 container.addTextDisplayComponents(t => t.setContent(
 `-# Your link is private — don't share it · <t:${Math.floor(timestamp / 1000)}:t>`
 ));

 return {
 components: [container],
 flags: MessageFlags.IsComponentsV2
 };
}

// ── DM cleanup ────────────────────────────────────────────────
function _cleanupGame(roomId) {
 const entry = pendingGames.get(roomId);
 if (!entry) return;

 if (_db && entry.listener) {
 try { _db.ref(`games/${roomId}/status`).off('value', entry.listener); }
 catch { /* ignore */ }
 }

 clearTimeout(entry.timeout);
 entry.whiteMsg?.delete().catch(() => {});
 entry.blackMsg?.delete().catch(() => {});

 pendingGames.delete(roomId);
 console.log(`[chess] DMs cleaned up for room ${roomId}`);
}

function _watchGameCompletion(roomId, whiteMsg, blackMsg) {
 if (!_db) return;

 const entry = { whiteMsg, blackMsg, listener: null, timeout: null };

 const listener = (snap) => {
 if (snap.val() === 'finished') _cleanupGame(roomId);
 };
 entry.listener = listener;
 _db.ref(`games/${roomId}/status`).on('value', listener);
 entry.timeout = setTimeout(() => _cleanupGame(roomId), GAME_TTL_MS);

 pendingGames.set(roomId, entry);
}

// ═══════════════════════════════════════════════════════════════
module.exports = {

 // ─────────────────────────────────────────────────────────────
 // init — call this once in index.js after Firebase is ready
 // ─────────────────────────────────────────────────────────────
 init(db) {
 _db = db;
 console.log('[chess] Firebase watcher initialised — DMs will auto-delete on game end.');
 },

 // ─────────────────────────────────────────────────────────────
 // handleCommand — !chess @user
 // ─────────────────────────────────────────────────────────────
 handleCommand: async function (msg, args, opponent, prefix) {

 if (!opponent) {
 return msg.reply({
 components: [
 buildReplyContainer(
 'info',
 ' Chess',
 `**Usage:**\n\`${prefix ?? `@${msg.client.user.username} `}chess @user\`\n\`@${msg.client.user.username} chess @user\`\n\nChallenge someone! Both players get a private board link after the opponent accepts.\n-# @${msg.author.username} · <t:${Math.floor(Date.now() / 1000)}:t>`
 )
 ],
 flags: MessageFlags.IsComponentsV2
 });
 }

 if (opponent.id === msg.author.id) {
 return msg.reply({
 components: [buildReplyContainer('error', ' Chess', ' You cannot challenge yourself!')],
 flags: MessageFlags.IsComponentsV2 | 64
 });
 }

 if (opponent.bot) {
 return msg.reply({
 components: [buildReplyContainer('error', ' Chess', ' You cannot challenge a bot!')],
 flags: MessageFlags.IsComponentsV2 | 64
 });
 }

 const p1Id = msg.author.id;
 const p2Id = opponent.id;
 const roomId = genRoomId();
 const timestamp = Date.now();

 // Challenge container — warning style with buttons
 // Built manually (not via buildReplyContainer) because it needs an action row mid-body
 const challengeContainer = new ContainerBuilder()
 .addSectionComponents(s => s
 .addTextDisplayComponents(t => t.setContent(`${C2_ICON.warning} ** Chess Challenge!**`))
 .setThumbnailAccessory(th =>
 th.setURL(msg.author.displayAvatarURL({ dynamic: true, size: 256 }))
 )
 )
 .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
 .addTextDisplayComponents(t => t.setContent(
 `${ARROW} <@${p1Id}> challenges <@${p2Id}> to a game of **Kiwi Chess**!\n` +
 `${ARROW} <@${p2Id}>, do you accept?`
 ))
 .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
 .addActionRowComponents(row => row.addComponents(
 new ButtonBuilder()
 .setCustomId(`chess_a_${p1Id}_${p2Id}_${roomId}`)
 .setLabel('Accept')
 .setStyle(ButtonStyle.Success),
 new ButtonBuilder()
 .setCustomId(`chess_d_${p1Id}_${p2Id}`)
 .setLabel('Decline')
 .setStyle(ButtonStyle.Danger)
 ))
 .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
 .addTextDisplayComponents(t => t.setContent(
 `-# Challenge expires in 5 minutes · <t:${Math.floor(timestamp / 1000)}:t>`
 ));

 return msg.reply({
 components: [challengeContainer],
 flags: MessageFlags.IsComponentsV2
 });
 },

 // ─────────────────────────────────────────────────────────────
 // handleButton — wired in index.js interactionCreate
 // ─────────────────────────────────────────────────────────────
 handleButton: async function (interaction) {
 const { customId, user } = interaction;

 // ── ACCEPT ────────────────────────────────────────────────
 if (customId.startsWith('chess_a_')) {
 const parts = customId.split('_');
 const p1Id = parts[2];
 const p2Id = parts[3];
 const roomId = parts[4];

 if (user.id !== p2Id) {
 return interaction.reply({
 components: [buildReplyContainer('error', ' Chess', `Only <@${p2Id}> can accept or decline this challenge.`)],
 flags: MessageFlags.IsComponentsV2 | 64
 });
 }

 await interaction.deferUpdate();

 const timestamp = Date.now();
 const p1User = await interaction.client.users.fetch(p1Id).catch(() => null);
 const p1Name = p1User?.username || 'Challenger';
 const p2Name = user.username;

 const whiteUrl = `${CHESS_GAME_URL}?room=${roomId}&color=w&name=${encodeURIComponent(p1Name)}`;
 const blackUrl = `${CHESS_GAME_URL}?room=${roomId}&color=b&name=${encodeURIComponent(p2Name)}`;

 // ── DM White (challenger) ─────────────────────────────
 let whiteMsg = null;
 let whiteDmFailed = false;
 try {
 if (p1User) {
 whiteMsg = await p1User.send(
 _buildGameDM({ gameUrl: whiteUrl, roomId, isWhite: true, opponentTag: `<@${p2Id}>`, timestamp })
 );
 } else { whiteDmFailed = true; }
 } catch { whiteDmFailed = true; }

 // ── DM Black (challenged) ─────────────────────────────
 let blackMsg = null;
 let blackDmFailed = false;
 try {
 blackMsg = await user.send(
 _buildGameDM({ gameUrl: blackUrl, roomId, isWhite: false, opponentTag: `<@${p1Id}>`, timestamp })
 );
 } catch { blackDmFailed = true; }

 if (whiteMsg || blackMsg) _watchGameCompletion(roomId, whiteMsg, blackMsg);

 // ── Build channel reply ───────────────────────────────
 let statusLine;
 if (!whiteDmFailed && !blackDmFailed) {
 statusLine =
 ` **Both players have been DM'd their private board link!**\n` +
 `Check your DMs → click **Open Chess Board** to start playing.`;
 } else {
 const failed = [];
 if (whiteDmFailed) failed.push(`<@${p1Id}> (White)`);
 if (blackDmFailed) failed.push(`<@${p2Id}> (Black)`);
 statusLine =
 ` Couldn't DM: ${failed.join(' & ')} — DMs may be closed.\n\n` +
 (whiteDmFailed ? ` **White link:** ${whiteUrl}\n` : '') +
 (blackDmFailed ? ` **Black link:** ${blackUrl}` : '');
 }

 const resultType = (whiteDmFailed || blackDmFailed) ? 'warning' : 'success';
 const acceptedContainer = buildReplyContainer(
 resultType,
 ' Game Started!',
 ` <@${p1Id}> **(White)** vs <@${p2Id}> **(Black)**\n\n${statusLine}\n-# <@${p1Id}> vs <@${p2Id}> · <t:${Math.floor(timestamp / 1000)}:t>`,
 [],
 user.displayAvatarURL({ dynamic: true, size: 256 })
 );

 return interaction.editReply({
 components: [acceptedContainer],
 flags: MessageFlags.IsComponentsV2
 });
 }

 // ── DECLINE ───────────────────────────────────────────────
 if (customId.startsWith('chess_d_')) {
 const parts = customId.split('_');
 const p1Id = parts[2];
 const p2Id = parts[3];

 if (user.id !== p2Id) {
 return interaction.reply({
 components: [buildReplyContainer('error', ' Chess', `Only <@${p2Id}> can accept or decline this challenge.`)],
 flags: MessageFlags.IsComponentsV2 | 64
 });
 }

 return interaction.update({
 components: [
 buildReplyContainer(
 'error',
 ' Challenge Declined',
 `<@${p2Id}> declined the chess challenge from <@${p1Id}>.\n-# <t:${Math.floor(Date.now() / 1000)}:t>`
 )
 ],
 flags: MessageFlags.IsComponentsV2
 });
 }
 }
};
