const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorSpacingSize,
} = require("discord.js");

const PAGE_SIZE = 10;
const TICK = "<:tick:1559236522711187577>";
const CROSS = "<:scross:1559257945030525110>";

function buildPremiumListView({
  db,
  type = "users",
  page = 1,
  requesterId,
  isPremiumUser,
  isPremiumGuild,
  premiumPlans = {},
  gemEmoji = "💎",
}) {
  const listType = type === "guilds" ? "guilds" : "users";
  const entries = Object.entries(db?.premium?.[listType] || {});
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(totalPages, Math.max(1, Number.parseInt(page, 10) || 1));
  const start = (currentPage - 1) * PAGE_SIZE;
  const visibleEntries = entries.slice(start, start + PAGE_SIZE);
  const isActive = listType === "users" ? isPremiumUser : isPremiumGuild;
  const lines = visibleEntries.map(([id, premium]) => {
    const expiry = Number(premium?.expiresAt);
    const expiryLabel = Number.isFinite(expiry) && expiry > 0
      ? `<t:${Math.floor(expiry / 1000)}:R>`
      : "No expiry set";
    const plan = premiumPlans[premium?.plan]?.label || premium?.plan || "Unknown plan";
    const active = typeof isActive === "function" && isActive(id) ? TICK : CROSS;
    return `${active} \`${id}\` — ${plan} (${expiryLabel})`;
  });

  const label = listType === "users" ? "Users" : "Guilds";
  const rangeLabel = entries.length
    ? `Showing ${start + 1}–${Math.min(start + visibleEntries.length, entries.length)} of ${entries.length}`
    : "No premium records found.";

  const makeButton = (buttonType, buttonPage, buttonLabel, style, disabled = false) =>
    new ButtonBuilder()
      .setCustomId(`premium_list_${buttonType}_${requesterId}_${buttonPage}`)
      .setLabel(buttonLabel)
      .setStyle(style)
      .setDisabled(disabled);

  const controls = new ActionRowBuilder().addComponents(
    makeButton("users", 1, `Users (${Object.keys(db?.premium?.users || {}).length})`, listType === "users" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    makeButton("guilds", 1, `Guilds (${Object.keys(db?.premium?.guilds || {}).length})`, listType === "guilds" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    makeButton(listType, currentPage - 1, "◀ Previous", ButtonStyle.Secondary, currentPage <= 1),
    makeButton(listType, currentPage + 1, "Next ▶", ButtonStyle.Secondary, currentPage >= totalPages),
  );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(text => text.setContent(`## ${gemEmoji} Premium ${label}`))
    .addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(text => text.setContent(
      `**${rangeLabel}**\n${lines.join("\n") || "*None*"}`
    ))
    .addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(controls)
    .addTextDisplayComponents(text => text.setContent(`-# Page ${currentPage} / ${totalPages} • Use the buttons to switch between users and guilds.`));

  return { container, page: currentPage, totalPages, entries: entries.length };
}

module.exports = { buildPremiumListView };
