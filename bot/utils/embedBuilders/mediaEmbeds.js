"use strict";
/* ================= MEDIA EMBED BUILDERS ================= */
(() => {
function mediaButton(label, url) {
  return new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url);
}

function formatButtonsForImage(user, kind) {
  const getter = kind === "banner" ? user.bannerURL.bind(user) : user.displayAvatarURL.bind(user);
  const dynamic = getter({ dynamic: true, size: 4096 });
  const png = getter({ extension: "png", size: 4096 });
  const jpg = getter({ extension: "jpg", size: 4096 });
  const webp = getter({ extension: "webp", size: 4096 });
  const row = new ActionRowBuilder().addComponents(
    mediaButton("PNG", png || dynamic),
    mediaButton("JPG", jpg || dynamic),
    mediaButton("WEBP", webp || dynamic)
  );
  return row;
}

function buildMediaContainer(title, targetUser, requester, imageUrl, options = {}) {
  const ARR = getEmoji("arrow");
  const container = new ContainerBuilder()
    .addSectionComponents(s => s
      .addTextDisplayComponents(t => t.setContent(
        `## ${title}\n` +
        `${ARR} **User:** ${targetUser.username}\n` +
        `${ARR} **ID:** \`${targetUser.id}\``
      ))
      .setThumbnailAccessory(th => th.setURL(targetUser.displayAvatarURL({ dynamic: true, size: 128 })))
    )
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addMediaGalleryComponents(g => g.addItems(i => i.setURL(imageUrl)))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  if (options.row) container.addActionRowComponents(options.row);
  return container
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t => t.setContent(`-# Requested by ${requester.username}`));
}

async function buildAvatarEmbed(targetUser, requester) {
  const user = targetUser.fetch ? await targetUser.fetch(true).catch(() => targetUser) : targetUser;
  const imageUrl = user.displayAvatarURL({ dynamic: true, size: 4096 });
  return {
    components: [buildMediaContainer(`${EMOJIS.image || ""} ${user.username}'s Avatar`, user, requester, imageUrl, {
      row: formatButtonsForImage(user, "avatar"),
    })],
    flags: MessageFlags.IsComponentsV2,
  };
}

async function buildBannerEmbed(targetUser, requester) {
  const user = targetUser.fetch ? await targetUser.fetch(true).catch(() => targetUser) : targetUser;
  const imageUrl = user.bannerURL?.({ dynamic: true, size: 4096 });
  if (!imageUrl) return {
    components: [createErrorContainer("Running Bannerless", `${user.username} has no profile banner.`)],
    flags: MessageFlags.IsComponentsV2 | 64,
  };
  return {
    components: [buildMediaContainer(`${EMOJIS.image || ""} ${user.username}'s Banner`, user, requester, imageUrl, {
      row: formatButtonsForImage(user, "banner"),
    })],
    flags: MessageFlags.IsComponentsV2,
  };
}

function buildGifEmbed(action, user, target, gifUrl, text) {
  const title = `${String(action || "Action").replace(/(^|\s)\w/g, c => c.toUpperCase())}`;
  if (typeof buildFunEmbed === "function") {
    return {
      embeds: [buildFunEmbed({
        title,
        description: text,
        image: gifUrl,
        requester: user,
        guildId: target?.guild?.id || null,
      })],
    };
  }
  return {
    embeds: [createEmbed({
      title,
      description: text,
      image: gifUrl,
      footer: `Requested by ${user.username}`,
      guildId: target?.guild?.id || null,
      timestamp: true,
    })],
  };
}

function validateMediaUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(String(value).trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildSendContainer({ title, message, image, thumbnail, footer, requester, guildId } = {}) {
  const safeImage = validateMediaUrl(image);
  const safeThumbnail = validateMediaUrl(thumbnail);
  const header = title ? `### ${title}` : null;
  const container = new ContainerBuilder();

  if (safeThumbnail) {
    container.addSectionComponents(section =>
      section
        .addTextDisplayComponents(t => t.setContent([header, message].filter(Boolean).join("\n\n")))
        .setThumbnailAccessory(th => th.setURL(safeThumbnail))
    );
  } else {
    container.addTextDisplayComponents(t => t.setContent([header, message].filter(Boolean).join("\n\n")));
  }

  if (safeImage) {
    container
      .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addMediaGalleryComponents(g => g.addItems(i => i.setURL(safeImage)));
  }

  if (footer || requester) {
    container
      .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t => t.setContent(`-# ${footer || `Requested by ${requester?.username || "Admin"}`}`));
  }

  return container;
}

function buildSendMediaContainer(options = {}) {
  return buildSendContainer(options);
}

Object.assign(globalThis, { buildAvatarEmbed, buildBannerEmbed, buildGifEmbed, buildSendContainer, buildMediaContainer, buildSendMediaContainer, validateMediaUrl });

const mediaEmbedApi = { buildAvatarEmbed, buildBannerEmbed, buildGifEmbed, buildSendContainer, buildMediaContainer, buildSendMediaContainer, validateMediaUrl };
Object.assign(globalThis, mediaEmbedApi, { soezyMediaEmbeds: mediaEmbedApi });
module.exports = mediaEmbedApi;
})();
