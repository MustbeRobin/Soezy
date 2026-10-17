const INVITE_REGEX = /\b(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/gi;

function messageText(message) {
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

function findInvites(text) {
  const matches = new Set();
  String(text || "").replace(INVITE_REGEX, match => {
    matches.add(match);
    return match;
  });
  return [...matches];
}

function check(message) {
  const invites = findInvites(messageText(message));
  if (!invites.length) return null;

  return {
    type: "invite",
    title: "Invite Link Protection",
    reason: "Discord invite link detected",
    indicators: invites.slice(0, 5),
    delete: true,
  };
}

module.exports = {
  INVITE_REGEX,
  findInvites,
  check,
};
