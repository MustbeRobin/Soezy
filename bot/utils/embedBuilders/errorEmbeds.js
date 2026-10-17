/* ================= CORE + ERROR EMBED BUILDERS ================= */
﻿/* ================= EMBED BUILDER HELPER ================= */

function buildEmbedFromData(data, guildId = null) {
  // Helper: only pass a value as a URL if it actually looks like one.
  // This prevents unresolved placeholder strings like {server_avatar} from
  // failing discord.js's URL validation when there is no guild/member context.
  const safeUrl = v => (v && typeof v === "string" && /^https?:\/\//i.test(v)) ? v : undefined;

  const embed = new EmbedBuilder().setColor(resolveThemeColor(data.color, guildId || data.guildId || null));
  if (data.title) embed.setTitle(clampText(data.title, 256));
  if (data.description) embed.setDescription(clampText(data.description, 4096));
  if (data.author?.name) embed.setAuthor({
    name: clampText(data.author.name, 256),
    iconURL: safeUrl(data.author.iconURL),
    url: safeUrl(data.author.url),
  });
  if (data.footer?.text) embed.setFooter({
    text: clampText(data.footer.text, 2048),
    iconURL: safeUrl(data.footer.iconURL),
  });
  if (safeUrl(data.thumbnail)) embed.setThumbnail(data.thumbnail);
  if (safeUrl(data.image)) embed.setImage(data.image);
  if (data.timestamp) embed.setTimestamp();
  if (data.fields && data.fields.length > 0) {
    embed.addFields(data.fields.slice(0, 25).map(f => ({
      name: clampText(f?.name || "\u200b", 256),
      value: clampText(f?.value || "\u200b", 1024),
      inline: !!f?.inline,
    })));
  }
  return embed;
}

// Resolves embed placeholders – {user} {username} {server} {membercount}
// {server_avatar} {server_banner} {bot_avatar} {bot_banner} {user_avatar} {user_banner}
function resolvePlaceholders(text, guild, member) {
  if (!text || typeof text !== "string") return text;

  // Pre-compute URL values (sync – uses cached data on user/guild objects)
  const serverAvatar = guild?.iconURL({ dynamic: true, size: 512 }) || "";
  const serverBanner = guild?.bannerURL({ dynamic: true, size: 1024 }) || "";
  const botAvatar = typeof getBotAvatar === "function"
    ? getBotAvatar(guild?.id, 512)
    : (client.user?.displayAvatarURL({ extension: "png", size: 512 }) || "");
  const botBanner = typeof getBotBanner === "function"
    ? getBotBanner(guild?.id, 1024)
    : (client.user?.bannerURL?.({ dynamic: true, size: 1024 }) || "");
  const userAvatar = member?.displayAvatarURL?.({ dynamic: true, size: 512 })
    || member?.user?.displayAvatarURL({ dynamic: true, size: 512 })
    || "";
  const userBanner = member?.displayBannerURL?.({ dynamic: true, size: 512 })
    || member?.user?.bannerURL?.({ dynamic: true, size: 512 })
    || "";

  return text
    .replace(/\{user\}/gi, member ? `<@${member.id}>` : "{user}")
    .replace(/\{username\}/gi, member?.user?.username || member?.displayName || "{username}")
    .replace(/\{server\}/gi, guild?.name || "{server}")
    .replace(/\{membercount\}/gi, guild ? String(guild.memberCount) : "{membercount}")
    .replace(/\{server_avatar\}/gi, serverAvatar)
    .replace(/\{server_banner\}/gi, serverBanner)
    .replace(/\{bot_avatar\}/gi, botAvatar)
    .replace(/\{bot_banner\}/gi, botBanner)
    .replace(/\{user_avatar\}/gi, userAvatar)
    .replace(/\{user_banner\}/gi, userBanner);
}

// Build embed with placeholder resolution – use at send time, not edit time
function buildEmbedFromDataWithContext(data, guild, member) {
  const guildId = guild?.id || null;
  const r = t => resolvePlaceholders(t, guild, member);
  const resolved = {
    ...data,
    title: r(data.title),
    description: r(data.description),
    // Resolve ALL author fields including iconURL and url
    author: data.author ? {
      name: r(data.author.name),
      iconURL: r(data.author.iconURL) || null,
      url: r(data.author.url) || null,
    } : null,
    // Resolve ALL footer fields including iconURL
    footer: data.footer ? {
      text: r(data.footer.text),
      iconURL: r(data.footer.iconURL) || null,
    } : null,
    fields: (data.fields || []).map(f => ({ ...f, name: r(f.name), value: r(f.value) })),
    // Resolve image URL placeholders ({user_avatar}, {bot_avatar}, etc.) in thumbnail/image
    thumbnail: r(data.thumbnail) || null,
    image: r(data.image) || null,
  };
  return buildEmbedFromData(resolved, guildId);
}

// Returns a safe preview EmbedBuilder for the embed editor panel.
// Strips unresolved placeholder URLs so the preview never throws a validation error.
function buildEmbedPreviewForEditor(data) {
  return buildEmbedFromData(data); // buildEmbedFromData now guards all URLs via safeUrl
}

function getMaxEmbedFields(userId, guildId) {
  // Check admin-granted premium first (plan-aware)
  if (isPremiumUser(userId) || isPremiumGuild(guildId)) {
    const plan = db.premium?.users?.[userId]?.plan || db.premium?.guilds?.[guildId]?.plan;
    if (plan === "ultra") return 25;
    if (plan === "pro") return 15;
    if (plan === "plus") return 10;
  }
  // Shop premium = plus-level only (10 fields)
  if (isShopPremium(userId, guildId)) return 10;
  return 5;
}

// Returns max named embeds a user/guild can store
function getMaxSavedEmbeds(userId, guildId) {
  if (isPremiumUser(userId) || isPremiumGuild(guildId)) {
    const plan = db.premium?.users?.[userId]?.plan || db.premium?.guilds?.[guildId]?.plan;
    if (plan === "ultra") return 25;
    if (plan === "pro") return 15;
    if (plan === "plus") return 10;
  }
  if (isShopPremium(userId, guildId)) return 10;
  return 5;
}

// Build the embed-list/config container panel
function buildEmbedListPanel(guildId, userId, username, sessionId) {
  const ARR = getEmoji("black_dot");
  const saved = (db.guilds?.[guildId]?.savedEmbeds) || {};
  const names = Object.keys(saved);
  const maxE = getMaxSavedEmbeds(userId, guildId);

  const listText = names.length
    ? names.map((n) => `${ARR} \`${n}\``).join("\n")
    : "*No saved embeds yet. Use the button below to create one!*";

  const createBtn = new ButtonBuilder()
    .setCustomId(`emblist_create_${sessionId}`)
    .setLabel("Create Embed")
    .setStyle(ButtonStyle.Primary);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${EMOJIS.config_title} ${EMOJIS.soezy_success} Saved Embeds`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(
      `**Stored:** \`${names.length}/${maxE}\`\n\n` +
      listText
    ))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(createBtn))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(`-# Requested by ${username}`));

  return container;
}

// Build the embed editor config panel (named embed)
// Returns { container } – use: interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 })
// NOTE: embeds field CANNOT be used with MessageFlags.IsComponentsV2 – preview is shown inside the container.
function buildNamedEmbedEditorPanel(embedData, sessionId, embedName, guildUrl, username) {
  const ARR = getEmoji("black_dot");
  const maxF = embedData._maxF || 5;
  const curF = embedData.fields?.length || 0;

  //  Compact status line 
  const previewColor = embedData.color
    ? `${ARR} **Color:** \`#${embedData.color.toString(16).padStart(6, "0").toUpperCase()}\``
    : `${ARR} **Color:** Server theme`;
  const previewThumb = embedData.thumbnail
    ? `${ARR} **Thumbnail:** ${EMOJIS.success} Set`
    : `${ARR} **Thumbnail:** ${EMOJIS.error} Not set`;
  const previewImage = embedData.image
    ? `${ARR} **Image:** ${EMOJIS.success} Set`
    : `${ARR} **Image:** ${EMOJIS.error} Not set`;
  const previewFields = `${ARR} **Fields:** \`${curF}/${maxF}\``;

  //  Inline embed preview (replaces the legacy embeds[] field) 
  const previewLines = [];
  if (embedData.author?.name) previewLines.push(`-# ${embedData.author.name}`);
  if (embedData.title) previewLines.push(`### ${embedData.title}`);
  if (embedData.description) previewLines.push(embedData.description);
  if (embedData.fields?.length) {
    for (const f of embedData.fields.slice(0, maxF)) {
      previewLines.push(`**${f.name}**\n${f.value}`);
    }
  }
  if (embedData.footer?.text) previewLines.push(`-# ${embedData.footer.text}`);

  const previewText = previewLines.length > 0
    ? previewLines.join("\n")
    : "### Edit your Embed!\n- Select Options what to edit from the below select menu.\n\nMust edit embed title & description to remove these instructions.";

  //  Select menu 
  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`embnamedcfg_select_${sessionId}`)
    .setPlaceholder("Choose an option to edit the Embed")
    .addOptions([
      { label: "Title", description: "Edit the title of the embed", value: `embnamed_title_${sessionId}`, },
      { label: "Description", description: "Edit the description of the embed", value: `embnamed_description_${sessionId}`, },
      { label: "Add Field", description: "Add a field to the embed", value: `embnamed_addfield_${sessionId}`, },
      { label: "Color", description: "Edit the color of the embed", value: `embnamed_color_${sessionId}`, },
      { label: "Thumbnail", description: "Edit the thumbnail of the embed", value: `embnamed_thumbnail_${sessionId}`, },
      { label: "Image", description: "Edit the image of the embed", value: `embnamed_image_${sessionId}`, },
      { label: "Footer Text", description: "Edit the footer text of the embed", value: `embnamed_footertext_${sessionId}`, },
      { label: "Footer Icon", description: "Edit the footer icon of the embed", value: `embnamed_footericon_${sessionId}`, },
      { label: "Author Text", description: "Edit the author text of the embed", value: `embnamed_authortext_${sessionId}`, },
      { label: "Author Icon", description: "Edit the author icon of the embed", value: `embnamed_authoricon_${sessionId}`, },
    ]);

  //  Buttons 
  const sendBtn = new ButtonBuilder()
    .setCustomId(`embnamed_sendbtn_${sessionId}`)
    .setLabel("Send Embed")
    .setStyle(ButtonStyle.Success)
    .setEmoji(getStatusEmojiObject("Action", "send"));

  const cancelBtn = new ButtonBuilder()
    .setCustomId(`embnamed_cancelbtn_${sessionId}`)
    .setLabel("Cancel Setup")
    .setStyle(ButtonStyle.Danger)
    .setEmoji(getStatusEmojiObject("Action", "delete"));

  const container = new ContainerBuilder()
    //  Header 
    .addTextDisplayComponents(t => t.setContent(`## ${EMOJIS.config_title} ${EMOJIS.thinking} Embed Editor – \`${embedName}\``))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    //  Inline embed preview 
    .addTextDisplayComponents(t => t.setContent(previewText))
    //  Status summary (color / thumbnail / image / fields) 
    .addTextDisplayComponents(t => t.setContent(
      [previewColor, previewThumb, previewImage, previewFields].join("\n")
    ))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    //  Dropdown 
    .addActionRowComponents(new ActionRowBuilder().addComponents(dropdown))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    //  Buttons 
    .addActionRowComponents(new ActionRowBuilder().addComponents(sendBtn, cancelBtn))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    //  Footer 
    .addTextDisplayComponents(t => t.setContent(
      `-# Editing as ${username}`
    ));

  return { container };
}

const namedEmbedSessions = new ManagedMap("namedEmbedSessions", { ttl: 30 * 60 * 1000, max: 5000 }); // sessionId → { embedName, guildId, userId }

const ARROW_EMOJI = getEmoji("arrow");
const EXCL_EMOJI = "";

function wrapDescriptionFields(text) {
  if (!text) return text;
  return text.split("\n").map(line => {
    if (line.includes(ARROW_EMOJI) || line.includes(EXCL_EMOJI)) return line;
    const trimmed = line.trim();
    if (!trimmed) return line;
    // Skip lines that are already arrow sub-bullets, giveaway emojis, blockquotes, code or list bullets
    if (
      trimmed.startsWith("<a:arrow_arrow") ||
      trimmed.startsWith("<a:giveaway") ||
      trimmed.startsWith(">") ||
      trimmed.startsWith("`") ||
      trimmed.startsWith("•") ||
      trimmed.startsWith("-") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("http")
    ) return line;
    // Wrap lines that start with **bold** (field labels like **User:** value or standalone **Title**)
    if (/^\*\*[^*]+\*\*/.test(trimmed)) {
      return `${ARROW_EMOJI} ${trimmed} ${EXCL_EMOJI}`;
    }
    return line;
  }).join("\n");
}

/** Returns true only if `url` is a non-empty string that passes URL parsing */
function isValidUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch { return false; }
}

function resolveThemeColor(color, guildId = null) {
  if (Number.isInteger(color)) return color;
  if (typeof color === "string" && /^#?[0-9a-f]{6}$/i.test(color)) {
    return parseInt(color.replace(/^#/, ""), 16);
  }
  return getThemeColor(guildId);
}

function clampText(value, max, fallback = "\u200b") {
  const text = String(value ?? fallback);
  return text.length > max ? text.slice(0, Math.max(0, max - 1)) + "…" : text;
}

function safeEmbedFields(fields) {
  if (!Array.isArray(fields)) return [];
  return fields.slice(0, 25).map(field => ({
    name: clampText(field?.name || "\u200b", 256),
    value: clampText(field?.value || "\u200b", 1024),
    inline: !!field?.inline,
  }));
}

function createEmbed(options = {}) {
  const embed = new EmbedBuilder()
    .setColor(resolveThemeColor(options.color, options.guildId));
  if (options.timestamp !== false) embed.setTimestamp();

  if (options.title) embed.setTitle(clampText(options.title, 256));
  if (options.description) embed.setDescription(clampText(wrapDescriptionFields(options.description), 4096));
  if (options.thumbnail && isValidUrl(options.thumbnail)) embed.setThumbnail(options.thumbnail);
  if (options.image && isValidUrl(options.image)) embed.setImage(options.image);

  // Fix footer handling - strip undefined/invalid iconURL so discord.js v14 does not throw
  if (options.footer) {
    if (typeof options.footer === 'string') {
      const footerObj = { text: clampText(options.footer, 2048) };
      if (options.footerIcon && isValidUrl(options.footerIcon)) footerObj.iconURL = options.footerIcon;
      embed.setFooter(footerObj);
    } else {
      const footerObj = { text: clampText(options.footer.text || '\u200b', 2048) };
      if (options.footer.iconURL && isValidUrl(options.footer.iconURL)) footerObj.iconURL = options.footer.iconURL;
      embed.setFooter(footerObj);
    }
  }

  if (options.author) {
    const authorObj = { name: clampText(options.author, 256) };
    if (options.authorIcon && isValidUrl(options.authorIcon)) authorObj.iconURL = options.authorIcon;
    embed.setAuthor(authorObj);
  }
  const fields = safeEmbedFields(options.fields);
  if (fields.length) embed.addFields(fields);

  return embed;
}

function createSuccessEmbed(title, description, fields = [], guildId = null) {
  return createEmbed({
    title: `${EMOJIS.soezy_success} ${bold(title)}`,
    description: description,
    color: typeof getSuccessColor === "function" ? getSuccessColor() : resolveThemeColor(null, guildId),
    guildId,
    fields: fields
  });
}

//  Funny random error pools 
// Keys are the "canonical" title passed by the code; values are arrays of
// [title, description] pairs to randomly pick from. If no match, original is kept.
const SAVAGE_ROAST_POOL = {
  "Nope, Not You": [
    ["Nope, Not You", d => d],
    ["Sit Down Before You Embarrass Yourself Further", d => d],
    ["You Don't Have Perms and You Never Will", d => d],
    ["The Audacity of a Broke Man Trying to Run Things", d => d],
    ["You? Seriously? That's Genuinely Sad.", d => d],
    ["Admin Perms Aren't for Everyone. Especially You.", d => d],
    ["I'd Say Try Again But Please Don't", d => d],
    ["Your Role Is Irrelevant and So Is This Attempt", d => d],
    ["Checked Your Perms. Laughed. Hard.", d => d],
    ["Not Your Server, Not Your Command, Not Your Day", d => d],
    ["Bro Really Thought He Had Power Here", d => d],
    ["Walk Away. Don't Look Back. Just Leave.", d => d],
  ],
  "Access Denied: You Are Not the Chosen One": [
    ["Access Denied: You Are Not the Chosen One", d => d],
    ["Owner Only. You're Not the Owner. You're the Problem.", d => d],
    ["The Bot Googled Your Name and Found Nothing Useful", d => d],
    ["This Command Requires Clout You Simply Don't Have", d => d],
    ["You Built Different — Wrong, Defective, and Denied", d => d],
    ["Checked the List. Your Name Was Crossed Out.", d => d],
    ["Not Getting In. Not Now, Not Ever, Not You.", d => d],
    ["The Bot Has Standards. Unfortunately for You.", d => d],
    ["Reserved for People Who Matter. Move Along.", d => d],
    ["Hard Denied. Embarrassingly Hard Denied.", d => d],
  ],
  "Uh Oh, Spaghetti-O": [
    ["Uh Oh, Spaghetti-O", d => d],
    ["You Somehow Made It Worse Than It Already Was", d => d],
    ["Congrats, You're the Reason We Can't Have Nice Things", d => d],
    ["This Is a Disaster and You Are Its Creator", d => d],
    ["The Code Is Crying and So Should You", d => d],
    ["Spectacular Failure. Genuinely Impressive How Bad.", d => d],
    ["Something Died in the Code and You Killed It", d => d],
    ["Error So Catastrophic It's Almost Impressive", d => d],
    ["If Failure Had a Face It Would Look Exactly Like You", d => d],
    ["You Did This. Own It. It's Yours.", d => d],
  ],
  "Big Oof": [
    ["Big Oof", d => d],
    ["A Massive L Delivered with Zero Grace", d => d],
    ["That Was Painful to Watch and You Made Us Watch It", d => d],
    ["F in the Chat for Your Pathetic Attempt", d => d],
    ["Fell Off and Hit Every Branch on the Way Down", d => d],
    ["Not Even in the Same Zip Code as Correct", d => d],
    ["Tried It. Flopped It. Deserved It.", d => d],
    ["Your Participation Trophy Is in the Trash", d => d],
    ["Bricked It Completely. As Expected.", d => d],
    ["The Bar Was on the Floor and You Tripped Over It", d => d],
  ],
  "Poof, Gone": [
    ["Poof, Gone", d => d],
    ["It Left. Much Like Your Braincells Did Years Ago.", d => d],
    ["Doesn't Exist. Neither Does Your Competence.", d => d],
    ["Searched Everywhere. Found Nothing. Checked Twice.", d => d],
    ["It Saw You Coming and Vanished on Purpose", d => d],
    ["Evaporated Into the Void Where Your Ideas Come From", d => d],
    ["404: Gone. Like Your Grasp on Reality.", d => d],
    ["Deleted From Existence. We Can Arrange More Deletions.", d => d],
    ["It's Not Here. It Was Never Here. Stop Looking.", d => d],
    ["Ghost. It Ghosted You. Even Objects Are Done With You.", d => d],
  ],
  "Nobody Set This Up": [
    ["Nobody Set This Up", d => d],
    ["An Admin Fumbled the Most Basic Job Imaginable", d => d],
    ["This Feature Is Starving Because Nobody Cared Enough", d => d],
    ["Configuration Abandoned Like Most of Your Good Ideas", d => d],
    ["Setup? The Word Setup Implies Effort. None Was Given.", d => d],
    ["Empty. Hollow. Unconfigured. A Mirror of Your Planning.", d => d],
    ["Someone Had One Job and Rage-Quit Before Starting", d => d],
    ["The Settings Are as Empty as Whoever Runs This Server", d => d],
    ["This Feature Has Never Been Touched. Neither Has Grass.", d => d],
    ["Genuinely Impressive That This Was Left in This State", d => d],
  ],
  "You Took Too Long": [
    ["You Took Too Long", d => d],
    ["It Expired Because You Move at a Geological Timescale", d => d],
    ["Timed Out While You Were Doing Absolutely Nothing", d => d],
    ["The Session Got Tired of Waiting and Filed for Divorce", d => d],
    ["Gone. Because You Are Objectively Too Slow.", d => d],
    ["It Waited. It Suffered. It Left. It's Better Off.", d => d],
    ["You Snooze You Lose. You Snoozed Through the Alarm.", d => d],
    ["Expired Like Your Reaction Time and Your Excuses", d => d],
    ["The Clock Had No Mercy. You Had No Speed.", d => d],
    ["Moved at the Speed of Someone Who Simply Doesn't Try", d => d],
  ],
  "Double Tap Detected": [
    ["Double Tap Detected", d => d],
    ["Already Did This. Your Memory Is as Short as Your Focus.", d => d],
    ["Added Twice Because Looking Before Clicking Is Hard for You", d => d],
    ["Duplicate. Because Checking First Was Too Much to Ask.", d => d],
    ["It's Already There. Open Your Eyes. Use Them.", d => d],
    ["Do You Even Read Before You Submit? Clearly Not.", d => d],
    ["This Already Exists. Just Like Your Last 10 Mistakes.", d => d],
    ["Deja Vu Because You're Running the Same Play Twice", d => d],
    ["It's There. It's Been There. You're Just Not Paying Attention.", d => d],
  ],
  "Called Dibs Already": [
    ["Called Dibs Already", d => d],
    ["Someone Else Won While You Were Still Thinking", d => d],
    ["Claimed. Taken. Gone. You Were Simply Too Slow.", d => d],
    ["First Come First Served. You Came Last. As Usual.", d => d],
    ["Already Snatched by Someone Who Actually Moved Fast", d => d],
    ["This Belongs to Someone Else Now. Process That.", d => d],
    ["Too Slow. Chronically, Permanently, Historically Too Slow.", d => d],
    ["Taken. It Will Never Be Yours. Cope Accordingly.", d => d],
    ["Occupied. Go Find Your Own. If You're Capable.", d => d],
  ],
  "Woah There, Slow Down": [
    ["Woah There, Slow Down", d => d],
    ["You Hit the Cap Because You Have No Self-Control", d => d],
    ["Maxed Out. Congrats on Being Efficiently Excessive.", d => d],
    ["Full. Like Your Ego. Unlike Your Common Sense.", d => d],
    ["The Limit Exists. You Found It. Now Respect It.", d => d],
    ["No More Room. Zero. Zilch. Touch Grass and Reflect.", d => d],
    ["You've Done Enough Damage. Please Stop Immediately.", d => d],
    ["Congrats on Hitting the Ceiling. There's No Going Up.", d => d],
    ["Overfilled It. As Expected from Someone Like You.", d => d],
    ["The Cap Said Stop. You Didn't Listen. Here We Are.", d => d],
  ],
  "That's Not a Thing": [
    ["That's Not a Thing", d => d],
    ["What in the Actual World Did You Just Type", d => d],
    ["That Input Is a Crime Against Readable Text", d => d],
    ["Invalid. Incomprehensible. A Cry for Help.", d => d],
    ["Where Did You Even Learn to Type Like This", d => d],
    ["Not a Command. Not a Word. Not Anything Coherent.", d => d],
    ["The Bot Stared at This and Reconsidered Its Existence", d => d],
    ["Please Be Normal. We Are Begging. Actually Begging.", d => d],
    ["Gibberish. Pure Unfiltered Gibberish. Signed, Everyone.", d => d],
    ["Genuinely No Idea What You Were Attempting. Neither Do You.", d => d],
    ["This Gave the Bot a Headache and It Doesn't Even Have a Head", d => d],
  ],
  "It's Over, Anakin": [
    ["It's Over, Anakin", d => d],
    ["Finished. Done. You Showed Up to an Empty Stage.", d => d],
    ["Already Over Before You Even Figured Out What Was Happening", d => d],
    ["It's Dead, Jim. You Made It Worse Just by Being Here.", d => d],
    ["You Arrived to the Party. The Party Left Yesterday.", d => d],
    ["Concluded. Wrapped. Buried. You Missed All of It.", d => d],
    ["You're Always Late. It's Always Over. See the Pattern?", d => d],
    ["Too Late. This Ended Without You. Like Most Things Do.", d => d],
    ["The Room Was Empty When You Got There. Story of Your Life.", d => d],
  ],
  "DMs Locked Tighter Than Fort Knox": [
    ["DMs Locked Tighter Than Fort Knox", d => d],
    ["Their DMs Are in Witness Protection Specifically from You", d => d],
    ["Message Bounced Back. Even Inboxes Have Taste.", d => d],
    ["DMs Sealed. They Saw You Coming and Fortified.", d => d],
    ["They Don't Want to Hear from You. Neither Does Anyone Else.", d => d],
    ["Couldn't Get In. Locked, Bolted, Barricaded, Archived.", d => d],
    ["DM Failed. They've Blocked Existence Itself.", d => d],
    ["Their Inbox Is a No-Fly Zone and You're the Reason Why", d => d],
    ["The Message Died en Route. A Mercy, Honestly.", d => d],
  ],
  "Already Set, Genius": [
    ["Already Set, Genius", d => d],
    ["Something's Already Sitting There. Shocking, I Know.", d => d],
    ["Spot Taken. Remove It First. Or Pay for More.", d => d],
    ["This Was Already Configured. By Someone Less Reckless.", d => d],
    ["Set. Already Set. Was Set Before You Showed Up.", d => d],
    ["It's Not Empty. It Was Never Empty. Look Before You Type.", d => d],
    ["Occupied Territory. You Can't Just Annex It.", d => d],
    ["There's Already One There. Wild Concept: Check First.", d => d],
    ["Did You Think It Was Empty? It Wasn't. It Hasn't Been.", d => d],
    ["Configured. Already Configured. Will Remain Configured.", d => d],
    ["Someone Already Did This. You're Just Late to the Party.", d => d],
    ["Not Empty. Remove Before You Replace. That's How It Works.", d => d],
  ],
  "Already Enabled": [
    ["Already Enabled", d => d],
    ["It's Already On. Reading Is Hard, Isn't It.", d => d],
    ["Enabled Since Before You Even Thought to Ask", d => d],
    ["It Was Already Running. You Just Weren't Paying Attention.", d => d],
    ["Did You Check Before Clicking? No. The Answer Is No.", d => d],
    ["On. It's Been On. It Will Stay On. You're Welcome.", d => d],
    ["Active. Has Been Active. Will Continue to Be Active Without Your Help.", d => d],
    ["Checked. It's Already There. Maybe Check Next Time.", d => d],
    ["Running Fine. It Was Running Fine Before You Showed Up Too.", d => d],
    ["Enabled Before You Got Here. Nothing to See. Move Along.", d => d],
  ],
  "Already Disabled": [
    ["Already Disabled", d => d],
    ["It's Already Off. Try Opening Your Eyes Before Clicking.", d => d],
    ["Disabled Since Before You Decided to Get Involved", d => d],
    ["It Was Already Off. You Just Like Pressing Buttons.", d => d],
    ["Off. Has Been Off. Will Stay Off Without Your Interference.", d => d],
    ["Turned Off Before You Even Got Here. Nothing Changed. Move On.", d => d],
    ["Dead and Gone. It Was Already Dead When You Arrived.", d => d],
    ["Inactive. Confirmed Inactive. Redundantly Confirmed Now.", d => d],
    ["Not Running. Was Not Running. Still Not Running. You Did Nothing.", d => d],
    ["Disabled. The Word Disabled. Read It. Absorb It. Leave It Alone.", d => d],
  ],
};

function pickFunnyError(title, description) {
  const pool = SAVAGE_ROAST_POOL[title];
  if (pool?.length) {
    const [pickedTitle] = pool[Math.floor(Math.random() * pool.length)];
    return { title: pickedTitle, description };
  }
  const genericTitles = [
    "There You Go, Try Not to Break It",
    "Done. Miracles Do Happen.",
    "The Bot Did Your Job Again",
    "Handled. You Can Stop Clicking Now.",
    "Fixed Before You Could Make It Worse",
  ];
  return {
    title: genericTitles[Math.floor(Math.random() * genericTitles.length)],
    description,
  };
}

const SUCCESS_ROAST_POOL = [
  "Done. Flawlessly. Unlike Most Things You Do.",
  "Activated. Try Not to Break It Immediately.",
  "Enabled. You Actually Did Something Right for Once.",
  "It\'s On. Don\'t Touch Anything Else.",
  "Live and Running. Impressed. Genuinely Surprised.",
  "Turned On. Please Don\'t Ruin This One.",
  "Operational. You\'re Welcome. You Really Are.",
  "Locked In. Go Touch Grass, You Earned It.",
  "Set Up. The Bot Is Doing All the Work as Usual.",
  "Running. You Just Had to Press a Button. Good Job.",
  "Switched On. The Bar Was Low. You Cleared It.",
  "Active. Try to Keep It That Way This Time.",
  "Confirmed. Server Getting a Little Better Today.",
  "Done. We\'re as Shocked as You Are.",
  "Enabled. Season It With Patience and Don\'t Mess It Up.",
];

function pickFunnySuccess() {
  return SUCCESS_ROAST_POOL[Math.floor(Math.random() * SUCCESS_ROAST_POOL.length)];
}

// 

/**
 * Tracks embeds/containers flagged for auto-deletion (30 s after reply).
 * messageCreate.js and interactionCreate.js check .has(c) on every reply payload.
 */
if (typeof _autoDeletePayloads === "undefined") var _autoDeletePayloads = new Set();

function createErrorEmbed(title, description, guildId = null) {
  const embed = createEmbed({
    title: `${EMOJIS.soezy_error} ${bold(title || "Error")}`,
    description,
    color: typeof getErrorColor === "function" ? getErrorColor() : resolveThemeColor(null, guildId),
    guildId,
  });
  _autoDeletePayloads.add(embed);
  return embed;
}

function createInfoEmbed(title, description, fields = [], guildId = null) {
  const embed = createEmbed({
    title: `${EMOJIS.soezy_info} ${bold(title)}`,
    description: description,
    fields: fields,
    guildId,
  });
  _autoDeletePayloads.add(embed);
  return embed;
}

function createWarningEmbed(title, description, guildId = null) {
  const embed = createEmbed({
    title: `${EMOJIS.soezy_warning} ${bold(title)}`,
    description: description,
    color: typeof getWarningColor === "function" ? getWarningColor() : resolveThemeColor(null, guildId),
    guildId,
  });
  _autoDeletePayloads.add(embed);
  return embed;
}

/* ================= CONTAINER REPLY HELPERS (AFK-style Components V2) ================= */
// Type icons per response kind
const C2_ICON = {
  success: getEmoji("soezy_success"),
  error: getEmoji("soezy_error"),
  warning: getEmoji("soezy_warning"),
  info: getEmoji("soezy_info"),
};
const C2_COLOR = {
  success: getSuccessColor(),
  error: getErrorColor(),
  warning: getWarningColor(),
  info: getThemeColor(null),
};

/**
 * Warning shown when a channel/role/user is already set and the user tries to overwrite it.
 * Roasts them, shows the current value, and offers remove or premium upsell.
 *
 * @param {string} currentMention  - Already-set value shown in the warning (e.g. `<#123>`, `<@&456>`)
 * @param {string} removeCmd       - Full remove command (e.g. `${PREFIX}welcome removechannel`)
 * @param {string} label           - "channel" | "role" | "user"
 * @param {string} multipleLabel   - plural label for premium upsell (e.g. "channels", "roles")
 * @param {string} [premCmd]       - Optional premium command hint (default: `/premium`)
 */
function createAlreadySetContainer(currentMention, removeCmd, label = "channel", multipleLabel = "channels", premCmd = "/premium") {
  const { title } = pickFunnyError("Already Set, Genius", "");
  const ARR = getEmoji("black_dot");
  if (!premCmd) {
    const description =
      `${ARR} **Current ${label.charAt(0).toUpperCase() + label.slice(1)}:** ${currentMention}\n\n` +
      `-# ${getEmoji("soezy_error")} Remove it first: \`${removeCmd}\``;
    const c = buildReplyContainer("warning", title, description);
    _autoDeletePayloads.add(c);
    return c;
  }
  const description =
    `${ARR} **Current ${label.charAt(0).toUpperCase() + label.slice(1)}:** ${currentMention}\n\n` +
    `-# ${getEmoji("soezy_error")} Remove it first: \`${removeCmd}\`\n` +
    `-# ${getEmoji("soezy_success")} Or upgrade to **Premium** to set multiple ${multipleLabel} → \`${premCmd}\``;
  const c = buildReplyContainer("warning", title, description);
  _autoDeletePayloads.add(c);
  return c;
}


/**
 * @param {"success"|"error"|"warning"|"info"} type
 * @param {string} title
 * @param {string} description - plain text; lines with "\n\n" become separate blocks
 * @param {{name,value,inline?}[]} [fields]
 * @param {string} [thumbnail] - URL
 */
function buildReplyContainer(type, title, description, fields = [], thumbnail = null) {
  const container = new ContainerBuilder();
  if (type === "success" || type === "error") {
    const isDisabled = /\b(disabled?|off)\b/i.test(String(title || ""));
    const messageEmoji = type === "error" || isDisabled
      ? "<:scross:1559257945030525110>"
      : "<:tick:1559236522711187577>";
    const content = require("./utils/statusRoasts").formatStatusReply(type, title, description, messageEmoji);
    return container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content)
    );
  }
  const titleEmoji = {
    success: '<:ok:1500971034575241236>',
    error: '<:no:1500970979273343027>',
  }[type] || '';

  // Strip any leading custom or unicode emoji from title to prevent double-emoji
  const cleanTitle = String(title || "Notice")
    .replace(/^#{1,6}\s*/, '')
    .replace(/^(\s*(<a?:[^:>]+:\d+>|[\p{Emoji_Presentation}\p{Extended_Pictographic}])\s*)+/u, '')
    .replace(/\*\*/g, '')
    .trim();
  const headerText = `### ${titleEmoji ? `${titleEmoji} ` : ''}${cleanTitle || "Notice"}`;

  // ── Header (section with optional thumbnail) ──────────────────────────────
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

  if (description) {
    // Keep the status layout consistent with music replies:
    // a distinct title, a divider, then a clearly quoted message.
    const messageEmoji = {
      // Match the music response convention: status in the title,
      // tick/cross in the message body.
      success: '<:tick:1559236522711187577>',
      error: '<:scross:1559257945030525110>',
    }[type] || '';
    const message = require("./utils/statusRoasts").roastStatusMessage(type, title, description).trim().replace(/^>\s?/gm, '');
    const bodyLines = message
      .split('\n')
      .map((line, index) => `> ${index === 0 && messageEmoji ? `${messageEmoji} ` : ''}${line}`)
      .join('\n');

    container.addSeparatorComponents(separator =>
      separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(bodyLines)
    );
  }

  // ── Optional extra fields ─────────────────────────────────────────────────
  if (fields && fields.length > 0) {
    const fieldLines = fields.map(f => `> ${String(f.name || "").replace(/\*\*/g, "").trim()}: ${f.value}`).join('\n');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fieldLines));
  }

  return container;
}
function createSuccessContainer(title, description, fields = [], thumbnail = null) {
  return buildReplyContainer('success', title, description, fields, thumbnail);
}
function createErrorContainer(title, description) {
  const c = buildReplyContainer('error', title, description);
  _autoDeletePayloads.add(c);
  return c;
}
function createWarningContainer(title, description) {
  const c = buildReplyContainer('warning', title, `${description}\n\n${pickFunnySuccess()}`);
  _autoDeletePayloads.add(c);
  return c;
}

/**
 * Wraps a raw createEmbed-style options object into a ContainerBuilder.
 * Used for list/display embeds that have title + description.
 */
function buildRawInfoContainer(opts) {
  const title = opts.title || '';
  const desc = opts.description || '';
  const container = new ContainerBuilder();
  if (title) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${title}`));
  }
  if (desc) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(desc));
  return container;
}


/**
 * Wraps a pre-built EmbedBuilder into a ContainerBuilder so it can be
 * sent with IsComponentsV2.
 *
 * Preserves: author, title, description, thumbnail, fields, image, footer.
 * Visual parity is maintained for log embeds, media logs, automod warnings, etc.
 */
function wrapEmbedAsContainer(embed) {
  const data = embed.toJSON ? embed.toJSON() : embed;
  const container = new ContainerBuilder();
  if (Number.isInteger(data.color) && typeof container.setAccentColor === "function") {
    container.setAccentColor(data.color);
  }
  // -- Author line (shown as subtext above title) --------------------------
  if (data.author?.name) {
    if (isValidUrl(data.author.icon_url)) {
      container.addSectionComponents(section => section
        .addTextDisplayComponents(t => t.setContent(`-# ${data.author.name}`))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(data.author.icon_url)));
    } else {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${data.author.name}`));
    }
  }

  // -- Title/description with thumbnail (section component) ----------------
  const hasThumb = isValidUrl(data.thumbnail?.url);
  const cleanEmbedTitle = String(data.title || "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/\*\*/g, "")
    .trim();
  const embedHeaderText = cleanEmbedTitle ? `### ${cleanEmbedTitle}` : "";
  if (data.title && hasThumb) {
    container.addSectionComponents(sec =>
      sec
        .addTextDisplayComponents(t => t.setContent(embedHeaderText))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(data.thumbnail.url))
    );
  } else if (data.title) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(embedHeaderText)
    );
  } else if (hasThumb && data.description) {
    container.addSectionComponents(sec =>
      sec
        .addTextDisplayComponents(t => t.setContent(data.description))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(data.thumbnail.url))
    );
  }

  // -- Separator -----------------------------------------------------------
  // -- Description ---------------------------------------------------------
  if (data.description && (data.title || !hasThumb)) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(data.description)
    );
  }

  // -- Fields --------------------------------------------------------------
  if (data.fields && data.fields.length) {
    const fieldLines = data.fields.map(f =>
      `> **${String(f.name || "").replace(/\*\*/g, "").trim()}:** ${f.value}`
    ).join('\n');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fieldLines));
  }

  // -- Large image (below fields) ------------------------------------------
  if (isValidUrl(data.image?.url)) {
    container.addMediaGalleryComponents(gallery =>
      gallery.addItems(item => item.setURL(data.image.url))
    );
  }

  // -- Footer --------------------------------------------------------------
  if (data.footer?.text) {
    if (isValidUrl(data.footer.icon_url)) {
      container.addSectionComponents(section => section
        .addTextDisplayComponents(t => t.setContent(`-# ${data.footer.text}`))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(data.footer.icon_url)));
    } else {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${data.footer.text}`));
    }
  }

  return container;
}

function createInfoContainer(title, description, fields = [], thumbnail = null) {
  const picked = pickFunnyError(title, description);
  const c = buildReplyContainer('info', picked.title, `${description}\n\n${pickFunnySuccess()}`, fields, thumbnail);
  _autoDeletePayloads.add(c);
  return c;
}

/**
 * Dedicated container for "already enabled" / "already disabled" replies.
 * The status is always explicit in the header; the supplied message can still
 * carry the feature-specific roast underneath it.
 * Auto-deletes after 30s like error containers.
 */
function createAlreadyContainer(title, description, fields = [], thumbnail = null) {
  const stateText = `${title || ""} ${description || ""}`.toLowerCase();
  const isDisabled = /\b(disabled|off|down|dead|unfiltered|silent|unlogged|broke|empty)\b/.test(stateText);
  const messageEmoji = isDisabled
    ? '<:scross:1559257945030525110>'
    : '<:tick:1559236522711187577>';
  const content = require("./utils/statusRoasts").formatStatusReply(
    "success", isDisabled ? "Already Disabled" : "Already Enabled", description, messageEmoji
  );
  const c = new ContainerBuilder().addTextDisplayComponents(text =>
    text.setContent(content)
  );
  _autoDeletePayloads.add(c);
  return c;
}


/* ================= COMPONENTS V2 SANITIZERS & CHANNEL PATCHERS ================= */

/**
 * Returns true when the flags value includes MessageFlags.IsComponentsV2 (1 << 15 = 32768).
 */
function hasComponentsV2Flag(flags) {
  if (!flags && flags !== 0) return false;
  const f = typeof flags === 'bigint' ? Number(flags) : (flags | 0);
  return (f & MessageFlags.IsComponentsV2) === MessageFlags.IsComponentsV2;
}

/** Returns true when the flags value includes the ephemeral bit (1 << 6 = 64). */
function hasEphemeralFlag(flags) {
  if (!flags && flags !== 0) return false;
  const f = typeof flags === 'bigint' ? Number(flags) : (flags | 0);
  return (f & 64) === 64;
}

/** Return a shallow-cloned payload with the ephemeral bit (64) stripped from flags. */
function stripEphemeralFromPayload(payload) {
  if (!payload) return payload;
  if (!hasEphemeralFlag(payload.flags)) return payload;
  const newFlags = (payload.flags | 0) & ~64;
  return { ...payload, flags: newFlags || undefined };
}

/**
 * Basic sanitizer – removes legacy fields from a payload that has
 * MessageFlags.IsComponentsV2 set.  Does NOT convert content/embeds;
 * use normalizeComponentsV2Payload() for the smart converting version.
 *
 * Required by spec (kept as the "simple delete" variant).
 */
function sanitizeComponentsV2Payload(payload) {
  if (!payload) return payload;
  if (!hasComponentsV2Flag(payload.flags)) return payload;
  const out = { ...payload };
  delete out.content;
  delete out.embeds;
  delete out.stickers;
  delete out.poll;
  return out;
}

/**
 * Smart normalizer – converts legacy fields to V2 containers instead of
 * deleting them so visual content is preserved.
 *
 * Rules (only applied when IsComponentsV2 flag is present):
 *  - embeds[]    → each EmbedBuilder is wrapped via wrapEmbedAsContainer()
 *                  and appended to components[]
 *  - content     → placed in a TextDisplayBuilder container, prepended to components[]
 *  - stickers    → removed (no V2 equivalent)
 *  - poll        → removed (no V2 equivalent)
 *
 * Payloads WITHOUT IsComponentsV2 pass through unchanged.
 */
function normalizeComponentsV2Payload(payload) {
  if (!payload) return payload;
  if (!hasComponentsV2Flag(payload.flags)) return payload;

  const out = { ...payload };
  let extra = [];

  // Convert embeds → containers
  if (out.embeds && out.embeds.length > 0) {
    const embedContainers = out.embeds
      .filter(Boolean)
      .map(e => {
        // Accept both EmbedBuilder instances and raw JSON embed objects
        try {
          return (e && typeof e.toJSON === 'function') ? wrapEmbedAsContainer(e) : wrapEmbedAsContainer(new EmbedBuilder(e));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    extra = extra.concat(embedContainers);
    delete out.embeds;
  }

  // Convert content → TextDisplay container (prepend so it appears first)
  if (out.content !== undefined && out.content !== null && out.content !== '') {
    const textContainer = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(String(out.content)));
    extra = [textContainer, ...extra];
    delete out.content;
  }

  // Remove fields that are outright incompatible with V2
  delete out.stickers;
  delete out.poll;

  if (extra.length > 0) {
    out.components = [...extra, ...(out.components || [])];
  }

  // Ensure components is always an array when V2 flag is present
  if (!out.components) out.components = [];
  out.components = out.components.map(require("./utils/configPanelLayout").trimConfigDropdownFooter);

  return out;
}

/* ─── Channel / message patching helpers ─────────────────────────────────────
 * These are called from messageCreate.js and interactionCreate.js to intercept
 * channel.send() and message.edit() calls so that any payload containing
 * IsComponentsV2 is automatically normalised before hitting the Discord API.
 *
 * A WeakMap guards against double-patching the same object.
 */
const _patchedSendTargets  = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
const _patchedEditTargets  = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
const _patchedGuildTargets = typeof WeakSet !== 'undefined' ? new WeakSet() : null;

/**
 * Patch a single channel's .send() method so every payload is run through
 * normalizeComponentsV2Payload before being dispatched.
 */
function patchMessageSendTarget(channel) {
  if (!channel || !channel.send) return;
  if (_patchedSendTargets && _patchedSendTargets.has(channel)) return;
  if (_patchedSendTargets) _patchedSendTargets.add(channel);

  const _origSend = channel.send.bind(channel);
  channel.send = async function (payload) {
    return _origSend(normalizeComponentsV2Payload(payload));
  };
}

/**
 * Patch a single message's .edit() method so every payload is run through
 * normalizeComponentsV2Payload before being dispatched.
 */
function patchMessageEditTarget(message) {
  if (!message || !message.edit) return;
  if (_patchedEditTargets && _patchedEditTargets.has(message)) return;
  if (_patchedEditTargets) _patchedEditTargets.add(message);

  const _origEdit = message.edit.bind(message);
  message.edit = async function (payload) {
    return _origEdit(normalizeComponentsV2Payload(payload));
  };
}

/**
 * Patch all text-based channels in a guild.
 * Called once per messageCreate / interactionCreate to ensure every channel
 * the bot might write to is already patched.
 */
function patchGuildMessageTargets(guild) {
  if (!guild || !guild.channels) return;
  if (_patchedGuildTargets && _patchedGuildTargets.has(guild)) return;
  if (_patchedGuildTargets) _patchedGuildTargets.add(guild);

  try {
    guild.channels.cache.forEach(channel => {
      if (channel && channel.isTextBased && channel.isTextBased()) {
        patchMessageSendTarget(channel);
      }
    });
  } catch { /* never crash the event handler */ }
}
