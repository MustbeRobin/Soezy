/* ================= HELP, MUSIC, AND SYSTEM EMBEDS ================= */

/* ================= ALL COMMANDS LIST ================= */

function statusEmoji(group, name, fallback = name) {
  return STATUS?.[group]?.[name] || STATUS?.[name] || getEmoji(fallback);
}

function featureEmoji(name, fallback = name) {
  return statusEmoji("Feature", name, fallback);
}

function actionEmoji(name, fallback = name) {
  return statusEmoji("Action", name, fallback);
}

const ALL_COMMANDS = {
  // Moderation Commands
  moderation: {
    emoji: featureEmoji("moderation"),
    name: "Moderation",
    description: "Server moderation commands",
    commands: [
      { name: "casehistory", description: "View moderation case history for a user", usage: "casehistory <@user>", aliases: ["cases"] },
      { name: "modstats", description: "View server or moderator statistics", usage: "modstats [@moderator]", aliases: [] },
      { name: "send message", description: "Send a message through the bot (administrators only)", usage: "send message <text>", aliases: [] },
      { name: "send image", description: "Send an image through the bot (administrators only)", usage: "send image <url>", aliases: [] },
      { name: "extraowner add", description: "Bot owner only: delegate protected-system access in this server", usage: "extraowner add @user", aliases: ["eo add"] },
      { name: "extraowner remove", description: "Bot owner only: revoke protected-system access", usage: "extraowner remove @user", aliases: ["eo remove"] },
      { name: "extraowner edit", description: "Bot owner only: replace a server ExtraOwner", usage: "extraowner edit @old @new", aliases: ["eo edit"] },
      { name: "extraowner list", description: "Bot owner only: list this server's ExtraOwners", usage: "extraowner list", aliases: ["eo list"] },
      { name: "ban", description: "Ban a user", usage: "ban <@user> [reason]", aliases: [] },
      { name: "unban", description: "Unban a user", usage: "unban <userID> [reason]", aliases: [] },
      { name: "kick", description: "Kick a user", usage: "kick <@user> [reason]", aliases: [] },
      { name: "mute", description: "Mute a user", usage: "mute <@user> <duration> [reason]", aliases: ["timeout"] },
      { name: "unmute", description: "Unmute a user", usage: "unmute <@user> [reason]", aliases: ["untimeout"] },
      { name: "warn", description: "Warn a user", usage: "warn <@user> [reason]", aliases: [] },
      { name: "warnings", description: "View warnings", usage: "warnings [@user]", aliases: ["warns", "infractions"] },
      { name: "clearwarns", description: "Clear all warnings for a user", usage: "clearwarns <@user>", aliases: ["clearwarnings", "delwarns"] },
      { name: "removewarn", description: "Remove a specific warning by ID", usage: "removewarn <@user> <warnID>", aliases: ["delwarn", "unwarn"] },
      { name: "purge", description: "Delete messages", usage: "purge <amount> [@user]", aliases: ["clear", "prune"] },
      { name: "purge images", description: "Delete only images", usage: "purge images <amount>", aliases: [] },
      { name: "purge bots", description: "Delete bot messages", usage: "purge bots <amount>", aliases: [] },
      { name: "purge embeds", description: "Delete embeds", usage: "purge embeds <amount>", aliases: [] },
      { name: "purge links", description: "Delete links", usage: "purge links <amount>", aliases: [] },
      { name: "vcclean", description: "Delete VC chat, images, or all messages", usage: "vcclean [#vc|all] [delay] [limit] [chat|images]", aliases: [] },
      { name: "spoiler", description: "Post a tagged-user-only spoiler with a private reveal button", usage: "spoiler <user> <message> [attachment]", aliases: [] },
      { name: "autojail", description: "Configure and manage automatic jailing", usage: "autojail config|enable|disable|status|remove", aliases: ["setup-auto-jail", "saj", "disable-auto-jail", "daj", "auto-jail-status", "ajs"] },
      { name: "infect", description: "Send a Safe or Mute choice to a user", usage: "infect @user | infect config", aliases: [] },
      { name: "cuc", description: "Clear a user's recent messages across all channels", usage: "cuc <@user> [limit]", aliases: ["clearuserchannel", "clear user channel"] },
      { name: "cl", description: "Clear text only (no media)", usage: "cl <amount>", aliases: [] },
      { name: "lock", description: "Lock a channel", usage: "lock [#channel] [reason]", aliases: [] },
      { name: "unlock", description: "Unlock a channel", usage: "unlock [#channel] [reason]", aliases: [] },
      { name: "slowmode", description: "Set slowmode", usage: "slowmode <duration/off>", aliases: ["slow"] },
      { name: "nuke", description: "Nuke and recreate channel", usage: "nuke [reason]", aliases: [] },
      { name: "delete category", description: "Delete every channel in a category, then the category itself", usage: "delete category <name or ID>", aliases: [] },
      { name: "fban", description: "Fake ban (no actual ban)", usage: "fban <@user> [reason]", aliases: ["fakeban"] },
      { name: "fkick", description: "Fake kick (no actual kick)", usage: "fkick <@user> [reason]", aliases: ["fakekick"] },
      { name: "fmute", description: "Fake mute (no actual mute)", usage: "fmute <@user> [duration] [reason]", aliases: ["fakemute"] },
      { name: "snipe", description: "View a deleted message from the last 24 hours", usage: "snipe [#channel] [number]", aliases: ["s"] },
      { name: "snipe channel", description: "View deleted messages in a specific channel", usage: "snipe channel #channel", aliases: [] },
      { name: "snipeall", description: "View deleted messages from the last 24 hours", usage: "snipeall", aliases: ["sall", "snipes"] },
      { name: "editsnipe", description: "View last edited message", usage: "editsnipe [number]", aliases: ["esnipe", "es"] },
      { name: "editsnipeall", description: "View all edit snipes", usage: "editsnipeall", aliases: ["esall", "editsnipes"] },
      { name: "clearsnipe", description: "Clear all snipe data", usage: "clearsnipe", aliases: ["snipeclear"] },
      { name: "hide", description: "Hide a channel from @everyone (removes ViewChannel)", usage: "hide [#channel] [reason]", aliases: [] },
      { name: "unhide", description: "Unhide a channel – restore @everyone view access", usage: "unhide [#channel] [reason]", aliases: [] }
    ]
  },

  // Antinuke Commands
  antinuke: {
    emoji: featureEmoji("antinuke"),
    name: "Anti-Nuke",
    description: "Server protection commands",
    commands: [
      { name: "antinuke snapshot", description: "Take a snapshot of channels & roles", usage: "antinuke snapshot", aliases: [] },
      { name: "antinuke restore", description: "Restore from snapshot", usage: "antinuke restore [channels/roles/members/perms/webhooks/settings/all]", aliases: [] },
      { name: "antinuke autorestore", description: "Toggle auto-restore on nuke detection", usage: "antinuke autorestore <on/off>", aliases: [] },
      //  Anti-Raid 
      { name: "antiraid enable", description: "Create or reuse the X RAID whitelist role, then enable anti-raid mode", usage: "antiraid enable", aliases: ["raidmode enable"] },
      { name: "antiraid disable", description: "Disable anti-raid mode", usage: "antiraid disable", aliases: ["raidmode disable"] },
      { name: "antiraid setthreshold", description: "Set join count to trigger raid lockdown", usage: "antiraid setthreshold <number>", aliases: [] },
      { name: "antiraid setinterval", description: "Set detection window in seconds", usage: "antiraid setinterval <seconds>", aliases: [] },
      { name: "antiraid setaction", description: "Set action on raid members", usage: "antiraid setaction <kick/ban>", aliases: [] },
      { name: "antiraid setchannel", description: "Set anti-raid log channel", usage: "antiraid setchannel #channel", aliases: ["antiraid setlogs"] },
      //  Verify 
      { name: "verify config", description: "Open the verification settings dropdown", usage: "verify config", aliases: ["verification config"] },
      { name: "verify enable", description: "Create missing verification roles and channels, then enable verification", usage: "verify enable", aliases: ["verification enable"] },
      { name: "verify disable", description: "Disable verification while keeping its roles and channels", usage: "verify disable", aliases: ["verification disable"] },
      //  Warn Escalation 
      { name: "warnpunish enable", description: "Enable auto-punishment on warn thresholds", usage: "warnpunish enable", aliases: ["warnescalate enable"] },
      { name: "warnpunish disable", description: "Disable warn escalation", usage: "warnpunish disable", aliases: ["warnescalate disable"] },
      { name: "warnpunish set", description: "Set punishment at a warn count", usage: "warnpunish set <warns> <mute/kick/ban>", aliases: [] },
      { name: "warnpunish remove", description: "Remove a warn threshold", usage: "warnpunish remove <warns>", aliases: [] },
      //  Mute Evasion 
      { name: "muteevasion enable", description: "Enable mute evasion detection", usage: "muteevasion enable", aliases: ["antievasion enable"] },
      { name: "muteevasion disable", description: "Disable mute evasion detection", usage: "muteevasion disable", aliases: ["antievasion disable"] },
      { name: "muteevasion setlogs", description: "Set mute evasion log channel", usage: "muteevasion setlogs #channel", aliases: [] },
      //  Security (merged from security module) 
      // Master on/off
      { name: "security enable",                       description: "Enable ALL security features at once",                          usage: "security enable",                             aliases: [] },
      { name: "security disable",                      description: "Disable ALL security features at once",                         usage: "security disable",                            aliases: [] },
      { name: "security config",                       description: "Open the interactive security configuration panel",             usage: "security config",                             aliases: ["security settings"] },
      // Config
      { name: "security setcaps <thresh> [minLen]",    description: "Set caps threshold % and optional minimum letter count",        usage: "security setcaps <1-100> [minLen]",           aliases: [] },
      { name: "security setmaxlen <#ch> <num|0>",      description: "Set per-channel max message length (0 to remove limit)",       usage: "security setmaxlen <#channel> <number|0>",    aliases: [] },
      { name: "security setaccountage <days|0>",       description: "Kick accounts newer than X days on join (0 = off)",            usage: "security setaccountage <days>",               aliases: [] },
      { name: "security setlogs security <#ch>",       description: "Set the dedicated security events log channel",                usage: "security setlogs security <#channel>",        aliases: [] },
      { name: "security setlogs forensics <#ch>",      description: "Set the ban-snapshot / forensics log channel",                 usage: "security setlogs forensics <#channel>",       aliases: [] },
      // Lockdown & Role Lock
      { name: "lockdown on",                           description: "Lock server - raises verification level to Highest",            usage: "lockdown on [reason]",                        aliases: ["lockdown enable"] },
      { name: "lockdown off",                          description: "Lift lockdown - resets verification level to None",             usage: "lockdown off [reason]",                       aliases: ["lockdown disable"] },
      { name: "rolelock add @role",                    description: "Freeze a role - any changes auto-reverted by bot",             usage: "rolelock add <@role>",                        aliases: [] },
      { name: "rolelock remove @role",                 description: "Unfreeze a previously locked role",                            usage: "rolelock remove <@role>",                     aliases: [] },
      { name: "rolelock list",                         description: "List all currently locked roles",                              usage: "rolelock list",                               aliases: [] },
      // User Management - accepts @mention, user ID, or username
      { name: "security blacklist @user|ID|name",      description: "Blacklist a user - accepts @mention, user ID, or username",    usage: "security blacklist <@user|ID|name> [reason]", aliases: [] },
      { name: "security unblacklist @user|ID|name",    description: "Remove from blacklist - accepts @mention, user ID, or username",usage: "security unblacklist <@user|ID|name>",       aliases: [] },
      { name: "security violations @user|ID|name",     description: "View violation log - accepts @mention, user ID, or username",  usage: "security violations <@user|ID|name>",         aliases: [] },
      // Misc
      { name: "security unban-wave",                   description: "Review recent bans recorded from a detected ban wave",         usage: "security unban-wave",                         aliases: [] },
      { name: "security help",                         description: "Show the full security status & commands panel",               usage: "security help",                               aliases: ["nightmode", "securityhelp"] },
    ]
  },

  // AutoMod commands; Anti-Bot settings live in the AutoMod configuration panel.
  automod: {
    emoji: featureEmoji("automod"),
    name: "AutoMod",
    description: "Automatic moderation & bot protection commands",
    commands: [
      //  Auto-Mod 
      { name: "automod config", description: "Configure message filters, security protections, and logging", usage: "automod config", aliases: ["automod"] },
      { name: "automod enable", description: "Enable AutoMod protection", usage: "automod enable", aliases: ["am enable", "automode enable"] },
      { name: "automod disable", description: "Disable AutoMod protection", usage: "automod disable", aliases: ["am disable", "automode disable"] },
      { name: "badword", description: "Manage custom words; configure the filter in AutoMod", usage: "badword <add|remove|list|enable|disable>", aliases: ["bw"] },
      { name: "nsfw", description: "Manage custom NSFW words; configure the filter in AutoMod", usage: "nsfw <add|remove|list|enable|disable>", aliases: [] },
      { name: "antimention", description: "Configure native mention blocking", usage: "antimention <enable|disable|status>", aliases: [] },
      { name: "antimention limit", description: "Set the number of mentions allowed before blocking", usage: "antimention limit <1-50>", aliases: [] },
    ]
  },

  // Welcome Commands (includes Goodbye & Join DM)
  welcome: {
    emoji: featureEmoji("welcome"),
    name: "Welcome & Goodbye",
    description: "Welcome, goodbye and join DM message commands",
    commands: [
      //  Welcome 
      { name: "welcome config", description: "Configure welcome channel, style, and message", usage: "welcome config", aliases: ["greet setup"] },
      { name: "welcome enable", description: "Enable welcome", usage: "welcome enable", aliases: [] },
      { name: "welcome disable", description: "Disable welcome", usage: "welcome disable", aliases: [] },
      { name: "welcome setchannel", description: "Set welcome channel", usage: "welcome setchannel <#channel>", aliases: [] },
      { name: "welcome test", description: "Test welcome message", usage: "welcome test", aliases: [] },
      //  Goodbye 
      { name: "goodbye enable", description: "Enable goodbye", usage: "goodbye enable", aliases: [] },
      { name: "goodbye disable", description: "Disable goodbye", usage: "goodbye disable", aliases: [] },
      { name: "goodbye setchannel", description: "Set goodbye channel", usage: "goodbye setchannel <#channel>", aliases: [] },
      { name: "goodbye test", description: "Test goodbye message", usage: "goodbye test", aliases: [] },
      //  Join DM 
      { name: "joindm enable", description: "Enable join DM", usage: "joindm enable", aliases: [] },
      { name: "joindm disable", description: "Disable join DM", usage: "joindm disable", aliases: [] },
      { name: "joindm test", description: "Test join DM", usage: "joindm test", aliases: [] }
    ]
  },

  // Ticket Commands
  ticket: {
    emoji: featureEmoji("ticket"),
    name: "Tickets",
    description: "Ticket system commands",
    commands: [
      { name: "ticket enable", description: "Enable tickets", usage: "ticket enable", aliases: [] },
      { name: "ticket disable", description: "Disable tickets", usage: "ticket disable", aliases: [] },
      { name: "ticket setup", description: "Setup ticket system", usage: "ticket setup <#channel> <#category> <@role>", aliases: [] },
      { name: "ticket setchannel", description: "Set ticket panel channel", usage: "ticket setchannel <#channel>", aliases: [] },
      { name: "ticket setcategory", description: "Set ticket category", usage: "ticket setcategory <#category>", aliases: [] },
      { name: "ticket setrole", description: "Set support role", usage: "ticket setrole <@role>", aliases: [] },
      { name: "ticket setlogs", description: "Set logs channel", usage: "ticket setlogs <#channel>", aliases: [] },
      { name: "ticket send", description: "Send ticket panel", usage: "ticket send", aliases: [] },
      { name: "ticket close", description: "Close current ticket", usage: "ticket close", aliases: [] },
      { name: "ticket add", description: "Add user to ticket", usage: "ticket add <@user>", aliases: [] },
      { name: "ticket remove", description: "Remove user from ticket", usage: "ticket remove <@user>", aliases: [] },
      { name: "ticket transcript", description: "Generate transcript", usage: "ticket transcript", aliases: [] },
      //  New Ticket Features 
      { name: "ticket claim", description: "Claim a ticket as the handling staff member", usage: "ticket claim", aliases: [] },
      { name: "ticket unclaim", description: "Release your claim on a ticket", usage: "ticket unclaim", aliases: [] },
      { name: "ticket rate", description: "Rate your support experience (1–5 stars)", usage: "ticket rate <1-5>", aliases: ["ticket rating"] },
      { name: "ticket template add", description: "Add a ticket type template (e.g. support, report, appeal)", usage: "ticket template add <name> <description>", aliases: [] },
      { name: "ticket template remove", description: "Remove a ticket type template", usage: "ticket template remove <name>", aliases: [] },
      { name: "ticket template list", description: "List all configured ticket templates", usage: "ticket template list", aliases: [] }
    ]
  },

  // Giveaway Commands
  giveaway: {
    emoji: featureEmoji("giveaway"),
    name: "Giveaways",
    description: "Giveaway system commands",
    commands: [
      { name: "giveaway enable", description: "Enable giveaways", usage: "giveaway enable", aliases: ["gw enable"] },
      { name: "giveaway disable", description: "Disable giveaways", usage: "giveaway disable", aliases: ["gw disable"] },
      { name: "giveaway create", description: "Create a giveaway", usage: "giveaway create <duration> <winners> <prize>", aliases: ["gw create", "gcreate", "gstart"] },
      { name: "giveaway end", description: "End a giveaway", usage: "giveaway end <messageID>", aliases: ["gw end", "gend"] },
      { name: "giveaway reroll", description: "Reroll a giveaway", usage: "giveaway reroll <messageID> [winners]", aliases: ["gw reroll", "greroll"] },
      { name: "giveaway cancel", description: "Cancel a giveaway", usage: "giveaway cancel <messageID>", aliases: ["gw cancel", "gcancel"] },
      { name: "giveaway list", description: "List active giveaways", usage: "giveaway list", aliases: ["gw list", "g list"] },
      { name: "gall", description: "List all giveaways (active/ended/cancelled)", usage: "gall [active/ended/cancelled] [page]", aliases: [] },
      //  New Giveaway Features 
      { name: "giveaway requirerole", description: "Set a role required to enter a giveaway", usage: "giveaway requirerole <messageID> <@role>", aliases: ["gw requirerole"] },
      { name: "giveaway winnerdm", description: "Toggle whether winners are DM'd when a giveaway ends", usage: "giveaway winnerdm <on/off>", aliases: ["gw winnerdm"] }
    ]
  },


  // Fun Commands - COMPLETE LIST
  fun: {
    emoji: featureEmoji("fun"),
    name: "Fun",
    description: "Fun commands",
    commands: [
      { name: "fun enable", description: "Enable fun commands", usage: "fun enable", aliases: [] },
      { name: "fun disable", description: "Disable fun commands", usage: "fun disable", aliases: [] },
      { name: "8ball", description: "Ask the magic 8ball", usage: "8ball <question>", aliases: ["eightball", "ask"] },
      { name: "choose", description: "Choose between options", usage: "choose <option1> | <option2> | ...", aliases: ["pick", "decide"] },
      { name: "meme", description: "Get a random meme", usage: "meme", aliases: [] },
      { name: "roast", description: "Lightly roast a user", usage: "roast <@user>", aliases: [] },
      { name: "pickupline", description: "Get a chaotic pickup line", usage: "pickupline", aliases: [] },
      { name: "howgay", description: "Check rainbow energy", usage: "howgay [@user]", aliases: ["gayrate"] },
      { name: "howsimp", description: "Check simp levels", usage: "howsimp [@user]", aliases: ["simprate"] },
      { name: "howhot", description: "Check hotness score", usage: "howhot [@user]", aliases: [] },
      { name: "iq", description: "Generate a very scientific IQ score", usage: "iq [@user]", aliases: [] },
      { name: "howcute", description: "Check cute energy", usage: "howcute [@user]", aliases: ["cuterate"] },
      { name: "howhorny", description: "Check chaotic energy", usage: "howhorny [@user]", aliases: ["hornyrate"] },
      { name: "howlesbian", description: "Check sapphic sparkle", usage: "howlesbian [@user]", aliases: ["lesbianrate"] },
      { name: "howpretty", description: "Check pretty points", usage: "howpretty [@user]", aliases: ["prettyrate"] },
      { name: "howbaby", description: "Check baby energy", usage: "howbaby [@user]", aliases: ["babyrate"] },
      { name: "howcrazy", description: "Check wildness", usage: "howcrazy [@user]", aliases: ["crazyrate"] },
      { name: "howsus", description: "Check suspicion", usage: "howsus [@user]", aliases: ["susrate"] },
      { name: "howugly", description: "Check ugly energy", usage: "howugly [@user]", aliases: ["uglyrate"] },
      { name: "hownigga", description: "Check n-word energy", usage: "hownigga [@user]", aliases: ["niggarate"] },
      { name: "simpcheck", description: "Check simp levels", usage: "simpcheck [@user]", aliases: [] },
      { name: "lovemeter", description: "Measure love compatibility", usage: "lovemeter <@user>", aliases: ["love", "loverate"] },
      { name: "joke", description: "Get a random joke", usage: "joke", aliases: [] },
      { name: "fact", description: "Get a random fact", usage: "fact", aliases: [] },
      { name: "quote", description: "Get a random quote", usage: "quote", aliases: [] },
      { name: "reverse", description: "Reverse text", usage: "reverse <text>", aliases: [] },
      { name: "mock", description: "Mock text", usage: "mock <text>", aliases: [] },
      { name: "ship", description: "Ship two users", usage: "ship <@user1> <@user2>", aliases: ["love", "match"] },
      { name: "rate", description: "Rate something", usage: "rate <thing>", aliases: [] },

      // Roleplay commands with targets
      { name: "hug", description: "Hug someone", usage: "hug <@user>", aliases: [] },
      { name: "horny", description: "Send an anime reaction GIF", usage: "horny [@user]", aliases: [] },
      { name: "kidnap", description: "Send a playful anime reaction GIF", usage: "kidnap [@user]", aliases: [] },
      { name: "blushkiss", description: "Send a blush-kiss reaction", usage: "blushkiss [@user]", aliases: [] },
      { name: "instantkiss", description: "Send an instant kiss reaction", usage: "instantkiss [@user]", aliases: [] },
      { name: "instanthug", description: "Send an instant hug reaction", usage: "instanthug [@user]", aliases: [] },
      { name: "instantslap", description: "Send an instant slap reaction", usage: "instantslap [@user]", aliases: [] },
      { name: "kiss", description: "Kiss someone", usage: "kiss <@user>", aliases: [] },
      { name: "peck", description: "Give someone a cute cheek kiss", usage: "peck <@user>", aliases: [] },
      { name: "pat", description: "Pat someone", usage: "pat <@user>", aliases: ["headpat"] },
      { name: "patpat", description: "Create a pat-pat card using a user's avatar", usage: "patpat <@user>", aliases: [] },
      { name: "image petpet", description: "Create a pet-pet card using a user's avatar", usage: "image petpet <@user>", aliases: ["patpat"] },
      { name: "image giffeffect", description: "Apply a GIF-style effect to an image", usage: "image giffeffect <image/url/@user>", aliases: ["giffeffect"] },
      { name: "image quote", description: "Create a quote card with an avatar", usage: "image quote <@user>", aliases: [] },
      { name: "image deepfry", description: "Deep-fry an image", usage: "image deepfry <image/url/@user>", aliases: ["deepfry"] },
      { name: "image invert", description: "Invert image colors", usage: "image invert <image/url/@user>", aliases: ["invert"] },
      { name: "image reshade", description: "Improve image brightness and color", usage: "image reshade <image/url/@user>", aliases: ["reshade"] },
      { name: "slap", description: "Slap someone", usage: "slap <@user>", aliases: [] },
      { name: "cuddle", description: "Cuddle someone", usage: "cuddle <@user>", aliases: ["snuggle"] },
      { name: "poke", description: "Poke someone", usage: "poke <@user>", aliases: [] },
      { name: "wave", description: "Wave at someone or alone", usage: "wave [@user]", aliases: ["hi"] },
      { name: "bite", description: "Bite someone", usage: "bite <@user>", aliases: [] },
      { name: "highfive", description: "High five someone", usage: "highfive <@user>", aliases: ["hi5"] },
      { name: "bonk", description: "Bonk someone", usage: "bonk <@user>", aliases: [] },
      { name: "yeet", description: "Yeet someone", usage: "yeet <@user>", aliases: [] },
      { name: "bully", description: "Bully someone", usage: "bully <@user>", aliases: [] },
      { name: "torture", description: "Torture someone", usage: "torture <@user>", aliases: [] },
      { name: "punch", description: "Punch someone", usage: "punch <@user>", aliases: [] },
      { name: "kill", description: "Attack someone", usage: "kill <@user>", aliases: [] },
      { name: "wink", description: "Wink at someone or alone", usage: "wink [@user]", aliases: [] },
      { name: "lick", description: "Lick someone", usage: "lick <@user>", aliases: [] },
      { name: "stare", description: "Stare at someone or alone", usage: "stare [@user]", aliases: [] },
      { name: "boop", description: "Boop someone's nose", usage: "boop <@user>", aliases: [] },
      { name: "nom", description: "Nom someone", usage: "nom <@user>", aliases: [] },
      { name: "handhold", description: "Hold someone's hand", usage: "handhold <@user>", aliases: ["holdhands"] },
      { name: "tickle", description: "Tickle someone", usage: "tickle <@user>", aliases: [] },
      { name: "feed", description: "Feed someone", usage: "feed <@user>", aliases: [] },
      { name: "compliment", description: "Send a kind compliment to someone", usage: "compliment <@user>", aliases: ["complimentuser"] },
      { name: "cookie", description: "Give someone a cookie", usage: "cookie <@user>", aliases: [] },
      { name: "extremkiss", description: "EXTREMELY kiss someone", usage: "extremkiss <@user>", aliases: [] },
      { name: "extremhug", description: "EXTREMELY hug someone", usage: "extremhug <@user>", aliases: [] },
      { name: "extremslap", description: "EXTREMELY slap someone", usage: "extremslap <@user>", aliases: [] },
      { name: "fuck", description: "Go absolutely feral on someone", usage: "fuck <@user>", aliases: [] },

      // Self-expression commands (no target needed)
      { name: "cry", description: "Express crying", usage: "cry", aliases: [] },
      { name: "dance", description: "Start dancing", usage: "dance", aliases: [] },
      { name: "angry", description: "Show anger", usage: "angry [@user]", aliases: [] },
      { name: "sleepy", description: "Show sleepiness", usage: "sleepy [@user]", aliases: [] },
      { name: "blush", description: "Show blushing", usage: "blush", aliases: [] },
      { name: "smile", description: "Show a smile", usage: "smile", aliases: [] },
      { name: "pout", description: "Pout at something", usage: "pout", aliases: [] },
      { name: "laugh", description: "Start laughing", usage: "laugh", aliases: ["lol"] },
      { name: "confused", description: "Express confusion", usage: "confused", aliases: ["huh"] },
      { name: "sleep", description: "Go to sleep", usage: "sleep", aliases: ["zzz"] },
      { name: "run", description: "Run away", usage: "run", aliases: [] },
      { name: "thumbsup", description: "Give a thumbs up", usage: "thumbsup", aliases: ["thumbs"] },
      { name: "facepalm", description: "Facepalm at something", usage: "facepalm", aliases: ["fp"] },
      { name: "shrug", description: "Shrug at something", usage: "shrug", aliases: [] },
      { name: "tictactoe", description: "Challenge someone to Tic Tac Toe", usage: "tictactoe <@user>", aliases: ["ttt"] },
      { name: "connect4", description: "Challenge someone to Connect 4", usage: "connect4 <@user>", aliases: ["c4"] },
      { name: "hint", description: "Get a hint for your active Wordle or Hangman game", usage: "hint", aliases: [] },
      //  New Games 
      { name: "fasttype", description: "Race to type the shown word within 15 seconds", usage: "fasttype", aliases: [] },
      { name: "numberguess", description: "Start a channel number guessing game", usage: "numberguess", aliases: ["guessnumber", "ng"] },
      { name: "scramble", description: "Unscramble a jumbled word – first to type it wins", usage: "scramble", aliases: [] },
      { name: "wordchain", description: "Word chain – each word must start with the last letter of the previous", usage: "wordchain", aliases: ["wc"] },
    ]
  },


  // (emojisticker merged into general)

  // Autoresponder Commands
  //  Auto Respond & Auto React (merged) 
  autoresponder: {
    emoji: featureEmoji("autorespond"),
    name: "Auto Respond & React",
    description: "Auto responder and auto react commands",
    commands: [
      //  Auto Responder 
      { name: "autoresponder add", description: "Add autoresponder", usage: "autoresponder add <trigger> | <response>", aliases: ["aresponder add"] },
      { name: "autoresponder remove", description: "Remove autoresponder", usage: "autoresponder remove <trigger>", aliases: ["aresponder remove", "aresponder delete"] },
      { name: "autoresponder list", description: "List autoresponders", usage: "autoresponder list", aliases: ["aresponder list"] },
      { name: "autoresponder clear", description: "Clear all autoresponders", usage: "autoresponder clear", aliases: ["aresponder clear"] },
      //  Auto React 
      { name: "autoreact add", description: "Add autoreact", usage: "autoreact add <trigger> <emoji1> [emoji2] ...", aliases: [] },
      { name: "autoreact remove", description: "Remove autoreact", usage: "autoreact remove <trigger>", aliases: ["autoreact delete"] },
      { name: "autoreact list", description: "List autoreacts", usage: "autoreact list", aliases: [] },
      { name: "autoreact clear", description: "Clear all autoreacts", usage: "autoreact clear", aliases: [] }
    ]
  },

  // Autoreact Commands

  // Sticky Commands

  // Logging Commands
  logging: {
    emoji: featureEmoji("logging"),
    name: "Logging",
    description: "Configure and manage server logging",
    commands: [
      { name: "logging config", description: "Configure logging, channels, and ignored content", usage: "logging config", aliases: [] }
    ]
  },

  // Invites Commands

  // JoinDM Commands

  // Voice Commands (Temp Voice & Voice Controls)
  voice: {
    emoji: featureEmoji("voice"),
    name: "Voice",
    description: "Temp voice channels & voice controls",
    commands: [
      //  Temp Voice (admin setup) 
      { name: "tempvoice enable", description: "Enable temp voice", usage: "tempvoice enable", aliases: ["tv enable"] },
      { name: "tempvoice disable", description: "Disable temp voice", usage: "tempvoice disable", aliases: ["tv disable"] },
      { name: "tempvoice setchannel", description: "Set join-to-create channel (public)", usage: "tempvoice setchannel <#channel>", aliases: ["tv setchannel"] },
      { name: "tempvoice setprivatechannel", description: "Set join-to-create private channel", usage: "tempvoice setprivatechannel <#channel>", aliases: ["tv setprivatechannel"] },
      { name: "tempvoice setcategory", description: "Set the category for temp channels", usage: "tempvoice setcategory <#category>", aliases: ["tv setcategory"] },
      { name: "tempvoice setname", description: "Set the default channel name template", usage: "tempvoice setname <name>", aliases: ["tv setname"] },
      //  Voice (user controls inside temp channel) 
      { name: "voice limit", description: "Set user limit for your channel", usage: "voice limit <number>", aliases: ["vc limit"] },
      { name: "voice name", description: "Rename your channel", usage: "voice name <name>", aliases: ["voice rename", "vc name"] },
      { name: "voice lock", description: "Lock channel (deny Connect)", usage: "voice lock", aliases: ["vc lock"] },
      { name: "voice unlock", description: "Unlock channel", usage: "voice unlock", aliases: ["vc unlock"] },
      { name: "voice hide", description: "Hide channel from @everyone", usage: "voice hide", aliases: ["vc hide"] },
      { name: "voice show", description: "Make channel visible again", usage: "voice show", aliases: ["voice unhide", "vc show"] },
      { name: "voice permit", description: "Allow a user to join", usage: "voice permit <@user>", aliases: ["voice allow", "vc permit"] },
      { name: "voice reject", description: "Kick and block a user", usage: "voice reject <@user>", aliases: ["voice deny", "vc reject"] },
      { name: "voice kick", description: "Kick a user from your channel", usage: "voice kick <@user>", aliases: ["vc kick"] },
      { name: "voice claim", description: "Claim an abandoned channel", usage: "voice claim", aliases: ["vc claim"] },
      { name: "voice transfer", description: "Transfer channel ownership", usage: "voice transfer <@user>", aliases: ["vc transfer"] },
      { name: "voice info", description: "Show channel info & settings", usage: "voice info", aliases: ["vc info", "voice settings"] },
      { name: "tempsettings", description: "Set your personal temp voice defaults (name, limit, privacy)", usage: "tempsettings [name/limit/privacy/reset]", aliases: ["ts"] },
    ]
  },

  // Music Commands
  music: {
    emoji: featureEmoji("music"),
    name: "Music",
    description: "Music player, queue, filters & playlists",
    commands: [
      //  Music – Playback 
      { name: "play", description: "Play a song or URL (YouTube · Spotify · SoundCloud)", usage: "play <song/url>", aliases: ["p"] },
      { name: "py", description: "Force-play via YouTube", usage: "py <song/yt url>", aliases: [] },
      { name: "ps", description: "Force-play via Spotify", usage: "ps <song/spotify url>", aliases: [] },
      { name: "playnext", description: "Insert a track to play next in the queue", usage: "playnext <song>", aliases: ["pn"] },
      { name: "pause", description: "Pause the current track", usage: "pause", aliases: [] },
      { name: "resume", description: "Resume a paused track", usage: "resume", aliases: ["unpause"] },
      { name: "skip", description: "Skip the current track", usage: "skip", aliases: ["s", "next"] },
      { name: "stop", description: "Stop music and disconnect", usage: "stop", aliases: ["leave", "dc"] },
      { name: "replay", description: "Restart the current track from the beginning", usage: "replay", aliases: [] },
      { name: "seek", description: "Jump to a timestamp in the current track", usage: "seek <time>", aliases: [] },
      { name: "rewind", description: "Rewind by N seconds", usage: "rewind <seconds>", aliases: [] },
      { name: "forward", description: "Skip forward by N seconds", usage: "forward <seconds>", aliases: [] },
      { name: "np", description: "Show what's currently playing", usage: "np", aliases: ["nowplaying"] },
      //  Music – Queue 
      { name: "queue", description: "Show the full music queue", usage: "queue [page]", aliases: ["q"] },
      { name: "upcoming", description: "Show the next 5 tracks", usage: "upcoming", aliases: [] },
      { name: "history", description: "Show recently played tracks", usage: "history", aliases: [] },
      { name: "remove", description: "Remove a track from the queue by position", usage: "remove <#>", aliases: ["rm"] },
      { name: "move", description: "Reorder a track in the queue", usage: "move <from> <to>", aliases: [] },
      { name: "jump", description: "Jump to a position in the queue", usage: "jump <#>", aliases: [] },
      { name: "skipto", description: "Skip to a specific position in the queue", usage: "skipto <#>", aliases: [] },
      { name: "shuffle", description: "Shuffle the queue", usage: "shuffle", aliases: ["sh"] },
      { name: "clear", description: "Clear the entire queue", usage: "clear", aliases: [] },
      { name: "loop", description: "Set loop mode (off / track / queue)", usage: "loop [off/track/queue]", aliases: ["repeat"] },
      { name: "volume", description: "Set the playback volume", usage: "volume [1-200]", aliases: ["vol"] },
      { name: "autoplay", description: "Toggle autoplay when queue ends", usage: "autoplay", aliases: ["ap"] },
      { name: "movebot", description: "Move the bot to your voice channel", usage: "movebot", aliases: [] },
      //  Music – Playlists 
      { name: "playlist create", description: "Create a new playlist", usage: "playlist create <name>", aliases: ["pl create"] },
      { name: "playlist play", description: "Load an entire playlist into the queue", usage: "playlist play <name>", aliases: ["pl play"] },
      { name: "playlist add", description: "Add a song to a playlist", usage: "playlist add <name> <song>", aliases: ["pl add"] },
      { name: "playlist addcurrent", description: "Add the currently playing track to a playlist", usage: "playlist addcurrent <name>", aliases: ["pl ac"] },
      { name: "playlist removetrack", description: "Remove a track from a playlist by number", usage: "playlist removetrack <name> <#>", aliases: ["pl rt"] },
      { name: "playlist list", description: "List all your playlists", usage: "playlist list", aliases: ["pl list"] },
      { name: "playlist view", description: "View tracks in a playlist", usage: "playlist view <name>", aliases: ["pl view"] },
      { name: "playlist rename", description: "Rename a playlist", usage: "playlist rename <name> <new>", aliases: ["pl rename"] },
      { name: "playlist clear", description: "Clear all tracks from a playlist", usage: "playlist clear <name>", aliases: ["pl clear"] },
      { name: "playlist delete", description: "Delete a playlist entirely", usage: "playlist delete <name>", aliases: ["pl delete"] },
      //  Music – Info & Lyrics 
      { name: "lyrics", description: "Show lyrics for the current or a specified song", usage: "lyrics [song]", aliases: [] },
      { name: "trackinfo", description: "Show detailed info about the current track", usage: "trackinfo", aliases: [] },
      { name: "search", description: "Search and pick a track from results", usage: "search <query>", aliases: [] },
      { name: "thumbnail", description: "Show the current track's album art", usage: "thumbnail", aliases: [] },
      { name: "mostplayed", description: "Show most played tracks in this server", usage: "mostplayed", aliases: [] },
      //  Music – DJ & Config 
      { name: "voteskip", description: "Start a vote to skip the current track", usage: "voteskip", aliases: [] },
      { name: "skipratio", description: "Set the % of votes needed to skip", usage: "skipratio <1-100>", aliases: [] },
      { name: "djrole", description: "Restrict music commands to a role", usage: "djrole <@role>", aliases: [] },
      { name: "lockchannel", description: "Lock music commands to the current channel", usage: "lockchannel", aliases: [] },
      { name: "restrict", description: "Toggle a specific music command on/off", usage: "restrict <command>", aliases: [] },
      { name: "music enable", description: "Enable the music system", usage: "music enable", aliases: [] },
      { name: "music disable", description: "Disable the music system", usage: "music disable", aliases: [] },
      { name: "music djrole", description: "Set or remove the DJ role", usage: "music djrole <@role | remove>", aliases: [] },
      { name: "music defaultvol", description: "Set the default session volume", usage: "music defaultvol <1-200>", aliases: [] },
      { name: "music settings", description: "View current music config", usage: "music settings", aliases: [] },
    ]
  },



  // wall Commands
  wall: {
    emoji: featureEmoji("wall"),
    name: "Wall System",
    description: "Role quarantine system – isolate dangerous users",
    commands: [
      { name: "wall enable", description: "Create or reuse the X WALL whitelist role, then enable Wall", usage: "wall enable", aliases: [] },
      { name: "wall disable", description: "Disable wall system", usage: "wall disable", aliases: [] },
      { name: "jail setup", description: "One-step jail bootstrapper — sets channel, creates Quarantined role, syncs permissions", usage: "jail setup #jail-channel [@role]", aliases: ["jail setup"] },
      { name: "jail status", description: "View current jail configuration (channel, role, jailer, logged count)", usage: "jail status", aliases: ["jail info", "jail cfg"] },
      { name: "wall quarantine", description: "Quarantine a user (removes roles, blocks commands)", usage: "wall quarantine <@user> [reason]", aliases: ["wall q"] },
      { name: "wall release", description: "Release a user from quarantine (restores roles)", usage: "wall release <@user>", aliases: ["wall uq"] },
      { name: "wall list", description: "List quarantined users", usage: "wall list", aliases: [] },
      { name: "wall setlogs", description: "Set log channel", usage: "wall setlogs <#channel>", aliases: [] },
      { name: "wall setjailer", description: "Set the Jailer role (can use jail/unjail commands)", usage: "wall setjailer <@role>", aliases: [] },
      { name: "wall removejailer", description: "Remove the Jailer role", usage: "wall removejailer", aliases: [] },
      { name: "wall settings", description: "View wall settings", usage: "wall settings", aliases: [] },
      { name: "quarantine", description: "Quarantine a user (shortcut)", usage: "quarantine <@user> [reason]", aliases: ["jail", "q8"] },
      { name: "jail setlogs", description: "Set the jail log channel", usage: "jail setlogs #channel", aliases: [] },
      { name: "release", description: "Release a quarantined user (shortcut)", usage: "release <@user>", aliases: ["unquarantine", "unjail"] }
    ]
  },





  //  Roles (merged: Button Roles + Custom Roles + Auto Roles) 
  roles: {
    emoji: featureEmoji("roles"),
    name: "Roles",
    description: "All role management – button, custom & auto roles",
    commands: [
      { name: "role list", description: "List all server roles with page buttons", usage: "role list", aliases: [] },
      //  Button Roles 
      { name: "buttonrole create", description: "Create button role panel", usage: "buttonrole create <n>", aliases: ["br create"] },
      { name: "buttonrole edit", description: "Edit an existing button role panel by name", usage: "buttonrole edit <n>", aliases: ["br edit"] },
      { name: "buttonrole add", description: "Add role to button panel", usage: "buttonrole add <messageID> <@role> <label> [emoji]", aliases: ["br add"] },
      { name: "buttonrole remove", description: "Remove role from button panel", usage: "buttonrole remove <messageID> <@role>", aliases: ["br remove"] },
      { name: "buttonrole list", description: "List button role panels", usage: "buttonrole list", aliases: ["br list"] },
      //  Custom Roles 
      { name: "customrole enable", description: "Enable custom roles", usage: "customrole enable", aliases: ["cr enable"] },
      { name: "customrole disable", description: "Disable custom roles", usage: "customrole disable", aliases: ["cr disable"] },
      { name: "customrole create", description: "Create a custom role", usage: "customrole create <n> <color>", aliases: ["cr create"] },
      { name: "customrole delete", description: "Delete your custom role", usage: "customrole delete", aliases: ["cr delete"] },
      { name: "customrole edit", description: "Edit your custom role", usage: "customrole edit <name/color> <value>", aliases: ["cr edit"] },
      { name: "customrole settings", description: "View custom role settings", usage: "customrole settings", aliases: ["cr settings"] },
      //  Auto Roles 
      { name: "autorole add", description: "Add a join role for humans or bots", usage: "autorole add <humans|bots> <role ID|name|mention>", aliases: ["ar add"] },
      { name: "autorole remove", description: "Remove a human or bot join role", usage: "autorole remove <humans|bots> <role ID|name|mention>", aliases: ["ar remove"] },
      { name: "autorole list", description: "List configured human and bot join roles", usage: "autorole list", aliases: ["ar list"] },
      { name: "autorole clear", description: "Clear all auto roles", usage: "autorole clear", aliases: ["ar clear"] },
      //  Bulk Roles
      { name: "humanrole add", description: "Add a role to all human members", usage: "humanrole add <@role>", aliases: ["human role add"] },
      { name: "humanrole remove", description: "Remove a role from all human members", usage: "humanrole remove <@role>", aliases: ["human role remove"] },
      { name: "botrole add", description: "Add a role to all bot members", usage: "botrole add <@role>", aliases: ["bot role add"] },
      { name: "botrole remove", description: "Remove a role from all bot members", usage: "botrole remove <@role>", aliases: ["bot role remove"] },
      { name: "massrole add", description: "Add a role to everyone, humans, or bots", usage: "massrole add [human|bot] <@role>", aliases: ["memberrole add", "member role add"] },
      { name: "massrole remove", description: "Remove a role from everyone, humans, or bots", usage: "massrole remove [human|bot] <@role>", aliases: ["memberrole remove", "member role remove", "removeroleall"] },
      { name: "removerole", description: "Remove one role from one member", usage: "removerole <@member> <@role>", aliases: ["rr"] },
      { name: "roleicon", description: "Add, edit, or remove a role icon", usage: "roleicon <add|edit|remove> @role [image/url]", aliases: [] },
      //  Reaction Roles 
      { name: "rr create", description: "Create a new reaction role panel", usage: "rr create [name]", aliases: ["reactionrole create"] },
      { name: "rr edit", description: "Edit an existing reaction role panel by name", usage: "rr edit <n>", aliases: ["reactionrole edit"] },
      { name: "rr list", description: "List all reaction role panels", usage: "rr list", aliases: ["reactionrole list"] },
      { name: "rr delete", description: "Delete a reaction role panel", usage: "rr delete <name or msgID>", aliases: ["reactionrole delete"] },
      //  Vanity Role 
      { name: "vanityrole status", description: "View vanity role config", usage: "vanityrole status", aliases: ["vr status"] },
      { name: "vanityrole settag", description: "Set tag to watch in custom statuses", usage: "vanityrole settag <tag>", aliases: ["vr settag"] },
      { name: "vanityrole set", description: "Set the role to award", usage: "vanityrole set @role", aliases: ["vr set"] },
      { name: "vanityrole setlog", description: "Set log channel", usage: "vanityrole setlog #channel", aliases: ["vr setlog"] },
      { name: "vanityrole enable", description: "Enable vanity role system", usage: "vanityrole enable", aliases: ["vr enable"] },
      { name: "vanityrole disable", description: "Disable vanity role system", usage: "vanityrole disable", aliases: ["vr disable"] },
      { name: "vanityrole check", description: "Check if a user is repping the tag", usage: "vanityrole check [@user]", aliases: ["vr check"] },
      { name: "vanityrole remove", description: "Clear the award role", usage: "vanityrole remove", aliases: ["vr remove"] },
      //  Tag Role 
      { name: "tagrole status", description: "View tag role config", usage: "tagrole status", aliases: ["tr status"] },
      { name: "tagrole settag", description: "Set tag to watch in usernames/display names", usage: "tagrole settag <tag>", aliases: ["tr settag"] },
      { name: "tagrole set", description: "Set the role to award", usage: "tagrole set @role", aliases: ["tr set"] },
      { name: "tagrole setlog", description: "Set log channel", usage: "tagrole setlog #channel", aliases: ["tr setlog"] },
      { name: "tagrole enable", description: "Enable tag role system", usage: "tagrole enable", aliases: ["tr enable"] },
      { name: "tagrole disable", description: "Disable tag role system", usage: "tagrole disable", aliases: ["tr disable"] },
      { name: "tagrole check", description: "Check if a user has the tag in their name", usage: "tagrole check [@user]", aliases: ["tr check"] },
      { name: "tagrole scan", description: "Scan all members and auto-assign/remove tag role", usage: "tagrole scan", aliases: ["tr scan"] }
    ]
  },

  //  General (AFK + Confessions + Boost + Birthday + Emoji & Sticky) 
  general: {
    emoji: featureEmoji("general"),
    name: "General",
    description: "AFK, Confessions, Boost, Birthday, Emoji & Sticky",
    commands: [
      //  AFK 
      { name: "invite", description: "Get the bot invite and support links", usage: "invite", aliases: ["botinvite", "bi"] },
      { name: "economy config", description: "Open economy settings", usage: "economy config", aliases: ["eco config"] },
      { name: "daily", description: "Claim your daily reward", usage: "daily", aliases: [] },
      { name: "work", description: "Work to earn coins", usage: "work", aliases: [] },
      { name: "afk", description: "Set AFK status (server only)", usage: "afk [reason]", aliases: [] },
      { name: "afk global", description: "Set global AFK status (all servers)", usage: "afk global [reason]", aliases: ["gafk", "gafkon", "gafkoff"] },
      { name: "afk server", description: "Set server-specific AFK status", usage: "afk server [reason]", aliases: ["safk", "safkon", "safkoff"] },
      { name: "afk list", description: "List all AFK users in this server", usage: "afk list", aliases: [] },
      { name: "afk mentions", description: "View who mentioned you while AFK", usage: "afk mentions", aliases: [] },
      //  Confessions 
      { name: "confession enable", description: "Enable confessions", usage: "confession enable", aliases: ["confess enable"] },
      { name: "confession disable", description: "Disable confessions", usage: "confession disable", aliases: ["confess disable"] },
      { name: "confession setchannel", description: "Set confession channel", usage: "confession setchannel <#channel>", aliases: ["confess setchannel"] },
      { name: "confession setlogs", description: "Set confession logs channel", usage: "confession setlogs <#channel>", aliases: ["confess setlogs"] },
      { name: "confession ban", description: "Ban user from confessing", usage: "confession ban <@user>", aliases: ["confess ban"] },
      { name: "confession unban", description: "Unban user from confessing", usage: "confession unban <@user>", aliases: ["confess unban"] },
      //  Boost 
      { name: "boost enable", description: "Enable boost messages", usage: "boost enable", aliases: [] },
      { name: "boost disable", description: "Disable boost messages", usage: "boost disable", aliases: [] },
      { name: "boost setchannel", description: "Set boost channel", usage: "boost setchannel <#channel>", aliases: [] },
      { name: "boost test", description: "Test boost message", usage: "boost test", aliases: [] },
      //  Birthday 
      { name: "birthday config", description: "Open the full birthday config panel (channel, role, message, toggle)", usage: "birthday config", aliases: ["bday config", "bday settings", "birthday settings"] },
      { name: "birthday enable", description: "Enable birthdays", usage: "birthday enable", aliases: ["bday enable"] },
      { name: "birthday disable", description: "Disable birthdays", usage: "birthday disable", aliases: ["bday disable"] },
      { name: "birthday set", description: "Set your birthday", usage: "birthday set <YYYY-MM-DD>", aliases: ["bday set"] },
      { name: "birthday remove", description: "Remove your birthday", usage: "birthday remove", aliases: ["bday remove"] },
      { name: "birthday setchannel", description: "Set birthday channel", usage: "birthday setchannel <#channel>", aliases: ["bday setchannel"] },
      { name: "birthday setrole", description: "Set birthday role", usage: "birthday setrole <@role>", aliases: ["bday setrole"] },
      { name: "birthday list", description: "List upcoming birthdays", usage: "birthday list", aliases: ["bday list"] },
      //  Emoji & Sticker 
      { name: "steal", description: "Steal a sticker, image, or GIF", usage: "steal [image URL] (or reply to media)", aliases: ["stealsticker", "ss"] },
      { name: "stealemoji", description: "Steal an emoji", usage: "stealemoji <emoji> [name]", aliases: ["se", "addemoji", "ae"] },
      { name: "deleteemoji", description: "Delete an emoji", usage: "deleteemoji <emoji>", aliases: ["delemoji", "removeemoji"] },
      { name: "emojis", description: "List server emojis", usage: "emojis", aliases: ["emojilist", "listemojis"] },
      { name: "stickers", description: "List server stickers", usage: "stickers", aliases: ["stickerlist", "liststickers"] },
      { name: "enlarge", description: "Enlarge an emoji", usage: "enlarge <emoji>", aliases: ["jumbo", "big"] },
      //  Sticky Messages 
      { name: "sticky enable", description: "Enable sticky system", usage: "sticky enable", aliases: [] },
      { name: "sticky disable", description: "Disable sticky system", usage: "sticky disable", aliases: [] },
      { name: "sticky set", description: "Set sticky name, message, channel, and mode", usage: "sticky <name>|<message>|<channel>|<mode>", aliases: ["sticky message", "sticky name", "sticky mode", "sticky add"] },
      { name: "sticky remove", description: "Remove sticky message", usage: "sticky remove", aliases: ["sticky delete"] },
      { name: "sticky list", description: "List sticky messages", usage: "sticky list", aliases: [] },
      { name: "sticky settings", description: "View settings", usage: "sticky settings", aliases: [] },
      //  Media Channels 
      { name: "media enable",            description: "Enable media-only channel enforcement",        usage: "media enable",                    aliases: ["mediaonly enable"] },
      { name: "media disable",           description: "Disable media-only channel enforcement",       usage: "media disable",                   aliases: ["mediaonly disable"] },
      { name: "media add",               description: "Add a media-only channel",                     usage: "media add #channel",              aliases: [] },
      { name: "media remove",            description: "Remove a media-only channel",                  usage: "media remove #channel",           aliases: [] },
      { name: "media setchannel",        description: "Alias for media add — set a media channel",   usage: "media setchannel #channel",       aliases: [] },
      { name: "media uploadlogs",        description: "Set the media upload log channel",             usage: "media uploadlogs #channel",       aliases: ["media setuploadlogs"] },
      { name: "media deletelogs",        description: "Set the deleted media log channel",            usage: "media deletelogs #channel",       aliases: ["media setdeletelogs"] },
      { name: "media list",              description: "List all media-only channels",                 usage: "media list",                      aliases: [] },
      { name: "media bypass adduser",    description: "Exempt a user from media-only rules",         usage: "media bypass adduser @user",      aliases: [] },
      { name: "media bypass removeuser", description: "Remove a user's media bypass",               usage: "media bypass removeuser @user",   aliases: [] },
      { name: "media bypass addrole",    description: "Exempt a role from media-only rules",        usage: "media bypass addrole @role",      aliases: [] },
      { name: "media bypass removerole", description: "Remove a role's media bypass",              usage: "media bypass removerole @role",   aliases: [] },
      { name: "media bypass list",       description: "List all media bypass users and roles",       usage: "media bypass list",               aliases: [] },
      { name: "media config",            description: "Configure media channels (interactive panel)", usage: "media config",                    aliases: [] },
      // — Economy —
      { name: "mypoints", description: "View total points (invite + dev-awarded)", usage: "mypoints [@user]", aliases: ["points", "pts"] },
    ]
  },

  //  Config (all module config/setup panels) 
  config: {
    emoji: featureEmoji("config"),
    name: "Config",
    description: "Open config panels for all bot modules",
    commands: [
      { name: "welcome config", description: "Configure welcome messages", usage: "welcome config", aliases: [] },
      { name: "goodbye config", description: "Configure goodbye messages", usage: "goodbye config", aliases: [] },
      { name: "joindm config", description: "Configure join DM messages", usage: "joindm config", aliases: [] },
      { name: "prefix config", description: "View server prefix settings", usage: "prefix config", aliases: ["setprefix config"] },
      { name: "warn config", description: "Configure warn auto-punishments", usage: "warn config", aliases: ["warnpunish config"] },
      { name: "automod config", description: "Configure automod settings", usage: "automod config", aliases: [] },
      { name: "automod enable", description: "Create or reuse the X MOD whitelist role and log channel, then enable AutoMod", usage: "automod enable", aliases: [] },
      { name: "automod disable", description: "Disable all AutoMod protections while keeping channels and roles", usage: "automod disable", aliases: [] },
      { name: "antinuke config", description: "Configure anti-nuke and raid protections", usage: "antinuke config", aliases: [] },
      { name: "antinuke enable", description: "Create or reuse the X NUKE whitelist role and logs, then enable AntiNuke", usage: "antinuke enable", aliases: [] },
      { name: "antinuke disable", description: "Disable all AntiNuke protections while keeping channels and roles", usage: "antinuke disable", aliases: [] },
      { name: "logging config", description: "Configure logging settings", usage: "logging config", aliases: [] },
      { name: "ticket config", description: "Configure ticket system", usage: "ticket config", aliases: [] },
      { name: "tempvoice config", description: "Configure temp voice channels", usage: "tempvoice config", aliases: [] },
      { name: "giveaway config", description: "Configure giveaway system", usage: "giveaway config", aliases: [] },
      { name: "confession config", description: "Configure confession system", usage: "confession config", aliases: ["confess config"] },
      { name: "sticky config", description: "Configure sticky messages", usage: "sticky config", aliases: [] },
      { name: "birthday config", description: "Configure birthday system", usage: "birthday config", aliases: [] },
      { name: "boost config", description: "Configure boost rewards", usage: "boost config", aliases: [] },
      { name: "wall config", description: "Configure quarantine wall", usage: "wall config", aliases: [] },
      { name: "dashboard", description: "Open full server dashboard", usage: "dashboard", aliases: ["dash", "panel"] },
    ]
  },

  //  Whitelist System (users, roles, and channels ignored by security systems)
  whitelist: {
    emoji: featureEmoji("whitelist", "immune"),
    name: "Whitelist",
    description: "Shared user and role immunity across security protections; use feature-specific commands for scoped exemptions",
    commands: [
      { name: "whitelist user add", description: "Add a user ignored by security systems", usage: "whitelist user add <@user>", aliases: ["wl au", "whitelist adduser", "immune add"] },
      { name: "whitelist user remove", description: "Remove a user from the whitelist", usage: "whitelist user remove <@user>", aliases: ["wl ru", "whitelist removeuser", "immune remove"] },
      { name: "whitelist user list", description: "List whitelisted users", usage: "whitelist user list", aliases: ["wl user list"] },
      { name: "whitelist role add", description: "Add a role ignored by security systems", usage: "whitelist role add <@role>", aliases: ["wl ar", "whitelist addrole"] },
      { name: "whitelist role remove", description: "Remove a role from the whitelist", usage: "whitelist role remove <@role>", aliases: ["wl rr", "whitelist removerole"] },
      { name: "whitelist role list", description: "List whitelisted roles", usage: "whitelist role list", aliases: ["wl role list"] },
      { name: "whitelist all list", description: "List whitelisted users and roles", usage: "whitelist all list", aliases: ["whitelist", "wl"] },
      //  Anti-Nuke Whitelist
      { name: "antinuke whitelist", description: "Whitelist a user for anti-nuke", usage: "antinuke whitelist <@user>", aliases: ["an wl", "antinuke wl"] },
      { name: "antinuke unwhitelist", description: "Remove a user from anti-nuke whitelist", usage: "antinuke unwhitelist <@user>", aliases: ["an unwl", "antinuke unwl"] },
      { name: "antinuke setwhitelist", description: "Set an Anti-Nuke-only role exemption; action thresholds still apply", usage: "antinuke setwhitelist <@role>", aliases: ["antinuke setwl"] },
      { name: "antinuke removewhitelist", description: "Remove the anti-nuke whitelist role", usage: "antinuke removewhitelist", aliases: ["antinuke removewl"] },
      { name: "antinuke whitelistlist", description: "View anti-nuke whitelist role and users", usage: "antinuke whitelistlist", aliases: ["antinuke wllist"] },
      //  Security Whitelist
      { name: "security whitelist add", description: "Whitelist an invite domain from anti-invite checks", usage: "security whitelist add <domain>", aliases: [] },
      { name: "security whitelist remove", description: "Remove a domain from the invite whitelist", usage: "security whitelist remove <domain>", aliases: [] },
      { name: "security whitelist list", description: "Show all whitelisted invite domains", usage: "security whitelist list", aliases: [] },
      { name: "security whitelist user add", description: "Add a user to the security whitelist", usage: "security whitelist user add <@user>", aliases: [] },
      { name: "security whitelist user remove", description: "Remove a user from the security whitelist", usage: "security whitelist user remove <@user>", aliases: [] },
      { name: "security whitelist user list", description: "List security-whitelisted users", usage: "security whitelist user list", aliases: [] },
      { name: "security whitelist role add", description: "Add a role to the security whitelist", usage: "security whitelist role add <@role>", aliases: [] },
      { name: "security whitelist role remove", description: "Remove a role from the security whitelist", usage: "security whitelist role remove <@role>", aliases: [] },
      { name: "security whitelist role list", description: "List security-whitelisted roles", usage: "security whitelist role list", aliases: [] },
      //  Anti-Bot Whitelist
      { name: "botgrant", description: "Configured bot owner or ExtraOwner only: grant shared immunity from automatic protections", usage: "botgrant <@bot|botID>", aliases: [] },
      { name: "botrevoke", description: "Configured bot owner or ExtraOwner only: remove shared protection immunity", usage: "botrevoke <@bot|botID>", aliases: [] },
      { name: "antibot whitelist", description: "Whitelist a bot from anti-bot action", usage: "antibot whitelist <botID>", aliases: ["ab wl", "antibot wl"] },
      { name: "antibot unwhitelist", description: "Remove a bot from anti-bot whitelist", usage: "antibot unwhitelist <botID>", aliases: ["ab unwl", "antibot unwl"] },
      //  Wall Whitelist
      { name: "wall setwhitelist", description: "Set a role that bypasses wall checks", usage: "wall setwhitelist <@role>", aliases: [] },
      { name: "wall removewhitelist", description: "Remove the wall whitelist role", usage: "wall removewhitelist", aliases: [] },
      { name: "wall whitelist", description: "Add a user to the wall whitelist", usage: "wall whitelist <@user>", aliases: ["wall wl", "wall immune"] },
      { name: "wall unwhitelist", description: "Remove a user from the wall whitelist", usage: "wall unwhitelist <@user>", aliases: ["wall unwl"] },
      { name: "wall whitelistlist", description: "View wall whitelist and jailer role", usage: "wall whitelistlist", aliases: ["wall wllist"] },
      //  Bad Word Whitelist
      { name: "badwordwhitelist addrole", description: "Add whitelisted role for bad word filter", usage: "badwordwhitelist addrole <@role>", aliases: ["badwordimmune addrole", "bwimmune addrole"] },
      { name: "badwordwhitelist removerole", description: "Remove whitelisted role from bad word filter", usage: "badwordwhitelist removerole <@role>", aliases: ["badwordimmune removerole", "bwimmune removerole"] },
      { name: "badwordwhitelist addchannel", description: "Add whitelisted channel for bad word filter", usage: "badwordwhitelist addchannel <#channel>", aliases: ["badwordimmune addchannel", "bwimmune addchannel"] },
      { name: "badwordwhitelist removechannel", description: "Remove whitelisted channel from bad word filter", usage: "badwordwhitelist removechannel <#channel>", aliases: ["badwordimmune removechannel", "bwimmune removechannel"] },
      { name: "badwordwhitelist clearroles", description: "Clear all bad word whitelisted roles", usage: "badwordwhitelist clearroles", aliases: ["badwordimmune clearroles", "bwimmune clearroles"] },
      { name: "badwordwhitelist clearchannels", description: "Clear all bad word whitelisted channels", usage: "badwordwhitelist clearchannels", aliases: ["badwordimmune clearchannels", "bwimmune clearchannels"] },
      { name: "badwordwhitelist", description: "List all bad word whitelisted roles and channels", usage: "badwordwhitelist", aliases: ["bwwhitelist"] },
      //  NSFW Whitelist
      { name: "nsfwwhitelist enable", description: "Enable NSFW filter", usage: "nsfwwhitelist enable", aliases: ["nsfwimmune enable", "nsfwfilter enable"] },
      { name: "nsfwwhitelist disable", description: "Disable NSFW filter", usage: "nsfwwhitelist disable", aliases: ["nsfwimmune disable", "nsfwfilter disable"] },
      { name: "nsfwwhitelist addrole", description: "Add whitelisted role for NSFW filter", usage: "nsfwwhitelist addrole <@role>", aliases: ["nsfwimmune addrole", "nsfwfilter addrole"] },
      { name: "nsfwwhitelist removerole", description: "Remove whitelisted role from NSFW filter", usage: "nsfwwhitelist removerole <@role>", aliases: ["nsfwimmune removerole", "nsfwfilter removerole"] },
      { name: "nsfwwhitelist addchannel", description: "Add whitelisted channel for NSFW filter", usage: "nsfwwhitelist addchannel <#channel>", aliases: ["nsfwimmune addchannel", "nsfwfilter addchannel"] },
      { name: "nsfwwhitelist removechannel", description: "Remove whitelisted channel from NSFW filter", usage: "nsfwwhitelist removechannel <#channel>", aliases: ["nsfwimmune removechannel", "nsfwfilter removechannel"] },
      { name: "nsfwwhitelist clearroles", description: "Clear all NSFW whitelisted roles", usage: "nsfwwhitelist clearroles", aliases: ["nsfwimmune clearroles", "nsfwfilter clearroles"] },
      { name: "nsfwwhitelist clearchannels", description: "Clear all NSFW whitelisted channels", usage: "nsfwwhitelist clearchannels", aliases: ["nsfwimmune clearchannels", "nsfwfilter clearchannels"] },
      { name: "nsfwwhitelist", description: "List all NSFW whitelisted roles and channels", usage: "nsfwwhitelist", aliases: ["nsfwfilter list"] },
      //  Anti-Link Whitelist
      { name: "antilink whitelist", description: "Whitelist a domain for anti-link", usage: "antilink whitelist <domain>", aliases: ["al wl", "antilink wl", "antinlink whitelist", "antinlinl whitelist"] },
      { name: "antilink whitelist role", description: "Whitelist a role from anti-link checks", usage: "antilink whitelist role <@role>", aliases: ["al wl role", "antilink wl role", "antilink immunerole", "antinlink whitelist role", "antinlinl whitelist role"] },
      { name: "antilink whitelist user", description: "Whitelist a user from anti-link checks", usage: "antilink whitelist user <@user>", aliases: ["al wl user", "antilink wl user", "antinlink whitelist user", "antinlinl whitelist user"] },
      { name: "antilink unwhitelist", description: "Remove an anti-link whitelist role, user, or domain", usage: "antilink unwhitelist <role/user/domain> <target>", aliases: ["antilink unwl"] },
      { name: "antilinkwhitelist addrole", description: "Add role whitelisted for anti-link", usage: "antilinkwhitelist addrole <@role>", aliases: ["antilinkimmune addrole", "alimmune addrole"] },
      { name: "antilinkwhitelist removerole", description: "Remove whitelisted role from anti-link", usage: "antilinkwhitelist removerole <@role>", aliases: ["antilinkimmune removerole", "alimmune removerole"] },
      { name: "antilinkwhitelist adduser", description: "Add user whitelisted for anti-link", usage: "antilinkwhitelist adduser <@user>", aliases: ["antilinkimmune adduser", "alimmune adduser"] },
      { name: "antilinkwhitelist removeuser", description: "Remove whitelisted user from anti-link", usage: "antilinkwhitelist removeuser <@user>", aliases: ["antilinkimmune removeuser", "alimmune removeuser"] },
      { name: "antilinkwhitelist addchannel", description: "Add whitelisted channel to anti-link", usage: "antilinkwhitelist addchannel <#channel>", aliases: ["antilinkimmune addchannel", "alimmune addchannel"] },
      { name: "antilinkwhitelist removechannel", description: "Remove whitelisted channel from anti-link", usage: "antilinkwhitelist removechannel <#channel>", aliases: ["antilinkimmune removechannel", "alimmune removechannel"] },
      { name: "antilinkwhitelist clearroles", description: "Clear all anti-link whitelisted roles", usage: "antilinkwhitelist clearroles", aliases: ["antilinkimmune clearroles", "alimmune clearroles"] },
      { name: "antilinkwhitelist clearusers", description: "Clear all anti-link whitelisted users", usage: "antilinkwhitelist clearusers", aliases: ["antilinkimmune clearusers", "alimmune clearusers"] },
      { name: "antilinkwhitelist clearchannels", description: "Clear all anti-link whitelisted channels", usage: "antilinkwhitelist clearchannels", aliases: ["antilinkimmune clearchannels", "alimmune clearchannels"] },
      { name: "antilinkwhitelist", description: "List all anti-link whitelisted roles, users and channels", usage: "antilinkwhitelist", aliases: ["alwhitelist"] },
      { name: "filterwhitelist", description: "View all filter whitelist settings at a glance", usage: "filterwhitelist", aliases: ["filterimmune", "immune", "bwimmune"] }
    ]
  },

  //  Security Commands (merged into Anti-Nuke) 
  // (security merged into antinuke)

  //  Settings (Bot Identity, Utility & Reports) 
  settings: {
    emoji: featureEmoji("settings"),
    name: "Settings",
    description: "Bot Identity, Utility & Reports",
    commands: [
      //  Bot Identity 
      { name: "botset name", description: "Change bot nickname in this server", usage: "botset name <new name>", aliases: ["setname"] },
      { name: "botset avatar", description: "Set server-specific bot avatar", usage: "botset avatar <url>", aliases: ["setavatar"] },
      { name: "botset banner", description: "Set server-specific bot banner", usage: "botset banner <url>", aliases: ["setbanner"] },
      { name: "botset reset", description: "Reset all bot identity settings", usage: "botset reset", aliases: [] },
      { name: "botset status", description: "Set or reset the bot's global activity and online state (bot owner only)", usage: "botset status [online|idle|dnd] [type] <message> | botset status reset", aliases: [] },
      //  Utility 
      { name: "help", description: "Show help menu with security check", usage: "help [command]", aliases: ["h", "commands"] },
      { name: "ping", description: "Check bot latency", usage: "ping", aliases: ["latency"] },
      { name: "avatar", description: "Get user server avatar, falling back to global", usage: "avatar [@user]", aliases: ["av", "pfp"] },
      { name: "globalavatar", description: "Get user global avatar", usage: "globalavatar [@user]", aliases: ["gav"] },
      { name: "banner", description: "Get user server banner, falling back to global", usage: "banner [@user]", aliases: ["bann", "bn"] },
      { name: "globalbanner", description: "Get user global banner", usage: "globalbanner [@user]", aliases: ["gbn", "gbanner"] },
      { name: "userinfo", description: "Get user info", usage: "userinfo [@user]", aliases: ["ui", "whois", "user"] },
      { name: "serverinfo", description: "Get server info", usage: "serverinfo", aliases: ["si", "server", "guild"] },
      { name: "addrole", description: "Add a role to a user, bot, all users, or all bots", usage: "addrole <@user/@bot / all user / all bot> @role", aliases: ["ar"] },
      { name: "nick", description: "Change a member nickname", usage: "nick @user <new nickname>", aliases: ["nickname", "setnick", "changenick"] },
      { name: "roleinfo", description: "Get role info", usage: "roleinfo <@role>", aliases: ["ri", "role"] },
      { name: "channelinfo", description: "Get channel info", usage: "channelinfo [#channel]", aliases: ["ci"] },
      { name: "membercount", description: "Get member count", usage: "membercount", aliases: ["mc", "members"] },
      { name: "botinfo", description: "Get bot info", usage: "botinfo", aliases: ["info", "about", "bot"] },
      { name: "prefix", description: "View or change prefix", usage: "prefix [new prefix]", aliases: ["setprefix"] },
      { name: "alias", description: "Create server command aliases", usage: "alias set <command> <new-name>", aliases: ["aliases"] },
      { name: "pin", description: "Pin a replied message or message ID", usage: "pin [message_id]", aliases: [] },
      { name: "timezone", description: "View or set server timezone for daily resets (daily, heist, birthday)", usage: "timezone [set <TZ> | list]", aliases: ["tz"] },
      { name: "settimezone", description: "Set your personal timezone or open the selector", usage: "settimezone [TZ]", aliases: ["stz"] },
      { name: "checktimezone", description: "Check a user's timezone or list saved timezones", usage: "checktimezone [@user | list]", aliases: ["ctz"] },
      { name: "poll", description: "Create a poll with optional timed auto-close and result announcement", usage: "poll <question> | <option1> | <option2> [| duration]", aliases: [] },
      { name: "translate", description: "Translate text or a replied message to another language", usage: "translate <language> [text]", aliases: ["tr"] },
      { name: "remind", description: "Set a reminder", usage: "remind <time> <message>", aliases: ["reminder", "remindme"] },
      { name: "botinvite", description: "Get bot invite link", usage: "botinvite", aliases: ["bi"] },
      { name: "dashboard", description: "Open server dashboard panel", usage: "dashboard", aliases: ["dash", "panel"] },
      { name: "embed list", description: "Show all saved embeds for this server", usage: "embed list", aliases: [] },
      { name: "embed create <n>", description: "Create & open the editor for a new embed", usage: "embed create <n>", aliases: [] },
      { name: "embed edit <n>", description: "Re-open the embed editor for a saved embed", usage: "embed edit <n>", aliases: [] },
      { name: "embed send <n>", description: "Post a saved embed to a channel", usage: "embed send <n> [#channel]", aliases: [] },
      { name: "embed delete <n>", description: "Delete a saved embed by name", usage: "embed delete <n>", aliases: [] },
      { name: "disablechannel", description: "Disable bot commands in a channel", usage: "disablechannel <#channel>", aliases: ["disablechan"] },
      { name: "enablechannel", description: "Re-enable bot commands in a disabled channel", usage: "enablechannel <#channel>", aliases: ["enablechan"] },
      { name: "disabledchannels", description: "List all disabled channels", usage: "disabledchannels", aliases: [] },
      { name: "autodelete add", description: "Enable auto-delete in a channel", usage: "autodelete add [#channel] <duration>", aliases: ["ad add"] },
      { name: "autodelete remove", description: "Disable auto-delete in a channel", usage: "autodelete remove [#channel]", aliases: ["ad remove"] },
      { name: "autodelete list", description: "List auto-delete channels", usage: "autodelete list", aliases: ["ad list"] },
      //  No Prefix 
      //  Bad Word Filter 
      { name: "badword add", description: "Add a banned word", usage: "badword add <word>", aliases: ["bw add"] },
      { name: "badword remove", description: "Remove a banned word", usage: "badword remove <word>", aliases: ["bw remove"] },
      { name: "badword list", description: "List banned words", usage: "badword list", aliases: ["bw list"] },
      { name: "badword clear", description: "Clear all banned words", usage: "badword clear", aliases: ["bw clear"] },
      //  NSFW Filter 
      { name: "nsfwword add", description: "Add an NSFW word", usage: "nsfwword add <word>", aliases: ["nsfwwords add"] },
      { name: "nsfwword remove", description: "Remove an NSFW word", usage: "nsfwword remove <word>", aliases: ["nsfwwords remove"] },
      { name: "nsfwword list", description: "List NSFW words", usage: "nsfwword list", aliases: ["nsfwwords list"] },
    ]
  },

  //   Premium Commands 
  premium_features: {
    emoji: EMOJIS.premium,
    name: "Premium",
    description: "Premium utilities and personalization",
    commands: [
      //  Account & Server Premium 
      { name: "premium status", description: "Check your premium status", usage: "premium status", aliases: ["premium check", "prem status"] },
      { name: "premium plans", description: "View all premium plans", usage: "premium plans", aliases: ["premium info", "prem plans"] },
      { name: "premium bio", description: "View or customize this server's premium bio preview", usage: "premium bio [set <text>|reset]", aliases: ["prem bio"] },
      { name: "premium raidmode", description: "Configure join-burst raid protection", usage: "premium raidmode <on [joins] [seconds] [kick|ban]|off|status>", aliases: ["prem raidmode"] },
      { name: "premium roleguard", description: "Monitor role creation, deletion and dangerous permission changes", usage: "premium roleguard <on|off|status>", aliases: ["prem roleguard"] },
      { name: "premium webhookguard", description: "Enable webhook change detection and Anti-Nuke events", usage: "premium webhookguard <on|off|status>", aliases: ["prem webhookguard"] },
      { name: "premium botguard", description: "Block unauthorized bot joins using the Anti-Bot allowlist", usage: "premium botguard <on [kick|ban]|off|status>", aliases: ["prem botguard"] },
      { name: "premium joinshield", description: "Set minimum account age and join punishment", usage: "premium joinshield <on [days] [kick|ban]|off|status>", aliases: ["prem joinshield"] },
      { name: "premium actionlog", description: "Read recent server audit events", usage: "premium actionlog [1-20]", aliases: ["prem actionlog"] },
      { name: "premium alertrole", description: "Set or remove the role included in security alerts", usage: "premium alertrole <set @role|off|status>", aliases: ["prem alertrole"] },
      { name: "premium trustscore", description: "Calculate a member activity score from recent audit events", usage: "premium trustscore @member | set <event> <1-100>", aliases: ["prem trustscore"] },
      { name: "premium restore", description: "Preview, capture, or owner-confirm server snapshot recovery", usage: "premium restore [snapshot|confirm <code>]", aliases: ["prem restore"] },
      { name: "premium panic", description: "Raise verification to the highest level during an emergency", usage: "premium panic <on|off|status>", aliases: ["prem panic"] },
      { name: "premium workflow create", description: "Create an allowlisted event-based automation", usage: "premium workflow create <event> | <action> | <text>", aliases: ["prem workflow create"] },
      { name: "premium workflow list", description: "List saved automations", usage: "premium workflow list", aliases: ["prem workflow list"] },
      { name: "premium workflow pause", description: "Pause or resume an automation", usage: "premium workflow <pause|resume> <id>", aliases: ["prem workflow pause"] },
      { name: "premium workflow test", description: "Dry-run a workflow without sending or changing anything", usage: "premium workflow test <id>", aliases: ["prem workflow test"] },
      { name: "premium autorole condition", description: "Assign a role to members who match an account-age or member-type condition", usage: "premium autorole condition <add @role human|bot|age>=days|remove @role|list>", aliases: ["prem autorole condition"] },
      { name: "premium autothread", description: "Create a discussion thread for each human post in a selected channel", usage: "premium autothread <set #channel [name]|off|status>", aliases: ["prem autothread"] },
      { name: "premium autoping", description: "Schedule reminders that mention one configured role", usage: "premium autoping <add @role #channel <hours> | <message>|list|remove <id>>", aliases: ["prem autoping"] },
      { name: "premium cleanup", description: "Schedule cleanup for bot-authored, unpinned posts only", usage: "premium cleanup <set #channel <age-hours>|off #channel|list>", aliases: ["prem cleanup"] },
      { name: "premium autoreplypro", description: "Add a conditional autoresponse with channel, role and cooldown rules", usage: "premium autoreplypro <add trigger | reply | cooldown=60 [| channel=#channel | role=@role]|list|remove trigger>", aliases: ["prem autoreplypro"] },
      { name: "premium welcome test", description: "Preview the configured welcome message without sending a join event", usage: "premium welcome test", aliases: ["prem welcome test"] },
      { name: "premium channel create", description: " Create a hidden text channel (premium users + owner only)", usage: "premium channel create [name]", aliases: ["prem channel create"] },
      { name: "premium vc create", description: " Create a hidden voice channel (premium users + owner only)", usage: "premium vc create [name]", aliases: ["prem vc create"] },
      { name: "premium role set", description: " Set the server's premium role (server owner only)", usage: "premium role set <@role>", aliases: ["prem role set"] },
      { name: "premium role list", description: " List all members who have the premium role", usage: "premium role list", aliases: ["prem role list"] },
      //  Personalization 
      { name: "custombg", description: " Set a custom background image for rank/welcome cards", usage: "custombg <url>", aliases: [] },
      { name: "theme", description: " Set a custom embed color theme for the server", usage: "theme <hex>", aliases: [] },
      { name: "theme reset", description: " Reset the embed theme to default", usage: "theme reset", aliases: [] },
      { name: "botpfp", description: " Change the bot's avatar in this server", usage: "botpfp <url>", aliases: [] },
      { name: "rotateavatar", description: " Auto-rotate bot avatar from a saved list", usage: "rotateavatar <add/remove/list/interval>", aliases: ["rotavatar"] },
      { name: "birthdayrole", description: " Set a role auto-given for 24h on someone's birthday", usage: "birthdayrole <@role>", aliases: [] },
      //  Economy Games 
      //  Exclusivity 
      { name: "premiumchannel", description: " Restrict a channel to premium role holders only", usage: "premiumchannel <#channel>", aliases: ["lockchannel premium"] },
      { name: "premiumchannel remove", description: " Remove premium restriction from a channel", usage: "premiumchannel remove <#channel>", aliases: [] },
      { name: "premiumrole", description: " Set a role auto-assigned to premium users", usage: "premiumrole <@role>", aliases: [] },
      { name: "vouchsystem", description: " Vouch for a member – tracked on a leaderboard", usage: "vouchsystem <@user> [reason]", aliases: ["vouch"] },
      { name: "vouchsystem lb", description: " View the vouch leaderboard", usage: "vouchsystem lb", aliases: ["vouch lb"] },
      { name: "vouchsystem check", description: " Check how many vouches a user has", usage: "vouchsystem check <@user>", aliases: ["vouch check"] },
      //  Channel Cooldown (Premium) 
    ]
  },

  //   Owner / Dev Commands (hidden from regular users) 
  owner_only: {
    emoji: featureEmoji("owner"),
    name: "Owner",
    description: "Bot owner & Soezy dev exclusive commands",
    commands: [
      //  Bot Management 
      { name: "clearpoints", description: "Clear a user's developer or invite points (bot owner only)", usage: "clearpoints <@user> [dev|invite|all]", aliases: ["clearpts", "resetpoints", "resetpts"] },
      { name: "ownerhelp", description: "Open the owner command menu", usage: "ownerhelp", aliases: ["owner"] },
      { name: "botstats", description: "General, code, system and team stats", usage: "botstats", aliases: ["stats", "bstats"] },
      { name: "dev", description: "Manage the developer list shown in Team stats", usage: "dev <add/remove/list> [user]", aliases: [] },
      { name: "botadmin", description: "Manage the bot-admin list shown in Team stats", usage: "botadmin <add/remove/list> [user]", aliases: [] },
      { name: "botpartner", description: "Manage the bot-partner list shown in Team stats", usage: "botpartner <add/remove/list> [user]", aliases: [] },
      { name: "memory", description: "Show memory usage and runtime pressure", usage: "memory", aliases: [] },
      { name: "runtime", description: "Show runtime cache and sync state", usage: "runtime", aliases: [] },
      { name: "diagnostics", description: "Run lightweight runtime diagnostics", usage: "diagnostics", aliases: ["debug"] },
      { name: "nodeinfo", description: "Show Lavalink/music node status", usage: "nodeinfo", aliases: [] },
      { name: "queues", description: "Show active music queue summary", usage: "queues", aliases: [] },
      { name: "node", description: "Manage Lavalink node status, reconnect, restart, switch, and players", usage: "node <status/reconnect/restart/switch/players> [node]", aliases: [] },
      { name: "collectors", description: "Show tracked component collectors", usage: "collectors", aliases: [] },
      { name: "cache", description: "Show runtime cache counts", usage: "cache", aliases: [] },
      { name: "ratelimits", description: "Show runtime rate-limit metrics", usage: "ratelimits", aliases: [] },
      { name: "reconnectnode", description: "Reconnect one Lavalink node and restore affected players", usage: "reconnectnode <node>", aliases: [] },
      { name: "reconnectallnodes", description: "Reconnect all Lavalink nodes and rebalance players", usage: "reconnectallnodes", aliases: ["forcereconnect"] },
      { name: "switchnode", description: "Move a guild player to a healthier node", usage: "switchnode [guild id]", aliases: [] },
      { name: "fixplayer", description: "Recover one stuck player, voice session, and queue", usage: "fixplayer [guild id]", aliases: ["rejoinvc"] },
      { name: "fixplayers", description: "Scan all guilds and recover broken players", usage: "fixplayers", aliases: [] },
      { name: "recovermusic", description: "Run global music recovery and ghost cleanup", usage: "recovermusic", aliases: [] },
      { name: "recoverqueue", description: "Rebuild or restore a saved queue", usage: "recoverqueue [guild id]", aliases: [] },
      { name: "clearghostplayers", description: "Remove orphaned players and stale queues", usage: "clearghostplayers", aliases: ["nodecleanup"] },
      { name: "playerdebug", description: "Show detailed player recovery state", usage: "playerdebug", aliases: [] },
      { name: "nodestatus", description: "Show node websocket, ping, load, and retry state", usage: "nodestatus", aliases: [] },
      { name: "musicdiagnostics", description: "Show Lavalink, player, queue, and websocket diagnostics", usage: "musicdiagnostics", aliases: [] },
      { name: "restart", description: "Restart the bot process with confirmation", usage: "restart", aliases: ["reboot"] },
      { name: "shutdown", description: "Safely shut down the bot process", usage: "shutdown", aliases: [] },
      { name: "reload", description: "Reload one runtime module", usage: "reload <file>", aliases: ["reloadcmd"] },
      { name: "reloadall", description: "Reload command registry metadata", usage: "reloadall", aliases: [] },
      { name: "reloadmusic", description: "Refresh music runtime state", usage: "reloadmusic", aliases: [] },
      { name: "gbot avatar", description: "Change the bot's GLOBAL avatar", usage: "gbot avatar <url>", aliases: [] },
      { name: "gbot banner", description: "Change the bot's GLOBAL banner", usage: "gbot banner <url>", aliases: [] },
      { name: "gbot name", description: "Change the bot's GLOBAL username", usage: "gbot name <new name>", aliases: [] },
      { name: "gbot status", description: "Set the bot's global activity status", usage: "gbot status <type> <text>", aliases: [] },
      //  Blacklist 
      { name: "blacklist", description: "Globally blacklist a user from the bot", usage: "blacklist @user [reason]", aliases: ["bl"] },
      { name: "unblacklist", description: "Remove a user from the global blacklist", usage: "unblacklist @user", aliases: ["unbl"] },
      { name: "blacklistuser", description: "Globally blacklist a user from the bot", usage: "blacklistuser @user [reason]", aliases: [] },
      { name: "blacklistuser list", description: "List globally blacklisted users", usage: "blacklistuser list [page]", aliases: ["blacklist list"] },
      { name: "unblacklistuser", description: "Remove a user from every blacklist path", usage: "unblacklistuser @user", aliases: [] },
      { name: "blacklistserver", description: "Blacklist a server and force-leave it", usage: "blacklistserver <server id> [reason]", aliases: ["blserver", "bls"] },
      { name: "blacklistserver list", description: "List blacklisted servers", usage: "blacklistserver list [page]", aliases: ["blserver list", "bls list"] },
      { name: "unblacklistserver", description: "Remove a server from the blacklist", usage: "unblacklistserver <server id>", aliases: ["unblserver", "unbls"] },
      //  Lookup 
      { name: "ownersi", description: "Full info on any server by ID", usage: "ownersi <server id>", aliases: ["oserverinfo", "gsi"] },
      { name: "ownerui", description: "Full info on any user by ID", usage: "ownerui @user / <id>", aliases: ["ouserinfo", "gui"] },
      { name: "finduser", description: "Search all cached servers for a username", usage: "finduser <query>", aliases: ["searchuser"] },
      { name: "serverleave", description: "Force the bot to leave a server by ID", usage: "serverleave <server id>", aliases: ["sleave", "leaveguild"] },
      //  Database 
      { name: "dbstats", description: "Show database size and record counts", usage: "dbstats", aliases: ["dbs"] },
      { name: "backupdb", description: "DM yourself a full JSON backup of the database", usage: "backupdb", aliases: ["dbbackup"] },
      { name: "savedb", description: "Force-save the database to disk", usage: "savedb", aliases: [] },
      { name: "forcedbsave", description: "Force-save DB and refresh runtime state", usage: "forcedbsave", aliases: [] },
      { name: "fixdb", description: "Repair and migrate database structure", usage: "fixdb", aliases: [] },
      { name: "resetserver", description: "Wipe all bot data for a specific server", usage: "resetserver <server id>", aliases: ["wipeserver"] },
      { name: "refreshconfig", description: "Refresh one guild's config runtime state", usage: "refreshconfig [guild id]", aliases: ["syncguild"] },
      { name: "refreshcache", description: "Rebuild runtime caches from database", usage: "refreshcache", aliases: [] },
      { name: "clearcache", description: "Clear runtime config/cache state", usage: "clearcache", aliases: [] },
      { name: "clearcollectors", description: "Stop stale component collectors", usage: "clearcollectors [guild id]", aliases: [] },
      { name: "panelrefresh", description: "Invalidate live config panel sessions", usage: "panelrefresh [guild id]", aliases: [] },
      { name: "clearqueues", description: "Clear all active music queues", usage: "clearqueues", aliases: [] },
      //  Dev / Eval 
      { name: "eval", description: "Execute raw JavaScript (dangerous)", usage: "eval <code>", aliases: ["ev"] },
      { name: "exec", description: "Run a shell command and return output (dangerous)", usage: "exec <command>", aliases: ["sh"] },
      //  Premium Management 
      { name: "premium add", description: "Give premium to a user or guild", usage: "premium add <user/guild> <id> <plus/pro/ultra> [days]", aliases: ["prem add"] },
      { name: "premium remove", description: "Revoke premium from a user or guild", usage: "premium remove <user/guild> <id>", aliases: ["prem remove"] },
      { name: "premiumadd", description: "Owner shortcut for premium add", usage: "premiumadd <user/guild> <id> <plan> [days]", aliases: [] },
      { name: "premiumremove", description: "Owner shortcut for premium remove", usage: "premiumremove <user/guild> <id>", aliases: [] },
      { name: "premium list", description: "List all current premium holders", usage: "premium list", aliases: ["prem list"] },
      { name: "premium role give", description: "Give the premium role to a user", usage: "premium role give <@user>", aliases: ["prem role give"] },
      { name: "premium role remove", description: "Remove the premium role from a user", usage: "premium role remove <@user>", aliases: ["prem role remove"] },
      //  No-Prefix Control 
      { name: "npx add", description: "Grant server-only no-prefix access", usage: "npx add <@user>", aliases: [] },
      { name: "snpx add", description: "Grant server-only no-prefix access", usage: "snpx add <@user>", aliases: [] },
      { name: "gnpx add", description: "Grant global no-prefix access", usage: "gnpx add <@user> [duration]", aliases: [] },
      { name: "npx list", description: "List server and global no-prefix users", usage: "npx list", aliases: [] },
      //  Global Controls 
      { name: "broadcast", description: "Announce a message to all servers the bot is in", usage: "broadcast <message>", aliases: ["bcast"] },
      { name: "gtoggle", description: "Global enable/disable panel for all modules", usage: "gtoggle", aliases: ["globaltoggle", "genable", "gdisable"] },
      { name: "totalservers", description: "Rank joined servers by member count", usage: "totalservers [page]", aliases: ["totleserver", "totalserver", "totle", "tserver", "ts"] },
      { name: "link server", description: "Get a server invite by its current rank", usage: "link server <rank>", aliases: [] },
      { name: "premium broadcast", description: "DM all premium role holders an announcement", usage: "premium broadcast <message>", aliases: ["prem broadcast"] },
      //  Points & Rewards 
      { name: "givepoints", description: "Manually award points to a user", usage: "givepoints <@user> <amount> <reason>", aliases: ["givept"] },
      { name: "bugapprove", description: "Award 5 points for an approved bug report", usage: "bugapprove <@user>", aliases: ["bugaccept"] },
      { name: "voteapprove", description: "Award 1 point for a verified vote", usage: "voteapprove <@user>", aliases: ["va"] },
    ]
  }
};

//  Sort ALL_COMMANDS alphabetically by display name (Premium & Owner stay at the end) 
{
  const { premium_features, owner_only, ...rest } = ALL_COMMANDS;
  const sorted = Object.fromEntries(
    Object.entries(rest).sort(([, a], [, b]) => a.name.localeCompare(b.name))
  );
  if (premium_features) sorted.premium_features = premium_features;
  if (owner_only) sorted.owner_only = owner_only;
  Object.keys(ALL_COMMANDS).forEach(k => delete ALL_COMMANDS[k]);
  Object.assign(ALL_COMMANDS, sorted);
}

/* ================= COMMAND SUGGESTION HELPER ================= */
/**
 * Given a typed command, returns up to 3 close matches from ALL_COMMANDS.
 * Uses simple character-overlap scoring – no external package required.
 */
function getSimilarCommands(query) {
  const q = query.toLowerCase();
  const scored = [];

  for (const cat of Object.values(ALL_COMMANDS)) {
    for (const c of cat.commands) {
      const candidates = [c.name, ...(c.aliases || [])];
      for (const name of candidates) {
        const n = name.toLowerCase();
        // Shared-prefix bonus
        let score = 0;
        const shorter = Math.min(q.length, n.length);
        for (let i = 0; i < shorter; i++) {
          if (q[i] === n[i]) score += 2;
          else break;
        }
        // Unordered letter overlap
        const qSet = new Set(q.split(""));
        for (const ch of n) if (qSet.has(ch)) score++;
        // Penalise length difference
        score -= Math.abs(q.length - n.length);

        if (score > 2) scored.push({ name, score, catName: cat.name });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const seen = new Set();
  return scored.filter(s => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  }).slice(0, 3);
}

/* ================= HELP MENU BUILDER ================= */

// ============================================================
//  HELP SYSTEM – Soezy-style with paginated ephemeral pages
// ============================================================

// In-memory page state:  sessionKey -> { category, page }
for (const category of Object.values(ALL_COMMANDS)) {
  category.commands = category.commands.filter(command => !require("./utils/retiredCommands").isRetiredCommand(command.name));
  for (const command of category.commands) {
    command.aliases = (command.aliases || []).filter(alias => !require("./utils/retiredCommands").isRetiredCommand(alias));
  }
}
const helpSessions = new ManagedMap("helpSessions", { ttl: 10 * 60 * 1000, max: 10000 });

const HELP_PAGE_SIZE = 8;  // commands per page

const HELP_MODULE_ORDER = [
  "antinuke", "automod", "autoresponder", "config", "fun", "general", "giveaway",
  "moderation", "music", "whitelist", "roles", "settings", "ticket",
  "voice", "wall", "welcome", "immune", "premium_features", "owner_only",
];

const ALL_COMMANDS_CATEGORY = {
  emoji: featureEmoji("settings"),
  name: "All Commands",
  description: "Browse every command available to you",
};

function isHelpCommandVisible(command, categoryKey, userId, member) {
  if (/^security toggle\b/i.test(command.name)) return false;
  if (categoryKey === "logging" && !canSeeLogs(userId, member)) return false;
  if (categoryKey === "owner_only" && !canSeeOwner(userId)) return false;
  if (canSeeLogs(userId, member)) return true;
  return !command.name.includes("setlogs") && !command.name.includes(" logs") &&
    !command.aliases?.some(alias => alias.includes("setlogs") || alias.includes(" logs"));
}

function getVisibleHelpCommands(categoryKey, userId, member) {
  if (categoryKey === "all_commands") {
    return Object.entries(ALL_COMMANDS).flatMap(([key, category]) =>
      category.commands
        .filter(command => isHelpCommandVisible(command, key, userId, member))
        .map(command => ({ ...command, helpCategory: category.name }))
    );
  }
  const category = ALL_COMMANDS[categoryKey];
  return category
    ? category.commands.filter(command => isHelpCommandVisible(command, categoryKey, userId, member))
    : [];
}

function getHelpCategoryEntries(userId, member, includeOwner = false) {
  const categories = Object.entries(ALL_COMMANDS).filter(([key]) =>
    (key !== "owner_only" || (includeOwner && canSeeOwner(userId))) &&
    (key !== "logging" || canSeeLogs(userId, member))
  );
  return [["all_commands", ALL_COMMANDS_CATEGORY], ...categories];
}

function getHelpNavigationKeys(userId, member) {
  return getHelpModuleEntries(userId, member).map(([key]) => key);
}

function getHelpModuleEntries(userId, member) {
  const available = new Map(getHelpCategoryEntries(userId, member, canSeeOwner(userId)));
  return HELP_MODULE_ORDER.filter(key => available.has(key)).map(key => [key, available.get(key)]);
}

function getHelpOptionEmoji(key, fallback = null) {
  const emojiKeys = {
    all_commands: "utility",
    immune: "whitelist",
    premium_features: "premium",
    owner_only: "owner",
  };
  return getStatusEmojiObject("Feature", emojiKeys[key] || key) || fallback || getStatusEmojiObject("Feature", "settings");
}

// Returns the guild-specific bot avatar if set, otherwise falls back to the global one
function getBotAvatar(guildId, size = 256) {
  const fallback = "https://cdn.discordapp.com/embed/avatars/0.png";
  const guild = guildId ? client.guilds.cache.get(guildId) : null;
  const avatarSize = Math.min(512, size || 512);
  try {
    const guildAvatar = guild?.members?.me?.displayAvatarURL?.({ extension: "png", size: avatarSize });
    if (isValidUrl(guildAvatar)) return guildAvatar;
    const globalAvatar = client.user?.displayAvatarURL?.({ extension: "png", size: avatarSize });
    if (isValidUrl(globalAvatar)) return globalAvatar;
  } catch {
    // Fall through to the configured avatar or Discord's default avatar.
  }
  const configuredAvatar = guildId && db.guilds?.[guildId]?.guildBotIdentity?.avatar;
  return configuredAvatar && isValidUrl(configuredAvatar) ? configuredAvatar : fallback;
}

function getBotBanner(guildId, size = 1024) {
  const guildBanner = guildId && db.guilds?.[guildId]?.guildBotIdentity?.banner;
  if (guildBanner && isValidUrl(guildBanner)) return guildBanner;
  try {
    const url = client.user?.bannerURL?.({ dynamic: true, size: Math.min(4096, size || 1024) });
    return isValidUrl(url) ? url : "";
  } catch {
    return "";
  }
}

Object.assign(globalThis, { getBotAvatar, getBotBanner });

function getRolePermissionBadges(role) {
  const p = role.permissions;
  const badges = [];
  if (p.has(PermissionsBitField.Flags.Administrator)) badges.push("🛡️ Admin");
  if (p.has(PermissionsBitField.Flags.ManageGuild) || p.has(PermissionsBitField.Flags.ManageRoles) || p.has(PermissionsBitField.Flags.ManageChannels)) badges.push("⚒️ Staff");
  if (p.has(PermissionsBitField.Flags.BanMembers) || p.has(PermissionsBitField.Flags.KickMembers) || p.has(PermissionsBitField.Flags.ModerateMembers)) badges.push("🔨 Moderator");
  if (p.has(PermissionsBitField.Flags.MentionEveryone)) badges.push("⚠️ Dangerous");
  if (p.has(PermissionsBitField.Flags.ManageMessages) || p.has(PermissionsBitField.Flags.ViewAuditLog)) badges.push("🎫 Support");
  return badges.length ? badges : ["<:tick:1559236522711187577> Basic"];
}

function buildRoleInfoContainer(role, guild, requester = null) {
  const color = role.color || getThemeColor(guild?.id);
  const totalRoles = Math.max(1, guild?.roles?.cache?.size || 1);
  const hierarchyPosition = `${role.position}/${totalRoles}`;
  const topPercent = Math.max(1, Math.round(((totalRoles - role.position) / totalRoles) * 100));
  const dangerousMap = [
    ["Administrator", PermissionsBitField.Flags.Administrator],
    ["Manage Roles", PermissionsBitField.Flags.ManageRoles],
    ["Manage Guild", PermissionsBitField.Flags.ManageGuild],
    ["Ban Members", PermissionsBitField.Flags.BanMembers],
    ["Kick Members", PermissionsBitField.Flags.KickMembers],
    ["Moderate Members", PermissionsBitField.Flags.ModerateMembers],
    ["Mention Everyone", PermissionsBitField.Flags.MentionEveryone],
  ];
  const dangerous = dangerousMap.filter(([, flag]) => role.permissions.has(flag)).map(([name]) => name);
  const botMember = guild?.members?.me;
  const botCanManage = Boolean(botMember && role.editable && botMember.roles.highest.position > role.position);
  const integrationRole = Boolean(role.tags?.botId || role.tags?.integrationId || role.tags?.subscriptionListingId);
  const iconUrl = role.iconURL?.({ extension: "png", size: 128 }) || getBotAvatar(guild?.id, 128);
  const permissions = role.permissions.toArray();
  const permPreview = permissions.length ? permissions.slice(0, 12).map(p => `\`${p}\``).join(" ") : "`None`";

  const YES = EMOJIS.success;
  const NO  = EMOJIS.error;

  return new ContainerBuilder()
    .addSectionComponents(section =>
      section
        .addTextDisplayComponents(t => t.setContent(
          `## ${role.name}\n` +
          `**Mention:** ${role}\n` +
          `**Role ID:** \`${role.id}\`\n` +
          `**Color:** \`${role.hexColor}\``
        ))
        .setThumbnailAccessory(th => th.setURL(iconUrl))
    )
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(
      `**General**\n` +
      `**Members:** \`${role.members.size}\`\n` +
      `**Position:** \`${role.position}\`\n` +
      `**Hoisted:** ${role.hoist ? `${YES} Yes` : `${NO} No`}\n` +
      `**Mentionable:** ${role.mentionable ? `${YES} Yes` : `${NO} No`}\n` +
      `**Managed:** ${role.managed ? `${YES} Yes` : `${NO} No`}\n` +
      `**Integration Role:** ${integrationRole ? `${YES} Yes` : `${NO} No`}\n` +
      `**Created:** <t:${Math.floor(role.createdTimestamp / 1000)}:F>`
    ))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(
      `**Power Analysis**\n` +
      `${dangerous.length ? `${NO} **Dangerous Role**` : `${YES} **Safe Role**`}\n` +
      `**Badges:** ${getRolePermissionBadges(role).join("  ")}\n` +
      `**Dangerous Permissions:** ${dangerous.length ? dangerous.map(p => `\`${p}\``).join(", ") : "`None`"}\n` +
      `**Permissions:** ${permPreview}${permissions.length > 12 ? ` +${permissions.length - 12} more` : ""}`
    ))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(
      `**Hierarchy**\n` +
      `**Bot Can Manage:** ${botCanManage ? `${YES} Yes` : `${NO} No`}\n` +
      `**Hierarchy Position:** \`${hierarchyPosition}\`\n` +
      `**Rank:** Top \`${topPercent}%\` Role`
    ))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t => t.setContent(`-# Requested by ${requester?.username || requester?.tag || "Unknown"} • <t:${Math.floor(Date.now() / 1000)}:t>`));
}

function getDisplayHelpPrefix(guildId) {
  const prefix = guildId ? getPrefix(guildId) : DEFAULT_PREFIX;
  return String(prefix || DEFAULT_PREFIX || "!").trim() || "!";
}

function getBotDisplayName(guildId) {
  const guild = guildId ? client.guilds.cache.get(guildId) : null;
  const configuredName = guildId && db.guilds?.[guildId]?.guildBotIdentity?.nickname;
  return configuredName || guild?.members?.me?.displayName || client.user?.globalName || client.user?.username || "Soezy";
}

// Help uses the shared reply container so it stays aligned with the original
// bot-wide error/success presentation.
function buildHelpErrorContainer(title, message) {
  return createErrorContainer(title, message);
}

function isHelpCommandKnown(commandName) {
  const requestedName = String(commandName || "").trim().toLowerCase();
  return Object.values(ALL_COMMANDS).some(category =>
    category.commands.some(command =>
      command.name.toLowerCase() === requestedName ||
      command.aliases.some(alias => alias.toLowerCase() === requestedName)
    )
  );
}

function buildMainHelpContainer(guildId, userId, member) {
  const PREFIX = getDisplayHelpPrefix(guildId);
  const botName = getBotDisplayName(guildId);
  const botAvatar = getBotAvatar(guildId, 256) || client.user?.displayAvatarURL({ dynamic: true, size: 256 });

  // Count prefix-based commands from ALL_COMMANDS registry
  const prefixCommands = Object.values(ALL_COMMANDS).reduce((acc, cat) => acc + cat.commands.length, 0);
  // The legacy help menu reports the prefix command inventory only.
  const totalCommands = prefixCommands;

  // Hide owner commands from normal users, but show the Owner module to real owners.
  const entries = getHelpModuleEntries(userId, member);
  const moduleNames = {
    general: "General",
    autoresponder: "Auto Respond & React",
    roles: "Roles",
    settings: "Settings",
    wall: "Wall System",
    welcome: "Welcome & Goodbye",
    immune: "Whitelist",
    premium_features: "Premium",
    owner_only: "Owner",
  };
  const moduleLines = entries.map(([key, cat]) =>
    `> ${cat.emoji} **\u00bb ${moduleNames[key] || cat.name}**`
  ).join("\n");

  const options = entries.slice(0, 25).map(([key, cat]) => ({
    label: moduleNames[key] || cat.name,
    description: cat.description.slice(0, 100),
    value: key,
    emoji: getHelpOptionEmoji(key, cat.emoji)
  }));

  const selectMenu = typeof createSafeSelectMenu === "function"
    ? createSafeSelectMenu({ customId: `help_category_${userId || "unknown"}`, placeholder: "> Select Module From Here", options })
    : new StringSelectMenuBuilder().setCustomId(`help_category_${userId || "unknown"}`).setPlaceholder("> Select Module From Here").addOptions(options);

  const selectRow = new ActionRowBuilder().addComponents(selectMenu);

  const container = new ContainerBuilder()
    .addSectionComponents(section =>
      section
        .addTextDisplayComponents(text =>
          text.setContent(
            `## Hey, I'm ${botName.replace(/™$/, "")}™\n` +
            `A powerful multipurpose bot`
          )
        )
        .setThumbnailAccessory(thumb =>
          thumb.setURL(botAvatar)
        )
    )
    .addTextDisplayComponents(text => text.setContent(
      `• **My Prefix is** \`${PREFIX}\`\n` +
      `• **Total Commands:** \`${totalCommands}\`\n` +
      `• **Choose a Specific Module of your Desire**`
    ))
    .addTextDisplayComponents(text =>
      text.setContent(moduleLines)
    )
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(text =>
      text.setContent(
        `${EMOJIS.loading || "<a:loading:1559133110472286298>"} **Links**\n` +
        `[Invite Me](https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands) | ` +
        `[Support Server](https://discord.gg/PJfTdSu95y) | ` +
        `[Website](https://soezy-dashboard.vercel.app)`
      )
    )
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(selectRow)
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(text => text.setContent("-# *Designed by youknowntg*"));

  return container;
}

function buildMainHelpEmbed(botAvatar, guildId) {
  return null; // replaced by buildMainHelpContainer
}

function buildHelpComponents(PREFIX, userId, member) {
  const options = getHelpModuleEntries(userId, member)
    .slice(0, 25).map(([key, cat]) => ({
      label: cat.name,
      description: cat.description.slice(0, 100),
      value: key,
      emoji: getHelpOptionEmoji(key)
    }));

  const selectMenu = typeof createSafeSelectMenu === "function"
    ? createSafeSelectMenu({ customId: `help_category_${userId || "unknown"}`, placeholder: "Select a module", options })
    : new StringSelectMenuBuilder().setCustomId(`help_category_${userId || "unknown"}`).setPlaceholder("Select a module").addOptions(options);

  return [new ActionRowBuilder().addComponents(selectMenu)];
}


// Same as buildHelpComponents but pre-selects a category (shows selected module in dropdown)
function buildHelpComponentsWithSelected(PREFIX, selectedKey, userId, member) {
  const options = getHelpModuleEntries(userId, member)
    .slice(0, 25).map(([key, cat]) => ({
      label: cat.name,
      description: cat.description.slice(0, 100),
      value: key,
      default: key === selectedKey,
      emoji: getHelpOptionEmoji(key)
    }));

  const selectMenu = typeof createSafeSelectMenu === "function"
    ? createSafeSelectMenu({ customId: `help_category_${userId || "unknown"}`, placeholder: "Select a module", options })
    : new StringSelectMenuBuilder().setCustomId(`help_category_${userId || "unknown"}`).setPlaceholder("Select a module").addOptions(options);

  return [new ActionRowBuilder().addComponents(selectMenu)];
}

/**
/* 
   SECTION-AWARE PAGINATION
   Each section marker always starts on a fresh page so headers
   are never orphaned mid-page (e.g. Confessions starting at the
   bottom of a Leaderboards page).
 */

/**
 * Per-module section definitions.
 * marker  → the command name that opens that section (must be first cmd in the group)
 * header  → the bold label injected above that command when rendering
 */
const MODULE_SECTIONS = {
  moderation: [
    { marker: "extraowner add", header: "### Extra Owner Management" },
    { marker: "ban", header: "### Member Moderation" },
    { marker: "warnings", header: "### Warnings" },
    { marker: "purge", header: "### Message Cleanup" },
    { marker: "autojail", header: "### Automated Safety" },
    { marker: "lock", header: "### Channel Controls" },
    { marker: "fban", header: "### Fake Actions & Message History" },
    { marker: "hide", header: "### Channel Visibility" },
  ],
  general: [
    { marker: "afk", header: `### AFK` },
    { marker: "confession enable", header: "### Confessions" },
    { marker: "boost enable", header: "### Boost" },
    { marker: "birthday config", header: "### Birthday" },
    { marker: "steal", header: "### Emoji & Sticker" },
    { marker: "sticky enable", header: "### Sticky Messages" },
    { marker: "media enable", header: "### Media" },
    { marker: "mypoints", header: "### Points" },
  ],
  antinuke: [
    { marker: "antinuke snapshot", header: "### Anti-Nuke" },
    { marker: "antiraid enable", header: "### Anti-Raid" },
    { marker: "verify config", header: "### Verify" },
    { marker: "warnpunish enable", header: "### Warn Escalation" },
    { marker: "muteevasion enable", header: "### Mute Evasion" },
    { marker: "security enable",                    header: "### Security" },
    { marker: "lockdown on",                         header: "### Lockdown & Role Lock" },
    { marker: "security blacklist @user|ID|name",    header: "### User Management" },
  ],
  automod: [
    { marker: "automod config", header: "### AutoMod Settings" },
    { marker: "badword", header: "### Content Filters" },
    { marker: "antimention", header: "### Mention Protection" },
  ],
  welcome: [
    { marker: "welcome config", header: "### Welcome" },
    { marker: "goodbye enable", header: "### Goodbye" },
    { marker: "joindm enable", header: "### Join DM" },
  ],
  config: [],
  immune: [],
  music: [
    { marker: "play", header: "### Playback" },
    { marker: "queue", header: "### Queue" },
    { marker: "playlist create", header: "### Playlists" },
    { marker: "lyrics", header: "### Info & Lyrics" },
    { marker: "djrole", header: "### DJ & Config" },
  ],
  premium_features: [
    { marker: "premium status", header: "### Premium Access" },
    { marker: "premium raidmode", header: "### Security & Anti-Nuke" },
    { marker: "premium workflow create", header: "### Automation" },
    { marker: "premium channel create", header: "### Server Perks & Roles" },
    { marker: "custombg", header: "### Personalization" },
    { marker: "premiumchannel", header: "### Exclusivity" },
  ],
  owner_only: [
    { marker: "ownerhelp", header: "### Owner Commands" },
    { marker: "botstats", header: "### Bot Statistics" },
    { marker: "dev", header: "### Team Lists" },
    { marker: "memory", header: "### Runtime & Diagnostics" },
    { marker: "reconnectnode", header: "### Music Nodes" },
    { marker: "restart", header: "### Bot Operations" },
    { marker: "gbot avatar", header: "### Bot Identity" },
    { marker: "blacklist", header: "### Access Control" },
    { marker: "ownersi", header: "### Server Access" },
    { marker: "dbstats", header: "### Database" },
    { marker: "clearcache", header: "### Cache & Collectors" },
    { marker: "premium add", header: "### Premium Management" },
    { marker: "npx add", header: "### No-Prefix Control" },
    { marker: "gtoggle", header: "### Global Controls" },
    { marker: "givepoints", header: "### Points & Rewards" },
    { marker: "bugapprove", header: "### Reviews & Voting" },
  ],
  settings: [
    { marker: "botset name", header: "### Bot Identity" },
    { marker: "help", header: "### Help & Commands" },
    { marker: "avatar", header: "### Profiles & Server Information" },
    { marker: "poll", header: "### Community Tools" },
    { marker: "embed list", header: "### Embed Builder" },
    { marker: "disablechannel", header: "### Channel Controls" },
    { marker: "badword add", header: "### Bad Word Filter" },
    { marker: "nsfwword add", header: "### NSFW Filter" },
  ],
  autoresponder: [
    { marker: "autoresponder add", header: "### Auto Responders" },
    { marker: "autoreact add", header: "### Auto Reactions" },
  ],
  ticket: [
    { marker: "ticket enable", header: "### Ticket Setup" },
    { marker: "ticket send", header: "### Ticket Management" },
    { marker: "ticket template add", header: "### Ticket Templates" },
  ],
  giveaway: [
    { marker: "giveaway enable", header: "### Giveaway Settings" },
    { marker: "giveaway create", header: "### Giveaway Management" },
    { marker: "giveaway requirerole", header: "### Entry Requirements" },
  ],
  fun: [
    { marker: "fun enable", header: "### Fun Settings" },
    { marker: "8ball", header: "### Text & Social" },
    { marker: "image petpet", header: "### Image Effects" },
    { marker: "slap", header: "### Reactions" },
    { marker: "tictactoe", header: "### Games" },
  ],
  logging: [
    { marker: "logging config", header: "### Log Configuration" },
  ],
  voice: [
    { marker: "tempvoice enable", header: "### Temporary Voice" },
    { marker: "voice limit", header: "### Voice Channel Controls" },
    { marker: "tempsettings", header: "### Voice Settings" },
  ],
  wall: [
    { marker: "wall enable", header: "### Wall Protection" },
    { marker: "jail setup", header: "### Jail Setup" },
    { marker: "wall quarantine", header: "### Quarantine & Release" },
  ],
  roles: [
    { marker: "role list", header: "### Role Utilities" },
    { marker: "buttonrole create", header: "### Button Roles" },
    { marker: "customrole enable", header: "### Custom Roles" },
    { marker: "autorole add", header: "### Auto Roles" },
    { marker: "humanrole add", header: "### Member Role Assignment" },
    { marker: "rr create", header: "### Reaction Roles" },
    { marker: "vanityrole status", header: "### Vanity & Tag Roles" },
  ],
  config: [
    { marker: "welcome config", header: "### Welcome & Onboarding" },
    { marker: "prefix config", header: "### Server Basics" },
    { marker: "warn config", header: "### Moderation" },
    { marker: "automod config", header: "### AutoMod" },
    { marker: "logging config", header: "### Logging" },
    { marker: "ticket config", header: "### Tickets" },
    { marker: "tempvoice config", header: "### Voice" },
    { marker: "giveaway config", header: "### Giveaways" },
    { marker: "confession config", header: "### Community" },
    { marker: "wall config", header: "### Wall Protection" },
    { marker: "dashboard", header: "### Dashboard" },
  ],
  whitelist: [
    { marker: "whitelist user add", header: "### User & Role Exemptions" },
    { marker: "antinuke whitelist", header: "### Anti-Nuke" },
    { marker: "security whitelist add", header: "### Security" },
    { marker: "botgrant", header: "### Bot Access" },
    { marker: "wall setwhitelist", header: "### Wall Protection" },
    { marker: "badwordwhitelist addrole", header: "### Bad Word Filters" },
    { marker: "nsfwwhitelist enable", header: "### NSFW Filters" },
    { marker: "antilink whitelist", header: "### Anti-Link" },
    { marker: "filterwhitelist", header: "### AutoMod Filters" },
  ],
};

/**
 * Splits a flat command list into pages where:
 *  - Each section marker always lands at the TOP of a new page
 *  - Pages are capped at `pageSize` commands
 * For modules with no sections this degrades to normal slicing.
 */
function buildSectionAwarePages(visibleCmds, catKey, pageSize) {
  const sectionMarkers = new Set(
    (MODULE_SECTIONS[catKey] || []).map(s => s.marker)
  );

  const pages = [];
  let current = [];

  for (const cmd of visibleCmds) {
    const isMarker = sectionMarkers.has(cmd.name);

    // Section boundary: flush current page before starting the new section
    if (isMarker && current.length > 0) {
      pages.push(current);
      current = [];
    }
    // Natural page-size boundary (only if not at a section start we just flushed)
    else if (current.length >= pageSize) {
      pages.push(current);
      current = [];
    }

    current.push(cmd);

    // If the page filled up exactly after adding this cmd, flush immediately
    // so the next cmd (potentially a section marker) gets a clean slate
    if (current.length >= pageSize) {
      pages.push(current);
      current = [];
    }
  }

  if (current.length > 0) pages.push(current);
  if (pages.length === 0) pages.push([]);
  return pages;
}

/**
 * Given a category key and a search query (command name or alias),
 * returns the 0-indexed page where that command appears.
 * Uses section-aware pagination so the result matches buildCategoryPage exactly.
 */
function findCommandPage(catKey, query, userId, member) {
  if (catKey !== "all_commands" && !ALL_COMMANDS[catKey]) return 0;
  const visibleCmds = getVisibleHelpCommands(catKey, userId, member);

  const q = query.toLowerCase();
  const pages = buildSectionAwarePages(visibleCmds, catKey, HELP_PAGE_SIZE);

  for (let p = 0; p < pages.length; p++) {
    const found = pages[p].some(cmd =>
      cmd.name.toLowerCase() === q ||
      cmd.name.toLowerCase().startsWith(q) ||
      cmd.aliases?.some(a => a.toLowerCase() === q || a.toLowerCase().startsWith(q))
    );
    if (found) return p;
  }
  return 0;
}

// Build a paginated category container – Components V2
function buildCategoryPage(catKey, page, requesterId, guildId, userId, member) {
  const PREFIX = getDisplayHelpPrefix(guildId);
  const cat = catKey === "all_commands" ? ALL_COMMANDS_CATEGORY : ALL_COMMANDS[catKey];
  if (!cat) return null;

  // Block non-owners from accessing the owner_only category directly
  if (catKey === "owner_only" && !canSeeOwner(userId)) return null;

  const visibleCmds = getVisibleHelpCommands(catKey, userId, member);

  // Build section-aware pages – sections always start on a fresh page
  const pages = buildSectionAwarePages(visibleCmds, catKey, HELP_PAGE_SIZE);
  const totalPages = pages.length;
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const slice = pages[safePage];

  // Section header lookup for this module
  const sectionMap = new Map(
    (MODULE_SECTIONS[catKey] || []).map(s => [s.marker, s.header])
  );

  //  Category-specific header title 
  let headerTitle;
  if (catKey === "premium_features") {
    headerTitle = `${featureEmoji("premium")} **Premium**`;
  } else if (catKey === "owner_only") {
    headerTitle = `${cat.emoji} **Owner**`;
  } else if (catKey === "all_commands") {
    headerTitle = `${cat.emoji} **All Commands**`;
  } else {
    headerTitle = `${cat.emoji} **${cat.name}**`;
  }
  // Quote only the command; keep its description on a separate unquoted line.
  let cmdText = "";
  let lastHelpCategory = null;
  for (const cmd of slice) {
    if (cmd.helpCategory && cmd.helpCategory !== lastHelpCategory) {
      cmdText += `### __**${cmd.helpCategory}**__\n`;
      lastHelpCategory = cmd.helpCategory;
    }
    const header = sectionMap.get(cmd.name);
    if (header) {
      cmdText += `${header.replace(/^(#{1,6})\s+(.+)$/, "$1 __**$2**__")}\n`;
    }
    cmdText += `> **\`${PREFIX}${cmd.usage}\`**\n`;
    cmdText += `\u276f **${cmd.description}**\n`;
    cmdText += "\n";
  }

  // Build select menu (pre-selected on current category)
  const options = getHelpModuleEntries(userId, member)
    .slice(0, 25).map(([key, c]) => ({
      label: c.name,
      description: c.description.slice(0, 100),
      value: key,
      default: key === catKey,
      emoji: getHelpOptionEmoji(key)
    }));
  const selectMenu = typeof createSafeSelectMenu === "function"
    ? createSafeSelectMenu({ customId: `help_category_${userId || "unknown"}`, placeholder: "> Select Module From Here", options })
    : new StringSelectMenuBuilder().setCustomId(`help_category_${userId || "unknown"}`).setPlaceholder("> Select Module From Here").addOptions(options);
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);

  // Header (title + thumbnail) is a SectionComponent.
  // Command list is a SEPARATE full-width TextDisplayComponent so text
  // is never cramped by the thumbnail column.
  const container = new ContainerBuilder()
    .addSectionComponents(section =>
      section
        .addTextDisplayComponents(text =>
          text.setContent(`# ${headerTitle}`)
        )
        .setThumbnailAccessory(thumb =>
          thumb.setURL(getBotAvatar(guildId, 256))
        )
    )
    .addTextDisplayComponents(text => text.setContent(cmdText.trimEnd()))
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(selectRow);

  return { container, page: safePage, totalPages };
}

function buildHelpPageButtons(sessionKey, page, totalPages, catKey, userId = null, member = null) {
  const atFirst = page === 0;
  const atLast = page >= totalPages - 1;

  // Get module index for prev/next module switching
  const allKeys = getHelpNavigationKeys(userId || sessionKey.split("_")[0], member);
  const catIndex = allKeys.indexOf(catKey);
  const atFirstModule = catIndex <= 0;
  const atLastModule = catIndex >= allKeys.length - 1;

  // Layout: â—€ prev module | â† prev page | ðŸ  home | next page → | next module â–¶
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`help_prevmod_${sessionKey}`)
      .setEmoji(getStatusEmojiObject("Help", "backword"))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(atFirstModule),
    new ButtonBuilder()
      .setCustomId(`help_prev_${sessionKey}`)
      .setEmoji(getStatusEmojiObject("Help", "back"))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(atFirst),
    new ButtonBuilder()
      .setCustomId(`help_main_${sessionKey.split("_")[0]}`)
      .setEmoji(getStatusEmojiObject("Help", "home"))
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`help_next_${sessionKey}`)
      .setEmoji(getStatusEmojiObject("Help", "next"))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(atLast),
    new ButtonBuilder()
      .setCustomId(`help_nextmod_${sessionKey}`)
      .setEmoji(getStatusEmojiObject("Help", "forward"))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(atLastModule)
  );
}

/*  CMD → CATEGORY MAP (used by showCmdHelp)  */
const CMD_HELP_MAP = {
  all: "all_commands", allcommands: "all_commands", commands: "all_commands",
  //  Moderation 
  moderation: "moderation",
  ban: "moderation", unban: "moderation", kick: "moderation",
  mute: "moderation", timeout: "moderation", unmute: "moderation", untimeout: "moderation",
  warn: "moderation", warnings: "moderation", warns: "moderation",
  banlist: "moderation", bans: "moderation",
  kicklist: "moderation", kicks: "moderation",
  mutelist: "moderation", mutes: "moderation", timeoutlist: "moderation",
  clearwarns: "moderation", clearwarnings: "moderation", delwarns: "moderation",
  removewarn: "moderation", delwarn: "moderation", unwarn: "moderation",
  purge: "moderation", clear: "moderation", prune: "moderation", vcclean: "moderation", cuc: "moderation", cl: "moderation",
  autojail: "moderation", "setup-auto-jail": "moderation", "disable-auto-jail": "moderation", "auto-jail-status": "moderation",
  infect: "moderation",
  saj: "moderation", "auto-jail-setup": "moderation",
  daj: "moderation", "auto-jail-disable": "moderation",
  ajs: "moderation", "auto-jail-stats": "moderation",
  lock: "moderation", unlock: "moderation",
  slowmode: "moderation", slow: "moderation",
  nuke: "moderation",
  //  Hide / Unhide 
  hide: "moderation", unhide: "moderation",
  //  Anti-Nuke 
  antinuke: "antinuke", an: "antinuke",
  "antinuke whitelist": "whitelist", "antinuke unwhitelist": "whitelist",
  "antinuke setwhitelist": "immune", "antinuke removewhitelist": "immune",
  "antinuke whitelistlist": "immune", "antinuke wllist": "immune",
  //  Anti-Raid 
  antiraid: "antinuke", raidmode: "antinuke",
  //  Account Age Gate 
  agegate: "antinuke", accountage: "antinuke",
  //  Verify 
  verify: "antinuke", verification: "antinuke",
  //  Warn Escalation 
  warnpunish: "antinuke", warnescalate: "antinuke",
  //  Mute Evasion 
  muteevasion: "antinuke", antievasion: "antinuke",
  //  Anti-Bot (merged into Auto-Mod) 
  antibot: "automod", ab: "automod",
  "antibot whitelist": "whitelist", "antibot unwhitelist": "whitelist",
  //  Auto-Mod / Anti-Link 
  automod: "automod", automode: "automod", am: "automod",
  antilink: "automod", al: "automod", antinlink: "automod", antinlinl: "automod",
  "antilink whitelist": "whitelist", "antilink unwhitelist": "whitelist",
  "antinlink whitelist": "whitelist", "antinlinl whitelist": "whitelist",
  //  Logging 
  logging: "logging", logs: "logging",
  //  Welcome 
  welcome: "welcome",
  //  Goodbye (merged into Welcome) 
  goodbye: "welcome", bye: "welcome",
  //  Boost (merged into General) 
  boost: "general",
  //  Ticket 
  ticket: "ticket",
  "ticket claim": "ticket", "ticket unclaim": "ticket",
  "ticket rate": "ticket", "ticket rating": "ticket",
  "ticket template": "ticket",
  //  Giveaway 
  giveaway: "giveaway", gw: "giveaway",
  gcreate: "giveaway", gstart: "giveaway",
  gend: "giveaway", greroll: "giveaway", gall: "giveaway",
  gcancel: "giveaway", glist: "giveaway",
  "gw create": "giveaway", "gw end": "giveaway", "gw reroll": "giveaway",
  "gw cancel": "giveaway", "gw list": "giveaway", "gw enable": "giveaway",
  "gw disable": "giveaway", "gw settings": "giveaway", "gw requirerole": "giveaway",
  "gw winnerdm": "giveaway",
  "giveaway requirerole": "giveaway", "giveaway winnerdm": "giveaway",
  "giveaway create": "giveaway", "giveaway end": "giveaway",
  "giveaway reroll": "giveaway", "giveaway cancel": "giveaway",
  "giveaway list": "giveaway",
  //  Emoji / Sticker / Sticky (merged into General) 
  emojisticker: "general",
  sticky: "general",
  steal: "general", stealsticker: "general", ss: "general",
  stealemoji: "general", se: "general", addemoji: "general", ae: "general",
  deleteemoji: "general", delemoji: "general", removeemoji: "general",
  enlarge: "general", jumbo: "general", big: "general", bigemoji: "general",
  emojis: "general", emojilist: "general", listemojis: "general",
  stickers: "general", stickerlist: "general", liststickers: "general",
  //  Auto Responder 
  autoresponder: "autoresponder",
  //  Voice (merged with Temp Voice) 
  voice: "voice", vc: "voice",
  tempvoice: "voice", tv: "voice",
  //  Permit 
  whitelist: "whitelist", wl: "whitelist", permit: "whitelist", immune: "whitelist",
  //  Media 
  media: "general", mediaonly: "general",
  //  AFK (now part of General) 
  afk: "general",
  //  Birthday (merged into General) 
  birthday: "general", bday: "general",
  //  Reports (merged into Settings) 
  //  Wall 
  wall: "wall",
  quarantine: "wall", q8: "wall", jail: "wall",
  release: "wall", unquarantine: "wall", unjail: "wall",
  "wall whitelist": "whitelist", "wall unwhitelist": "whitelist", "wall setwhitelist": "whitelist",
  "wall removewhitelist": "immune", "wall whitelistlist": "immune", "wall wllist": "immune",
  //  Fun 
  fun: "fun",
  hug: "fun", kiss: "fun", peck: "fun", pat: "fun", headpat: "fun",
  slap: "fun", cuddle: "fun", snuggle: "fun", poke: "fun",
  wave: "fun", hi: "fun", bite: "fun", cry: "fun",
  dance: "fun", blush: "fun", smile: "fun",
  highfive: "fun", hi5: "fun", bonk: "fun", yeet: "fun", bully: "fun", torture: "fun",
  punch: "fun", kill: "fun", wink: "fun", pout: "fun",
  laugh: "fun", lol: "fun", confused: "fun", huh: "fun",
  sleep: "fun", zzz: "fun", run: "fun", lick: "fun",
  stare: "fun", thumbsup: "fun", thumbs: "fun",
  facepalm: "fun", fp: "fun", shrug: "fun",
  boop: "fun", nom: "fun", handhold: "fun", holdhands: "fun",
  tickle: "fun", feed: "fun", angry: "fun", sleepy: "fun",
  extremkiss: "fun", extremhug: "fun", extremslap: "fun", fuck: "fun",
  meme: "fun", joke: "fun", fact: "fun", quote: "fun",
  "8ball": "fun", eightball: "fun", ask: "fun",
  roast: "fun", meme: "fun", pickupline: "fun", gayrate: "fun", howgay: "fun", simprate: "fun", howsimp: "fun", howhot: "fun", iq: "fun",
  cuterate: "fun", howcute: "fun", hornyrate: "fun", howhorny: "fun", lesbianrate: "fun", howlesbian: "fun", prettyrate: "fun", howpretty: "fun", babyrate: "fun", howbaby: "fun",
  crazyrate: "fun", howcrazy: "fun", susrate: "fun", howsus: "fun", uglyrate: "fun", howugly: "fun", niggarate: "fun", hownigga: "fun", simpcheck: "fun", lovemeter: "fun",
  choose: "fun", pick: "fun", decide: "fun",
  reverse: "fun", mock: "fun",
  ship: "fun", love: "fun", match: "fun", rate: "fun",
  connect4: "fun", c4: "fun",
  hint: "fun",
  scramble: "fun",
  wordchain: "fun", wc: "fun",
  tictactoe: "fun", ttt: "fun",
  //  Roles 
  roles: "roles",
  autorole: "roles", ar: "roles",
  humanrole: "roles", humanroles: "roles",
  "human role": "roles", "human role add": "roles", "human role remove": "roles",
  botrole: "roles", botroles: "roles",
  "bot role": "roles", "bot role add": "roles", "bot role remove": "roles",
  massrole: "roles", massroles: "roles",
  "mass role": "roles", "mass role add": "roles", "mass role remove": "roles",
  memberrole: "roles", memberroles: "roles",
  removerole: "roles", rr: "roles", removeroleall: "roles", rra: "roles",
  "member role": "roles", "member role add": "roles", "member role remove": "roles",
  buttonrole: "roles", br: "roles",
  customrole: "roles", cr: "roles",
  reactionrole: "roles", rr: "roles",
  //  General (economy, confession, counting, invites, joindm, autoreact) 
  general: "general",
  daily: "general", work: "general",
  mypoints: "general", points: "general", pts: "general",
  invitepoints: "general", invitepts: "general", ipoints: "general",
  myitems: "general", activeitems: "general", myperks: "general",
  setbotavatar: "general", setbotbanner: "general",
  shop: "general", buy: "general", additem: "general", addshopitem: "general", removeitem: "general", delitem: "general", deleteitem: "general",
  lb: "general",
  "lb points": "general",
  heist: "general",
  confession: "general", confess: "general",
  joindm: "welcome",
  autoreact: "autoresponder",
  //  ✨ Premium Commands 
  premium_features: "premium_features",
  premium: "premium_features", prem: "premium_features",
  // Personalization
  custombg: "premium_features",
  theme: "premium_features",
  botpfp: "premium_features",
  rotateavatar: "premium_features", rotavatar: "premium_features",
  // Stats & Tracking (removed – activity/msggraph/serverreport/retentionreport not implemented)
  birthdayrole: "premium_features",
  // Economy Games
  // Exclusivity
  premiumchannel: "premium_features",
  // lockchannel → music (the premium version is premiumchannel; "lockchannel premium" is its alias)
  premiumrole: "premium_features",
  del: "premium_features",
  // "del dm" → moved to owner_only
  vouchsystem: "premium_features", vouch: "premium_features",
  "vouch lb": "premium_features", "vouch check": "premium_features",
  "vouchsystem lb": "premium_features", "vouchsystem check": "premium_features",
  "premiumchannel remove": "premium_features",
  "premium channel create": "premium_features", "premium vc create": "premium_features",
  "premium role set": "premium_features", "premium role list": "premium_features",
  // "premium role give"/"premium role remove" → moved to owner_only
  "premium status": "premium_features", "premium plans": "premium_features",
  "premium bio": "premium_features",
  "premium raidmode": "premium_features", "prem raidmode": "premium_features",
  "premium roleguard": "premium_features", "prem roleguard": "premium_features",
  "premium webhookguard": "premium_features", "prem webhookguard": "premium_features",
  "premium botguard": "premium_features", "prem botguard": "premium_features",
  "premium joinshield": "premium_features", "prem joinshield": "premium_features",
  "premium actionlog": "premium_features", "prem actionlog": "premium_features",
  "premium alertrole": "premium_features", "prem alertrole": "premium_features",
  "premium trustscore": "premium_features", "prem trustscore": "premium_features",
  "premium restore": "premium_features", "prem restore": "premium_features",
  "premium panic": "premium_features", "prem panic": "premium_features",
  "premium workflow": "premium_features", "prem workflow": "premium_features",
  "premium autorole": "premium_features", "prem autorole": "premium_features",
  "premium autothread": "premium_features", "prem autothread": "premium_features",
  "premium autoping": "premium_features", "prem autoping": "premium_features",
  "premium cleanup": "premium_features", "prem cleanup": "premium_features",
  "premium autoreplypro": "premium_features", "prem autoreplypro": "premium_features",
  "premium welcome": "premium_features", "prem welcome": "premium_features",
  "premium help": "premium_features",
  "prem security": "antinuke", "prem help": "premium_features",
  "premium add": "owner_only", "premium remove": "owner_only", "premium list": "owner_only",
  "premium role give": "owner_only", "premium role remove": "owner_only",
  "premium broadcast": "owner_only",
  //  Security gate (premium-tiered) 
  warnexpiry: "antinuke",
  warnappeal: "antinuke",
  "antibot queue": "antinuke",
  "antibot autorevokeperms": "antinuke",
  "antiraid ratelimit": "antinuke",
  "antiraid schedule": "antinuke",
  "antinuke webhookprotect": "antinuke",
  "antinuke rolerestore": "antinuke",
  securitylogs: "antinuke",
  "securitylogs export": "antinuke",
  "verification questions": "antinuke",
  //  Owner / Dev 
  owner_only: "owner_only", owner: "owner_only", ownerhelp: "owner_only",
  // Bot management
  botstats: "owner_only", stats: "owner_only", bstats: "owner_only",
  memory: "owner_only", runtime: "owner_only", diagnostics: "owner_only", debug: "owner_only",
  nodeinfo: "owner_only", node: "owner_only", queues: "owner_only",
  reconnectnode: "owner_only", reconnectallnodes: "owner_only", switchnode: "owner_only",
  fixplayer: "owner_only", fixplayers: "owner_only", recovermusic: "owner_only",
  recoverqueue: "owner_only", rejoinvc: "owner_only", forcereconnect: "owner_only",
  clearghostplayers: "owner_only", nodecleanup: "owner_only", playerdebug: "owner_only",
  nodestatus: "owner_only", musicdiagnostics: "owner_only",
  "music recovery": "owner_only", "lavalink tools": "owner_only", "node management": "owner_only", "player recovery": "owner_only",
  restart: "owner_only", reboot: "owner_only",
  shutdown: "owner_only", reload: "owner_only", reloadcmd: "owner_only", reloadall: "owner_only", reloadmusic: "owner_only",
  "gbot avatar": "owner_only", "gbot banner": "owner_only", "gbot name": "owner_only", "gbot status": "owner_only", gbot: "owner_only",
  // Blacklist (global user)
  blacklist: "owner_only", bl: "owner_only", blacklistuser: "owner_only",
  unblacklist: "owner_only", unbl: "owner_only", unblacklistuser: "owner_only",
  // Blacklist (server)
  blacklistserver: "owner_only", blserver: "owner_only", bls: "owner_only",
  unblacklistserver: "owner_only", unblserver: "owner_only", unbls: "owner_only",
  // Broadcast
  broadcast: "owner_only", bcast: "owner_only",
  // Lookup
  ownersi: "owner_only", oserverinfo: "owner_only", gsi: "owner_only",
  ownerui: "owner_only", ouserinfo: "owner_only", gui: "owner_only",
  finduser: "owner_only", searchuser: "owner_only",
  serverleave: "owner_only", sleave: "owner_only", leaveguild: "owner_only",
  // Database
  dbstats: "owner_only", dbs: "owner_only",
  backupdb: "owner_only", dbbackup: "owner_only",
  savedb: "owner_only", forcedbsave: "owner_only",
  fixdb: "owner_only",
  refreshconfig: "owner_only", refreshcache: "owner_only", syncguild: "owner_only",
  clearcache: "owner_only", clearcollectors: "owner_only", panelrefresh: "owner_only",
  clearqueues: "owner_only",
  resetserver: "owner_only", wipeserver: "owner_only",
  // Dev / Eval
  eval: "owner_only", ev: "owner_only",
  exec: "owner_only", sh: "owner_only",
  gtoggle: "owner_only", globaltoggle: "owner_only", genable: "owner_only", gdisable: "owner_only",
  totalservers: "owner_only", totalserver: "owner_only", totleserver: "owner_only", totle: "owner_only", tserver: "owner_only", ts: "owner_only", link: "owner_only",
  "del dm": "owner_only",
  //  Points & Rewards (owner) 
  givepoints: "owner_only", givept: "owner_only",
  bugapprove: "owner_only", bugaccept: "owner_only",
  voteapprove: "owner_only", va: "owner_only",
  "npx add": "owner_only", "snpx add": "owner_only", "gnpx add": "owner_only", "npx list": "owner_only",
  //  Config category 
  config: "config", "prefix config": "config", "setprefix config": "config",
  "welcome config": "config", "goodbye config": "config", "joindm config": "config",
  "automod config": "config",
  "antinuke config": "config", "logging config": "config", "ticket config": "config",
  "tempvoice config": "config", "giveaway config": "config",
  "confession config": "config", "economy config": "config",
  "sticky config": "config", "birthday config": "config",
  "boost config": "config", "wall config": "config",
  "media enable": "general", "media disable": "general", "media add": "general",
  "media remove": "general", "media setchannel": "general", "media setlogs": "general",
  "media uploadlogs": "general", "media deletelogs": "general",
  "media list": "general", "media config": "general", "media bypass": "general",
  //  Settings (command, noprefix, botset, filters, utility) 
  settings: "settings",
  command: "settings", cmd: "settings",
  system: "settings",
  botset: "settings", setname: "settings", setavatar: "settings", setbanner: "settings",
  badword: "settings", bw: "settings",
  whitelist: "whitelist", wl: "whitelist",
  badwordwhitelist: "whitelist", bwwhitelist: "whitelist", badwordimmune: "whitelist", bwimmune: "whitelist",
  nsfwword: "settings", nsfwwords: "settings",
  nsfwwhitelist: "whitelist", nsfwimmune: "whitelist", nsfwfilter: "whitelist",
  antilinkwhitelist: "whitelist", alwhitelist: "whitelist", antinlinkwhitelist: "whitelist", antinlinlwhitelist: "whitelist", antilinkimmune: "whitelist", alimmune: "whitelist", antinlinkimmune: "whitelist", antinlinlimmune: "whitelist",
  filterwhitelist: "whitelist", filterimmune: "whitelist", immune: "whitelist",
  disablechannel: "settings", disablechan: "settings", enablechannel: "settings", enablechan: "settings",
  autodelete: "settings", ad: "settings",
  help: "settings", h: "settings", commands: "settings",
  ping: "settings", latency: "settings",
  prefix: "settings", setprefix: "settings", pin: "settings",
  timezone: "settings", tz: "settings", settimezone: "settings", stz: "settings", checktimezone: "settings", ctz: "settings",
  avatar: "settings", av: "settings", pfp: "settings", globalavatar: "settings", gav: "settings",
  banner: "settings", userbanner: "settings", bann: "settings", bn: "settings", globalbanner: "settings", gbanner: "settings", gbn: "settings",
  userinfo: "settings", ui: "settings", whois: "settings", user: "settings",
  find: "settings", finduser: "settings", lookup: "settings", search: "settings",
  serverinfo: "settings", si: "settings", server: "settings", guild: "settings",
  nick: "settings", nickname: "settings", setnick: "settings", changenick: "settings",
  roleinfo: "settings", ri: "settings",
  channelinfo: "settings", ci: "settings",
  membercount: "settings", mc: "settings", members: "settings",
  botinfo: "settings", info: "settings", stats: "settings", about: "settings", bot: "settings",
  poll: "settings", remind: "settings", reminder: "settings", remindme: "settings",
  translate: "settings", tr: "roles",
  invite: "settings", inv: "settings", botinvite: "settings",
  //  Dashboard 
  dashboard: "settings", dash: "settings", panel: "settings",
  // gtoggle → moved to owner_only
  //  Security commands 
  security: "antinuke", nightmode: "antinuke", securityhelp: "antinuke",
  lockdown: "antinuke", rolelock: "antinuke",
  "security enable": "antinuke", "security disable": "antinuke",
  "security config": "antinuke", "security settings": "antinuke",
  "security blacklist": "antinuke", "security unblacklist": "antinuke",
  "security violations": "antinuke",
  "security whitelist": "immune",
  "security unban-wave": "antinuke",
  "security help": "antinuke",
  "security setcaps": "antinuke", "security setmaxlen": "antinuke",
  "security setaccountage": "antinuke",
  "security setlogs": "antinuke",
  disabledchannels: "settings",
  fakeban: "moderation", fban: "moderation",
  fakekick: "moderation", fkick: "moderation",
  fakemute: "moderation", fmute: "moderation",
  snipe: "moderation", s: "moderation", snipeall: "moderation", sall: "moderation", snipes: "moderation",
  editsnipe: "moderation", esnipe: "moderation", es: "moderation",
  editsnipeall: "moderation", esall: "moderation", editsnipes: "moderation",
  clearsnipe: "moderation", snipeclear: "moderation",
  //  Vanity / Tag Role 
  vanity: "roles", vanityrole: "roles", vr: "roles",
  "vanityrole set": "roles", "vanityrole settag": "roles",
  "vanityrole setlog": "roles", "vanityrole enable": "roles",
  "vanityrole disable": "roles", "vanityrole check": "roles",
  "vanityrole status": "roles", "vanityrole remove": "roles",
  tagrole: "roles", // "tr" alias conflicts with translate – not mapped
  "tagrole set": "roles", "tagrole settag": "roles",
  "tagrole setlog": "roles", "tagrole enable": "roles",
  "tagrole disable": "roles", "tagrole check": "roles",
  "tagrole status": "roles", "tagrole scan": "roles",
  //  Music 
  music: "music",
  // Playback
  play: "music", p: "music",
  py: "music",
  ps: "music",
  playnext: "music", pn: "music",
  pause: "music",
  resume: "music", unpause: "music",
  skip: "music", next: "music",
  stop: "music", leave: "music", dc: "music",
  replay: "music",
  seek: "music",
  rewind: "music",
  forward: "music",
  np: "music", nowplaying: "music",
  // Queue
  queue: "music", q: "music",
  upcoming: "music",
  history: "music",
  remove: "music", rm: "music",
  move: "music",
  jump: "music",
  skipto: "music",
  shuffle: "music", sh: "music",
  loop: "music", repeat: "music",
  volume: "music", vol: "music",
  autoplay: "music", ap: "music",
  movebot: "music",
  // Filters
  // Playlists
  playlist: "music", pl: "music",
  "playlist create": "music", "pl create": "music",
  "playlist play": "music",   "pl play": "music",
  "playlist add": "music",    "pl add": "music",
  "playlist addcurrent": "music", "pl ac": "music",
  "playlist removetrack": "music", "pl rt": "music",
  "playlist list": "music",   "pl list": "music",
  "playlist view": "music",   "pl view": "music",
  "playlist rename": "music", "pl rename": "music",
  "playlist clear": "music",  "pl clear": "music",
  "playlist delete": "music", "pl delete": "music",
  // Info and Lyrics
  lyrics: "music",
  trackinfo: "music",
  thumbnail: "music",
  mostplayed: "music",
  // DJ and Config
  voteskip: "music",
  skipratio: "music",
  djrole: "music",
  lockchannel: "music",
  restrict: "music",
  "music enable": "music",
  "music disable": "music",
  "music djrole": "music",
  "music defaultvol": "music",
  "music settings": "music",
};

/**
 * Reply with a styled help embed for any command 
 * Shows: category header, description, all usages, and aliases.
 */
function showCmdHelp(cmdName, msg, guildId) {
  const PREFIX = getDisplayHelpPrefix(guildId);
  const requestedName = String(cmdName || "").trim().toLowerCase();
  const catKey = CMD_HELP_MAP[requestedName];
  const cat = catKey ? ALL_COMMANDS[catKey] : null;

  if (cat) {
    const lines = cat.commands.map(c => {
      const aliases = c.aliases.length ? ` *(${c.aliases.map(a => `\`${PREFIX}${a}\``).join(", ")})*` : "";
      return `\`${PREFIX}${c.usage}\` – ${c.description}${aliases}`;
    }).join("\n");

    const embed = new EmbedBuilder()
      .setColor(getThemeColor(typeof guildId !== "undefined" ? guildId : null))
      .setAuthor({ name: `${cat.emoji || "ðŸ“–"} ${cat.name}`, iconURL: getBotAvatar(guildId, 256) })
      .setDescription(`> ${cat.description}\n\n**Command Usage**\n${lines}`)
      .setFooter({ text: `<> = Required  •  [] = Optional  |  Use ${PREFIX}help for all modules` });

    return msg.reply({ components: [wrapEmbedAsContainer(embed)], flags: MessageFlags.IsComponentsV2 });
  }

  if (!isHelpCommandKnown(requestedName)) {
    return msg.reply({
      components: [buildHelpErrorContainer(
        "Command Not Found",
        `I couldn't find \`${PREFIX}${requestedName || "command"}\`.\nUse \`${PREFIX}help\` to browse the available commands.`
      )],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  // Fallback: search individual command
  const embed = getCommandHelpEmbed(cmdName, guildId);
  return msg.reply({ components: [wrapEmbedAsContainer(embed)], flags: MessageFlags.IsComponentsV2 });
}

function getCommandHelpEmbed(commandName, guildId) {
  const PREFIX = getDisplayHelpPrefix(guildId);

  // Also search by category name (e.g. "antinuke")
  if (ALL_COMMANDS[commandName.toLowerCase()]) {
    const cat = ALL_COMMANDS[commandName.toLowerCase()];
    const usages = cat.commands.map(c => `\`${PREFIX}${c.usage}\``).join(" , ");
    return new EmbedBuilder()
      .setColor(resolveThemeColor(null, guildId))
      .setAuthor({ name: cat.name, iconURL: getBotAvatar(guildId, 256) })
      .setDescription(`**${cat.name}**\n${usages}`)
      .setThumbnail(getBotAvatar(guildId, 256))
      .setFooter({ text: `Use ${PREFIX}help for all modules` });
  }

  for (const [, cat] of Object.entries(ALL_COMMANDS)) {
    const cmd = cat.commands.find(c =>
      c.name.toLowerCase() === commandName.toLowerCase() ||
      c.aliases.includes(commandName.toLowerCase())
    );
    if (cmd) {
      return new EmbedBuilder()
        .setColor(resolveThemeColor(null, guildId))
        .setAuthor({ name: cat.name, iconURL: getBotAvatar(guildId, 256) })
        .setDescription(
          `## ${cmd.name.charAt(0).toUpperCase() + cmd.name.slice(1)}\n` +
          `\`${PREFIX}${cmd.usage}\`\n\n` +
          `${cmd.description}` +
          (cmd.aliases.length ? `\n\n**Aliases:** ${cmd.aliases.map(a => `\`${PREFIX}${a}\``).join(", ")}` : "")
        )
        .setThumbnail(getBotAvatar(guildId, 256))
        .setFooter({ text: `Category: ${cat.name} | <> = Required • [] = Optional` });
    }
  }

  return createErrorEmbed(
    "Command Not Found",
    `I couldn't find \`${PREFIX}${commandName}\`. Use \`${PREFIX}help\` to browse the available commands.`
  );
}

/* ================= ALL SYSTEMS LIST ================= */

const ALL_SYSTEMS = [
  { name: "accountage", displayName: "Account Age Gate", linked: ["verify"] },
  { name: "antibot", displayName: "Anti-Bot" },
  { name: "antilink", displayName: "Anti-Link" },
  { name: "antinuke", displayName: "Anti-Nuke", linked: ["antiraid"] },
  { name: "autoresponder", displayName: "Auto Respond & React", linked: ["autoreact"] },
  { name: "automod", displayName: "Auto-Mod", linked: ["security", "warnpunish"] },
  { name: "birthday", displayName: "Birthday System" },
  { name: "boost", displayName: "Boost Messages" },
  { name: "confession", displayName: "Confessions" },
  { name: "customroles", displayName: "Custom Roles" },
  { name: "fun", displayName: "Fun Commands" },
  { name: "giveaway", displayName: "Giveaways" },
  { name: "goodbye", displayName: "Goodbye System" },
  { name: "invites", displayName: "Invite Tracking" },
  { name: "joindm", displayName: "Join DM" },
  { name: "logging", displayName: "Logging System" },
  { name: "media", displayName: "Media Channels" },
  { name: "sticky", displayName: "Sticky Messages" },
  { name: "tempvoice", displayName: "Temp Voice" },
  { name: "ticket", displayName: "Ticket System" },
  { name: "wall", displayName: "Wall System" },
  { name: "welcome", displayName: "Welcome" },
];
globalThis.ALL_SYSTEMS = ALL_SYSTEMS;
// NOTE: linked systems are toggled automatically with their parent.
// antinuke  → also toggles antiraid
// automod   → also toggles warnpunish, muteevasion
// accountage→ also toggles verify
// autoresponder → also toggles autoreact

function buildRRConfigPanel(sessionId, session, guild, username = "unknown") {
  const ARROW = getEmoji("black_dot");
  const isEdit = !!session.editMsgId;
  const isBR = session.editType === "br";
  const typeLabel = isBR ? "Button Role" : "Reaction Role";

  //  Header 
  const headerText = isEdit
    ? `## ${getEmoji("config_title")} ${featureEmoji("roles")} Edit ${typeLabel} Panel`
    : `## ${getEmoji("config_title")} ${featureEmoji("roles")} ${typeLabel} Config – \`${session._draftKey || session.title}\``;

  //  Buttons 
  const postBtn = new ButtonBuilder()
    .setCustomId(`rr_postbtn_${sessionId}`)
    .setLabel(isEdit ? "Update Panel" : "Post Panel")
    .setStyle(ButtonStyle.Success)
    .setEmoji(getStatusEmojiObject("Action", "send"));

  const cancelBtn = new ButtonBuilder()
    .setCustomId(`rr_cancelbtn_${sessionId}`)
    .setLabel("Cancel Setup")
    .setStyle(ButtonStyle.Danger)
    .setEmoji(getStatusEmojiObject("Action", "delete"));

  if (isBR) {
    // ── BUTTON ROLE: updated dropdown + status ──
    const descDisplay = session.description && session.description.trim()
      ? `\`${session.description.slice(0, 60)}${session.description.length > 60 ? "…" : ""}\``
      : "*None*";
    const footerDisplay = (typeof session.footer === "object" ? session.footer?.text : session.footer) || "*Default*";

    const statusText =
      `${ARROW} **Title:** \`${session.title || "Not set"}\`\n` +
      `${ARROW} **Description:** ${descDisplay}\n` +
      `${ARROW} **Footer:** \`${footerDisplay}\`\n` +
      `${ARROW} **Buttons Added:** \`${session.roles.length}/20\`` +
      (isEdit ? `\n${ARROW} **Editing:** \`${session.editMsgId}\`` : "");

    const brRolesPreview = session.roles.length > 0
      ? session.roles.map(r => `${r.emoji ? r.emoji + " " : ""}<@&${r.roleId}> – \`${r.label || r.roleId}\`${r.style && r.style !== "secondary" ? ` [${r.style}]` : ""}`).join("\n")
      : "*No buttons added yet – select **Add Role** below.*";

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`rr_action_${sessionId}`)
      .setPlaceholder("Choose an option to edit the Panel")
      .addOptions([
        { label: "Set Title", value: "settitle", description: "Edit the panel title" },
        { label: "Set Description", value: "setdescription", description: "Add or edit panel description" },
        { label: "Remove Description", value: "removedesc", description: "Remove description from the panel" },
        { label: "Set Footer", value: "setfooter", description: "Set or customize the panel footer text" },
        { label: "Add Role", value: "addrole", description: "Add a button role to the panel" },
        { label: "Edit Button Role", value: "editrole", description: "Edit an existing button role (label, emoji, style)" },
        { label: "Remove Role", value: "removerole", description: "Remove a role from the panel" },
        { label: "Cancel", value: "cancel", description: isEdit ? "Discard changes" : "Cancel and discard this panel" },
      ]);

    return new ContainerBuilder()
      .addTextDisplayComponents(t => t.setContent(headerText))
      .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(t => t.setContent(statusText))
      .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(t => t.setContent(`**Buttons Preview:**\n${brRolesPreview}`))
      .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu))
      .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addActionRowComponents(new ActionRowBuilder().addComponents(postBtn, cancelBtn))
      .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(t => t.setContent(`-# Editing as ${username}`));
  }

  //  REACTION ROLE: embed-style dropdown + richer status 
  const colorHex = session.color ? `#${session.color.toString(16).padStart(6, "0").toUpperCase()}` : "Default";
  const rrStatusText =
    `${ARROW} **Title:** \`${session.title || "Not set"}\`\n` +
    `${ARROW} **Description:** \`${(session.description || "").slice(0, 60)}${(session.description || "").length > 60 ? "…" : ""}\`\n` +
    `${ARROW} **Color:** \`${colorHex}\`\n` +
    `${ARROW} **Author:** \`${session.author?.name || "Not set"}\`\n` +
    `${ARROW} **Footer:** \`${session.footer?.text?.slice(0, 40) || "Not set"}\`\n` +
    `${ARROW} **Image:** \`${session.image ? "Set ✓" : "Not set"}\`\n` +
    `${ARROW} **Thumbnail:** \`${session.thumbnail ? "Set ✓" : "Not set"}\`\n` +
    `${ARROW} **Roles Added:** \`${session.roles.length}/20\`` +
    (isEdit ? `\n${ARROW} **Editing:** \`${session.editMsgId}\`` : "");

  const rrRolesPreview = session.roles.length > 0
    ? session.roles.map(r => `${r.emoji || "❓"} <@&${r.roleId}> – \`${r.label || r.roleId}\``).join("\n")
    : "*No roles added yet – select **Add Role** below.*";

  const rrSelectMenu = new StringSelectMenuBuilder()
    .setCustomId(`rr_action_${sessionId}`)
    .setPlaceholder("Choose an option to edit the Panel")
    .addOptions([
      { label: "Title & Description", value: "settitle", description: "Edit the embed title and description" },
      { label: "Color", value: "setcolor", description: "Set embed accent color (hex)" },
      { label: "Image & Thumbnail", value: "setimage", description: "Set large image and thumbnail URLs" },
      { label: "Footer", value: "setfooter", description: "Set footer text and icon URL" },
      { label: "Author", value: "setauthor", description: "Set author name and icon URL" },
      { label: "Add Role", value: "addrole", description: "Add a role with its reaction emoji" },
      { label: "Remove Role", value: "removerole", description: "Remove a role from the panel" },
      { label: "Cancel", value: "cancel", description: isEdit ? "Discard changes" : "Cancel and discard this panel" },
    ]);

  return new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(headerText))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(rrStatusText))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(`**Roles Preview:**\n${rrRolesPreview}`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(rrSelectMenu))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(postBtn, cancelBtn))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(`-# Editing as ${username}`));
}

// Build the RR/BR list panel – matches embed list style
function buildRRListPanel(guildId, type, username, PREFIX) {
  const ARR = getEmoji("black_dot");
  const isBR = type === "br";
  const dbKey = isBR ? "buttonRoles" : "reactionRoles";
  const label = isBR ? "Button Role" : "Reaction Role";
  const emoji = featureEmoji("roles");
  const editCmd = isBR ? `${PREFIX}br edit` : `${PREFIX}rr edit`;
  const delCmd = isBR ? `${PREFIX}br delete` : `${PREFIX}rr delete`;
  const createCmd = isBR ? `${PREFIX}br create <n>` : `${PREFIX}rr create [name]`;
  const panels = Object.entries(guildData(guildId)[dbKey] || {});
  const limit = getRRPanelLimit(guildId);

  const createBtn = new ButtonBuilder()
    .setCustomId(`rrlist_create_${type}_${guildId}`)
    .setLabel(`Create ${label} Panel`)
    .setStyle(ButtonStyle.Primary);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${emoji} ${label} Panels`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true));

  if (panels.length === 0) {
    container.addTextDisplayComponents(t => t.setContent(
      `**Stored:** \`0/${limit}\`\n\n*No ${label.toLowerCase()} panels yet. Use \`${createCmd}\` to create one!*`
    ));
  } else {
    container.addTextDisplayComponents(t => t.setContent(`**Stored:** \`${panels.length}/${limit}\``));
    for (const [id, p] of panels) {
      const roleCount = p.roles?.length || 0;
      const desc = p.description ? p.description.slice(0, 80) + (p.description.length > 80 ? "\u2026" : "") : "No description set";
      const panelTitle = p.title || "Untitled Panel";
      container
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(t => t.setContent(
          `**${panelTitle}**\n` +
          `${ARR} **Roles:** \`${roleCount}\`\n`
        ));
    }
  }

  container
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(createBtn))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(`-# Requested by ${username}`));

  return container;
}

function panelStateEmoji(enabled) {
  return enabled ? STATUS.enabled : STATUS.disabled;
}

function panelActionStatus(enabled) {
  return enabled
    ? `<:scross:1559257945030525110> <:tick:1559236522711187577>`
    : `<:scross:1559257945030525110> <:tick:1559236522711187577>`;
}

function dropdownActionEmoji(enabled) {
  return enabled
    ? { id: "1559133152927293501", name: "enable" }
    : { id: "1559133148384596028", name: "disable" };
}

function defaultTogglePanelState(key) {
  return key === "fun";
}

function getTogglePanelState(guildId, key) {
  const normalKey = String(key || "").toLowerCase();
  const rootDb = typeof db !== "undefined" ? db : globalThis.db;
  const gd = typeof guildData === "function"
    ? guildData(guildId)
    : rootDb?.guilds?.[guildId];
  const guildSystems = rootDb?.guildSystems?.[guildId] || {};
  if (typeof guildSystems[normalKey] === "boolean") return guildSystems[normalKey];
  if (gd?.features && typeof gd.features[normalKey] === "boolean") return gd.features[normalKey];
  const perSystemState = {
    ticket: gd?.ticket?.enabled,
    counting: gd?.countingSystem?.enabled,
    confession: gd?.confession?.enabled,
    giveaway: gd?.giveawaySystem?.enabled,
    sticky: gd?.stickySystem?.enabled,
    afk: gd?.afk?.enabled,
    antibot: gd?.antibot?.enabled,
    antinuke: gd?.antinuke?.enabled,
    antiraid: gd?.security?.antiraid?.enabled ?? gd?.antiRaid?.enabled,
    antilink: gd?.antilink?.enabled,
    automod: gd?.automod?.enabled,
    security: gd?.security?.enabled,
    media: gd?.media?.enabled,
    suggestions: gd?.suggestions?.enabled,
    welcome: gd?.welcome?.enabled,
    goodbye: gd?.goodbye?.enabled,
    boost: gd?.boost?.enabled,
    logging: gd?.logging?.enabled,
    birthday: gd?.birthday?.enabled,
    invites: gd?.inviteSystem?.enabled,
    wall: gd?.wallSystem?.enabled,
    autoresponder: gd?.autoresponder?.enabled,
    autoreact: gd?.autoreact?.enabled,
    customroles: gd?.customRoles?.enabled ?? gd?.customroles?.enabled,
    fun: gd?.fun?.enabled,
    tempvoice: gd?.tempVoice?.enabled ?? gd?.tempvoice?.enabled,
    joindm: gd?.joinDm?.enabled,
    accountage: gd?.accountAge?.enabled,
    verify: gd?.verify?.enabled,
    warnpunish: gd?.warnPunish?.enabled,
    muteevasion: gd?.muteEvasion?.enabled,
  };
  if (typeof perSystemState[normalKey] === "boolean") return perSystemState[normalKey];
  if (typeof getFeatureState === "function") return getFeatureState(guildId, normalKey);
  if (rootDb?.global?.features && typeof rootDb.global.features[normalKey] === "boolean") return rootDb.global.features[normalKey];
  if (rootDb?.globalSystems && typeof rootDb.globalSystems[normalKey] === "boolean") return rootDb.globalSystems[normalKey];
  if (typeof isSystemEnabled === "function") return isSystemEnabled(guildId, normalKey);
  return defaultTogglePanelState(normalKey);
}

function configTitleEmoji() {
  return getEmoji("thinking") || EMOJIS?.config_title || EMOJIS?.search || "<a:thinking:1559656266261995620>";
}

function panelExpiryFooter(user, minutes = 5) {
  const username = user?.username || user?.tag || user || "Unknown";
  const expiresAt = Math.floor((Date.now() + minutes * 60 * 1000) / 1000);
  return `-# Requested by ${username} | Expires <t:${expiresAt}:R>`;
}

function buildTogglePanel(guildId, ownerId = "unknown", options = {}) {
  const lines = ALL_SYSTEMS.map(sys => {
    const on = getTogglePanelState(guildId, sys.name);
    return `${panelActionStatus(on)} **${sys.displayName}**`;
  }).join("\n");

  const toggleOptions = ALL_SYSTEMS.map(sys => {
        const on = getTogglePanelState(guildId, sys.name);
        return {
          label: sys.displayName,
          description: on ? "Enabled - click to disable" : "Disabled - click to enable",
          value: sys.name,
          emoji: dropdownActionEmoji(on)
        };
      });
  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`toggle_panel_select_${ownerId || "unknown"}`)
      .setPlaceholder("Select a feature to toggle...")
      .addOptions(toggleOptions)
  );

  const btnRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`toggle_enable_all_${ownerId || "unknown"}`)
      .setLabel("Enable All")
      .setEmoji({ id: "1559133152927293501", name: "enable" })
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`toggle_disable_all_${ownerId || "unknown"}`)
      .setLabel("Disable All")
      .setEmoji({ id: "1559133148384596028", name: "disable" })
      .setStyle(ButtonStyle.Danger)
  );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(text =>
      text.setContent(`${EMOJIS.search} **Feature Toggle Panel**\n\n${lines}`)
    )
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(text =>
      text.setContent(`${EMOJIS.star} Choose a feature from the dropdown below to toggle it.`)
    )
    .addActionRowComponents(selectRow)
    .addActionRowComponents(btnRow);

  return { container, components: [] };
}

function buildAntiNukeConfigContainer(guildId, sessionId, user) {
  return soezyAntiNukePanel.build(guildId, sessionId, user);
}

function buildAntiBotConfigContainer(guildId, sessionId, user) {
  const ab = guildData(guildId).antibot || {};
  const whitelist = [...new Set([
    ...(Array.isArray(ab.whitelist) ? ab.whitelist : []),
    ...(Array.isArray(ab.whitelistUsers) ? ab.whitelistUsers : []),
  ])];
  const logChannel = ab.joinLogs ? `<#${ab.joinLogs}>` : "`Not set`";
  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`abcfg_select_${sessionId}`)
    .setPlaceholder("Anti-Bot settings...")
    .addOptions([
      { label: ab.enabled === true ? "Disable Anti-Bot" : "Enable Anti-Bot", description: ab.enabled === true ? "Stop removing untrusted bots" : "Remove bots not on the whitelist", value: `abcfg_toggle_${sessionId}` },
      { label: "Set Action", description: "Choose whether untrusted bots are kicked or banned", value: `abcfg_action_${sessionId}` },
      { label: "Set Log Channel", description: "Choose where bot removals are logged", value: `abcfg_logs_${sessionId}` },
      { label: "Whitelist Bot", description: "Add a bot user ID to the trusted list", value: `abcfg_whitelist_${sessionId}` },
    ]);

  return new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${configTitleEmoji()} Anti-Bot Configuration`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(
      `> **Status →** ${ab.enabled === true ? "`Enabled` <:tick:1559236522711187577>" : "`Disabled` <:scross:1559257945030525110>"}\n` +
      `> **Action →** \`${ab.action === "ban" ? "ban" : "kick"}\`\n` +
      `> **Log Channel →** ${logChannel}\n` +
      `> **Whitelisted Bots →** \`${whitelist.length}\``
    ))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(dropdown))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t => t.setContent(`-# Requested by ${user?.username || "Unknown"}`));
}
globalThis.buildAntiBotConfigContainer = buildAntiBotConfigContainer;

// Click handlers call this global; the single implementation is getAutomodBulkState below.
function getAutomodBulkFeatureState(guildId) {
  return getAutomodBulkState(guildId);
}
globalThis.getAutomodBulkFeatureState = getAutomodBulkFeatureState;

function buildAutomodConfigContainer(guildId, sessionId, user) {
  const gd = guildData(guildId);
  const am = gd.automod || {};
  const systemEnabled = (typeof am.systemEnabled === "boolean" ? am.systemEnabled : am.enabled) === true;
  const savedFeature = (key, legacyValue) => typeof am.features?.[key]?.enabled === "boolean"
    ? am.features[key].enabled
    : legacyValue === true;
  const sec = getSecurityConfigState(guildId);
  const protectionFeatures = securityConfigFeatureList().filter(feature => !["anticaps", "antiduplicate"].includes(feature.id));
  const adv = globalThis.soezyAdvancedAutomod?.ensureConfig?.(guildId, { guildData, saveDB }) || am.advanced || {};
  const filterChannels = new Set(["antiSpam", "antiMassMention", "antiCaps", "antiInvite"].flatMap(key => {
    const cfg = am[key] || {};
    return [...(cfg.whitelistChannels || []), ...(cfg.immuneChannels || [])];
  }));
  const featureState = enabled => `${enabled ? "<:tick:1559236522711187577> ON" : "<:scross:1559257945030525110> OFF"} · ${systemEnabled && enabled ? "Active" : "Inactive"}`;
  const spam = featureState(savedFeature("antiSpam", am.antiSpam?.enabled));
  const mention = featureState(savedFeature("antiMassMention", am.antiMassMention?.enabled));
  const caps = featureState(savedFeature("antiCaps", am.antiCaps?.enabled));
  const invite = `${featureState(savedFeature("antiInvite", am.antiInvite?.enabled))} Native · ${featureState(savedFeature("invite", adv.invite?.enabled))} Advanced`;
  const bulk = getAutomodBulkState(guildId);
  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`amcfg_select_${sessionId}`)
    .setPlaceholder("Enable / disable a protection");
  const allOptions = [
      { label: "Toggle Anti-Spam", description: "Enable or disable anti-spam", value: `amcfg_antispam_${sessionId}` },
      { label: "Toggle Duplicate Detection", description: "Enable or disable duplicate-message detection", value: `amcfg_advduplicate_${sessionId}` },
      { label: "Toggle Anti-Mention", description: "Enable or disable mass-mention filter", value: `amcfg_antimention_${sessionId}` },
      { label: "Toggle Anti-Caps", description: "Enable or disable caps filter", value: `amcfg_anticaps_${sessionId}` },
      { label: "Toggle Invite Protection", description: "Enable or disable invite filtering", value: `amcfg_antiinvite_${sessionId}` },
      { label: "Toggle Anti-Link", description: "Enable or disable link filtering", value: `amcfg_antilink_${sessionId}` },
      { label: "Toggle Anti-Bot", description: "Enable or disable bot-join protection", value: `amcfg_antibot_${sessionId}` },
      { label: "Toggle Bad-Word Filter", description: "Enable or disable blocked-word filtering", value: `amcfg_badwords_${sessionId}` },
      { label: "Toggle NSFW Filter", description: "Enable or disable NSFW filtering", value: `amcfg_nsfw_${sessionId}` },
      { label: "Add Role by ID", description: "Enter a role ID or mention to bypass AutoMod", value: `amcfg_wlrole_${sessionId}` },
      { label: "Add User by ID", description: "Enter a user ID or mention to bypass AutoMod", value: `amcfg_wluser_${sessionId}` },
      { label: "Add Channel by ID", description: "Enter a channel ID or mention to bypass all AutoMod checks", value: `amcfg_wlchannel_${sessionId}` },
      { label: "Remove Role by ID", description: "Remove a role using its ID or mention", value: `amcfg_rmwlrole_${sessionId}` },
      { label: "Remove User by ID", description: "Remove a user using their ID or mention", value: `amcfg_rmwluser_${sessionId}` },
      { label: "Remove Channel by ID", description: "Remove a channel using its ID or mention", value: `amcfg_rmwlchannel_${sessionId}` },
      { label: "Add Spam Channel by ID", description: "Bypass only anti-spam in a channel", value: `amcfg_wlspamchannel_${sessionId}` },
      { label: "Add Caps Channel by ID", description: "Bypass only anti-caps in a channel", value: `amcfg_wlcapschannel_${sessionId}` },
      { label: "Add Mention Channel by ID", description: "Bypass only anti-mention in a channel", value: `amcfg_wlmentionchannel_${sessionId}` },
      { label: "Add Invite Channel by ID", description: "Bypass only anti-invite in a channel", value: `amcfg_wlinvitechannel_${sessionId}` },
      { label: "Remove Spam Channel by ID", description: "Remove anti-spam channel bypass", value: `amcfg_rmwlspamchannel_${sessionId}` },
      { label: "Remove Caps Channel by ID", description: "Remove anti-caps channel bypass", value: `amcfg_rmwlcapschannel_${sessionId}` },
      { label: "Remove Mention Channel by ID", description: "Remove anti-mention channel bypass", value: `amcfg_rmwlmentionchannel_${sessionId}` },
      { label: "Remove Invite Channel by ID", description: "Remove anti-invite channel bypass", value: `amcfg_rmwlinvitechannel_${sessionId}` },
      { label: "Manage Whitelisted Bots", description: "Add or remove a bot from Anti-Bot exemptions", value: `amcfg_botmanage_${sessionId}` },
      { label: "Manage Allowed Link Domains", description: "Add or remove an Anti-Link domain exemption", value: `amcfg_domainmanage_${sessionId}` },
      { label: "Toggle Scam / Image Scan", description: "Enable or disable scam phrase and image scanning", value: `amcfg_advscams_${sessionId}` },
    ];

  allOptions.push({ label: "Toggle Account Age Gate", description: "Enable or disable minimum account age", value: `amcfg_accountage_${sessionId}` });
  const featureActions = new Set(["antispam", "antimention", "anticaps", "antiinvite", "antilink", "antibot", "badwords", "nsfw", "advduplicate", "advscams", "accountage"]);
  const isFeature = option => featureActions.has(option.value.split("_")[1]);
  const toggleStates = {
    antispam: savedFeature("antiSpam", am.antiSpam?.enabled),
    antimention: savedFeature("antiMassMention", am.antiMassMention?.enabled),
    anticaps: savedFeature("antiCaps", am.antiCaps?.enabled),
    antiinvite: savedFeature("antiInvite", am.antiInvite?.enabled),
    antilink: savedFeature("antiLink", am.antiLink?.enabled ?? gd.antilink?.enabled),
    antibot: savedFeature("antiBot", gd.antibot?.enabled),
    badwords: savedFeature("badWords", gd.badWordEnabled),
    nsfw: savedFeature("nsfw", gd.nsfwProtection),
    advduplicate: savedFeature("duplicate", adv.duplicate?.enabled),
    advscams: savedFeature("scams", adv.scams?.enabled) || savedFeature("imageScam", adv.imageScam?.enabled),
    accountage: savedFeature("accountAge", gd.accountAge?.enabled),
  };
  dropdown.addOptions(allOptions.filter(isFeature).map(option => {
    const enabled = toggleStates[option.value.split("_")[1]];
    return { ...option, label: option.label.replace(/^Toggle /, enabled ? "Disable " : "Enable "),
      description: `Currently ${enabled ? "ON" : "OFF"}. Select to ${enabled ? "disable" : "enable"}.` };
  }));
  const spamRuleWarning = (gd.nativeAutomod?.warnings || []).find(warning => /spam/i.test(warning));
  const featureLines = [
    `${spam} Anti-Spam`,
    `${mention} Anti-Mention`,
    `${caps} Anti-Caps`,
    `${invite} Anti-Invite Protection`,
    `${featureState(savedFeature("antiLink", am.antiLink?.enabled ?? gd.antilink?.enabled))} Anti-Link`,
    `${featureState(savedFeature("antiBot", gd.antibot?.enabled))} Anti-Bot (Join Protection)`,
    `${featureState(savedFeature("badWords", gd.badWordEnabled))} Bad Word Filter · ${gd.automod?.punishments?.badwords || gd.badWordConfig?.action || "timeout"}`,
    `${featureState(savedFeature("nsfw", gd.nsfwProtection))} NSFW Filter · ${gd.automod?.punishments?.nsfw || gd.nsfwConfig?.action || "timeout"}`,
    `${featureState(savedFeature("duplicate", adv.duplicate?.enabled))} Duplicate Spam Detection`,
    `${featureState(savedFeature("scams", adv.scams?.enabled))} Scam Phrases · ${featureState(savedFeature("imageScam", adv.imageScam?.enabled))} Image Scam`,
  ].join("\n");

  return new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${EMOJIS.thinking} AutoMod Configuration`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(
      `> **Status →** ${systemEnabled ? "`Enabled` <:tick:1559236522711187577>" : "`Disabled` <:scross:1559257945030525110>"} · ${systemEnabled ? "Active" : "Inactive"}\n` +
      "> **Settings and whitelists →** Configure on the website using Dashboard\n" +
      `> **AutoMod Logs →** ${adv.logs ? `<#${adv.logs}>` : "`Not set`"}`
    ))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent([
      systemEnabled ? "***__AutoMod Features__***" : "***__Saved AutoMod Preferences · Inactive__***",
      ...featureLines.split("\n").map(line => `> ${line}`),
      ...protectionFeatures.map(feature => `> ${featureState(savedFeature(feature.key, sec[feature.key]))} ${feature.label}`),
      `> ${featureState(savedFeature("accountAge", gd.accountAge?.enabled))} Account Age Gate - ${gd.accountAge?.minDays || sec.savedAccountAgeDays || sec.accountAgeDays || 7} days`,
      `> **Filter Channels →** \`${filterChannels.size}\``,
      ...(spamRuleWarning ? [`> **Spam Rule Warning →** ${spamRuleWarning}`] : []),
    ].join("\n")))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`amcfg_enableall_${sessionId}`).setLabel("Enable").setEmoji({ id: "1559236522711187577", name: "tick" }).setStyle(ButtonStyle.Success).setDisabled(bulk.allEnabled),
      new ButtonBuilder().setCustomId(`amcfg_disableall_${sessionId}`).setLabel("Disable").setEmoji({ id: "1559257945030525110", name: "scross" }).setStyle(ButtonStyle.Danger).setDisabled(bulk.allDisabled),
      new ButtonBuilder().setLabel("Dashboard").setStyle(ButtonStyle.Link).setURL(require("./utils/securityDashboardSettings").dashboardUrl(guildId, "automod")),
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(dropdown));
}

// Feature set the AutoMod Enable/Disable buttons act on (mirrors configureAutomodSystem).
// Derived from saved config only, so panel render and click handler always agree.
function getAutomodBulkState(guildId) {
  const am = guildData(guildId).automod || {};
  const systemEnabled = typeof am.systemEnabled === "boolean" ? am.systemEnabled : am.enabled === true;
  return getBulkToggleState(systemEnabled, [true]);
}

function buildAntiLinkConfigContainer(guildId, sessionId, user) {
  const al = guildData(guildId).antilink || {};
  const enabled = typeof getFeatureState === "function"
    ? getFeatureState(guildId, "antilink") === true
    : al.enabled === true;
  const domains = Array.isArray(al.whitelist) ? al.whitelist : [];
  const roles = Array.isArray(al.immuneRoles) ? al.immuneRoles : [];
  const users = Array.isArray(al.immuneUsers) ? al.immuneUsers : [];
  const channels = [...new Set([...(al.immuneChannels || []), ...(al.whitelistChannels || [])])];
  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`alcfg_select_${sessionId}`)
    .setPlaceholder("Select an option to configure...")
    .addOptions([
      { label: "Add Whitelist Domain", description: "Whitelist a domain from the filter", value: `alcfg_whitelist_${sessionId}` },
      { label: "Add Role by ID", description: "Enter a role ID or mention for bypass", value: `alcfg_immunerole_${sessionId}` },
      { label: "Add User by ID", description: "Enter a user ID or mention for bypass", value: `alcfg_immuneuser_${sessionId}` },
      { label: "Add Channel by ID", description: "Enter a channel ID or mention for bypass", value: `alcfg_immunechannel_${sessionId}` },
      { label: "Remove Role by ID", description: "Remove a role using its ID or mention", value: `alcfg_rmimmunerole_${sessionId}` },
      { label: "Remove User by ID", description: "Remove a user using their ID or mention", value: `alcfg_rmimmuneuser_${sessionId}` },
      { label: "Remove Channel by ID", description: "Remove a channel using its ID or mention", value: `alcfg_rmimmunechannel_${sessionId}` },
    ]);

  return new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${EMOJIS.thinking} Anti-Link Configuration`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(
      `> **Status →** ${enabled ? "`Enabled` <:tick:1559236522711187577>" : "`Disabled` <:scross:1559257945030525110>"}\n` +
      `> **Whitelisted Domains →** \`${domains.length}\`\n` +
      `> **Whitelist Roles →** \`${roles.length}\`  ·  **Users →** \`${users.length}\`  ·  **Channels →** \`${channels.length}\``
    ))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(enabled ? "***__Anti-Link Protection Enabled__***" : "-# Enable Anti-Link to activate link filtering."))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`alcfg_enableall_${sessionId}`)
        .setLabel("Enable")
        .setEmoji(EMOJIS.moderation_dm_tick)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(enabled),
      new ButtonBuilder()
        .setCustomId(`alcfg_disableall_${sessionId}`)
        .setLabel("Disable")
        .setEmoji(EMOJIS.scross)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!enabled),
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(dropdown))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(panelExpiryFooter(user, 5)));
}


/* ================= PREMIUM SYSTEM ================= */

const PREMIUM_PLANS = {
  plus: { name: "Plus", price: "₹99/month", duration: 30 * 24 * 60 * 60 * 1000, label: "Plus", emoji: featureEmoji("premium") },
  pro: { name: "Pro", price: "₹199/month", duration: 30 * 24 * 60 * 60 * 1000, label: "Pro", emoji: featureEmoji("premium") },
  ultra: { name: "Ultra", price: "₹299/month", duration: 30 * 24 * 60 * 60 * 1000, label: "Ultra", emoji: featureEmoji("premium") }
};

const PREMIUM_FEATURES = {
  plus: [
    //  Core 
    "Custom welcome/goodbye messages",
    "Extended giveaway limits (10 active)",
    "Priority bot response",
    "Custom bot prefix per server",
    "Advanced logging (all events)",
    "Up to 10 open tickets per user",
    "Up to 10 embed fields per embed",
    //  Security 
    "Raid mode with configurable join-burst response",
    "Webhook guard, Anti-Bot controls, and account-age join shield",
    "Recent security action timeline",
    "Up to 5 event workflows and 3 conditional role rules",
    "1 scheduled role reminder and up to 5 conditional auto-replies",
    "Welcome message test preview",
    "Warn escalation: up to 5 tiers",
    "Security log history: 30 days",
    "Verification: button + account age gate",
    "Automod: keyword list + basic regex (20 rules)",
    "Multi-owner: up to 5 trusted users",
  ],
  pro: [
    //  Core 
    "Everything in Plus",
    "Custom bot status display",
    "Advanced automod rules (unlimited + per-channel)",
    "Economy multipliers (2x rewards)",
    "Custom level-up messages & images",
    "Unlimited sticky messages",
    "Advanced ticket system (custom panels)",
    "Up to 25 open tickets per user",
    "Up to 15 embed fields per embed",
    //  Security 
    "Role Guard for dangerous role and permission changes",
    "Security alert role notifications",
    "Activity-based trust scores and configurable risk weights",
    "Automatic discussion threads and scheduled bot-message cleanup",
    "Up to 15 workflows, 20 conditional role rules, and 5 role reminders",
    "Up to 20 conditional auto-replies",
    "Warn escalation: unlimited tiers + warn expiry",
    "Security log history: 90 days + CSV/JSON export",
    "Verification: + custom questions + VPN/proxy detect",
    "Anti-Bot: bot verification queue + auto-revoke perms",
    "Raid protection: join rate limiter + lockdown scheduler",
    "Automod: per-channel rules + attachment/file type blocking",
    "Multi-owner: up to 15 trusted users",
  ],
  ultra: [
    //  Core 
    "Everything in Pro",
    "Unlimited open tickets per user",
    "Up to 25 embed fields per embed",
    "Early access to new features",
    "Direct support from bot developer",
    "Custom bot branding per server",
    "Priority bug fixes & feature requests",
    //  Security 
    "Owner-confirmed recovery from a server snapshot",
    "Emergency verification lockdown with previous-level restore",
    "Unlimited workflows, conditional role rules, scheduled reminders, and auto-replies",
    "Unlimited scheduled cleanup channels for bot-authored posts",
    "Warn escalation: unlimited tiers + appeal system via ticket",
    "Security log history: 1 year + full audit before/after values",
    "Verification: + alt account detect + shared IP flag",
    "Anti-Nuke: webhook nuke protection + role hierarchy restore",
    "Raid protection: mass-join auto-lockdown + auto-ban raid waves",
    "Automod: link reputation check (phishing domain flag)",
    "Multi-owner: UNLIMITED trusted users",
  ]
};

function isPremiumUser(userId) {
  const p = db.premium?.users?.[String(userId)];
  if (!p) return false;
  const rawExpiry = p.expiresAt ?? p.premiumUntil ?? p.expires;
  if (rawExpiry === undefined || rawExpiry === null || rawExpiry === "") return false;
  const parsedExpiry = rawExpiry instanceof Date
    ? rawExpiry.getTime()
    : Number(rawExpiry);
  if (!Number.isFinite(parsedExpiry)) return false;
  const expiresAt = parsedExpiry > 0 && parsedExpiry < 100000000000
    ? parsedExpiry * 1000
    : parsedExpiry;
  return Date.now() < expiresAt;
}

function isPremiumGuild(guildId) {
  if (!db.premium?.guilds?.[guildId]) return false;
  const p = db.premium.guilds[guildId];
  return p.expiresAt && Date.now() < p.expiresAt;
}

/**
 * Returns true if the user has an active shop-purchased premium for this guild.
 */
function isShopPremium(userId, guildId) {
  if (!db.shopPremium?.[userId]?.[guildId]) return false;
  return db.shopPremium[userId][guildId].expiresAt > Date.now();
}

/**
 * Returns true if the user has ANY form of active premium:
 * personal premium, guild premium, OR shop-bought premium for this guild.
 * Use this everywhere command access is gated on premium.
 */
function hasAnyPremium(userId, guildId) {
  return isPremiumUser(userId) || isPremiumGuild(guildId) || isShopPremium(userId, guildId);
}

function hasSecurityPremium(guildId) {
  if (!guildId) return false;
  if (isPremiumGuild(guildId)) return true;
  const shopPremium = db.shopPremium || {};
  return Object.values(shopPremium).some(perGuild => {
    const entry = perGuild?.[guildId];
    return entry?.expiresAt && Date.now() < entry.expiresAt;
  });
}
globalThis.hasSecurityPremium = hasSecurityPremium;

/**
 * Internal: resolve the active plan key for a user/guild combo.
 * Returns "ultra" | "pro" | "plus" | null (free).
 * User premium takes priority over guild premium.
 */
function getPlanKey(userId, guildId) {
  if (userId && isPremiumUser(userId)) {
    return (db.premium?.users?.[userId]?.plan || "plus").toLowerCase();
  }
  if (guildId && isPremiumGuild(guildId)) {
    return (db.premium?.guilds?.[guildId]?.plan || "plus").toLowerCase();
  }
  if (userId && guildId && isShopPremium(userId, guildId)) return "plus";
  return null;
}

/**
 * Anti-Nuke whitelist capacity. Security protection is not premium-gated.
 */
function getMaxAntiNukeWhitelist(userId, guildId) {
  return Infinity;
}

/**
 * Wall whitelist capacity. Security protection is not premium-gated.
 */
function getMaxImmuneRoles(userId, guildId) {
  return Infinity;
}

/**
 * Max warn escalation tiers (warnpunish thresholds) per plan.
 * Free=3 | Plus=5 | Pro/Ultra=Unlimited
 */
function getMaxWarnTiers(userId, guildId) {
  const plan = getPlanKey(userId, guildId);
  if (plan === "ultra" || plan === "pro") return Infinity;
  if (plan === "plus") return 5;
  return 3;
}

/**
 * Security log retention in days per tier.
 * Free=7 | Plus=30 | Pro=90 | Ultra=365
 */
function getLogRetentionDays(guildId) {
  const plan = getPlanKey(null, guildId);
  if (plan === "ultra") return 365;
  if (plan === "pro")   return 90;
  if (plan === "plus")  return 30;
  return 7;
}

/**
 * Max automod rules per tier.
 * Free=10 (keyword only) | Plus=20 (+regex) | Pro/Ultra=Unlimited
 */
function getMaxAutomodRules(userId, guildId) {
  const plan = getPlanKey(userId, guildId);
  if (plan === "ultra" || plan === "pro") return Infinity;
  if (plan === "plus") return 20;
  return 10;
}

/**
 * Max trusted multi-owner users per tier.
 * Free=1 | Plus=5 | Pro=15 | Ultra=Unlimited
 */
function getMaxTrustedOwners(userId, guildId) {
  const plan = getPlanKey(userId, guildId);
  if (plan === "ultra") return Infinity;
  if (plan === "pro")   return 15;
  if (plan === "plus")  return 5;
  return 1;
}

/**
 * Returns the max reaction/button role panels allowed for a guild.
 * Free: 5 | Plus: 10 | Pro: 15 | Ultra: 25
 */
function getRRPanelLimit(guildId) {
  const plan = db.premium?.guilds?.[guildId]?.plan?.toLowerCase();
  if (plan === "ultra") return 25;
  if (plan === "pro") return 15;
  if (plan === "plus") return 10;
  if (isPremiumGuild(guildId)) return 10; // any active guild premium = Plus minimum
  return 5; // free tier
}

/** Returns a human-readable upgrade hint based on current limit */
function getPanelLimitHint(limit) {
  if (limit === 5) return "Upgrade to **Plus** (10), **Pro** (15), or **Ultra** (25) for more!";
  if (limit === 10) return "Upgrade to **Pro** (15) or **Ultra** (25) for more!";
  if (limit === 15) return "Upgrade to **Ultra** (25) for more!";
  return "";
}

function getPremiumUser(userId) {
  return isPremiumUser(userId) ? db.premium.users[userId] : null;
}

/**
 * Checks whether the given sessionId was created by userId.
 * sessionId format: "userId_timestamp"  (both parts never contain each other's value)
 */
function isSessionOwner(sessionId, userId) {
  if (!sessionId || !userId) return false;
  const session = globalThis.__soezyCollectorSessions?.get?.(sessionId);
  if (session?.meta?.ownerId || session?.meta?.userId) return (session.meta.ownerId || session.meta.userId) === userId;
  if (session?.ownerId) return session.ownerId === userId;
  return sessionId.split("_")[0] === userId;
}

/** Ephemeral "not your panel" error – use interaction.reply OR interaction.update */
function notYourPanelReply(interaction) {
  const payload = {
    components: [createErrorContainer("Scroll Away, Not Yours", "This panel isn't yours. Run the command yourself, silly.")],
    flags: MessageFlags.IsComponentsV2 | 64
  };
  return typeof safeReply === "function" ? safeReply(interaction, payload) : interaction.reply(payload);
}

/**
 * Returns true if the user is allowed to see the Logging category in the help menu.
 * Allowed: bot owner, developer, premium user, or server administrator.
 */
function canSeeLogs(userId, member) {
  if (!userId) return false;
  if (config.ownerIds?.includes(userId)) return true;
  if (db.devUsers?.includes(userId)) return true;
  if (isPremiumUser(userId)) return true;
  if (typeof hasGuildPermission === "function" ? hasGuildPermission(member, ["Administrator"]) : member?.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;
  return false;
}

/**
 * Returns true if the user can see the Owner module in the help menu.
 * Allowed: bot owners and Soezy developers only.
 */
function canSeeOwner(userId) {
  if (!userId) return false;
  if (config.ownerIds?.includes(userId)) return true;
  if (db.devUsers?.includes(userId)) return true;
  return false;
}

function getPremiumGuild(guildId) {
  return isPremiumGuild(guildId) ? db.premium.guilds[guildId] : null;
}

function setPremium(type, id, plan, durationDays, activatedBy) {
  if (!db.premium) db.premium = { users: {}, guilds: {} };
  const store = type === "user" ? db.premium.users : db.premium.guilds;
  const planInfo = PREMIUM_PLANS[plan];
  if (!planInfo) return false;
  const now = Date.now();
  const existing = store[id];
  let expiresAt = now + (durationDays * 24 * 60 * 60 * 1000);
  if (existing && existing.expiresAt) {
    expiresAt = Math.max(existing.expiresAt, now) + (durationDays * 24 * 60 * 60 * 1000);
  }
  store[id] = { plan, expiresAt, activatedBy, activatedAt: now, expiryWarned: false };
  saveDB();
  // Auto-assign premium role in every guild the user is in (type === "user" only)
  if (type === "user") {
    for (const [gId, g] of Object.entries(db.guilds || {})) {
      const guild = client.guilds.cache.get(gId);
      if (!guild) continue;

      //  Auto-create golden premium role if none is set 
      const ensurePremiumRole = async () => {
        if (!g.premiumRole) {
          try {
            const newRole = await guild.roles.create({
              name: " Premium",
              color: 0xFFD700,        // gold
              hoist: true,            // show separately in member list
              mentionable: false,
              reason: "Auto-created: premium role for first premium user"
            });
            g.premiumRole = newRole.id;
            guildData(gId).premiumRole = newRole.id;
            saveDB();
            sendPremiumLog(guild, `${EMOJIS.yippie} **Premium Role Created** – Auto-created <@&${newRole.id}> (gold) for premium members.`);
          } catch { return null; }
        }
        return g.premiumRole;
      };

      ensurePremiumRole().then(roleId => {
        if (!roleId) return;
        guild.members.fetch(id).then(member => {
          if (!member.roles.cache.has(roleId)) {
            member.roles.add(roleId, "Auto-assigned: premium activated").catch(() => { });
          }
          // Log the event
          sendPremiumLog(guild, `${EMOJIS.yippie} **Premium Activated** – <@${id}> was given **${planInfo.label}** premium for \`${durationDays}\` days.`);
        }).catch(() => { });
      });
    }
  }
  return true;
}

function revokePremium(type, id) {
  if (!db.premium) return false;
  const store = type === "user" ? db.premium.users : db.premium.guilds;
  if (!store[id]) return false;
  delete store[id];
  saveDB();
  // Auto-remove premium role from all guilds (type === "user" only)
  if (type === "user") {
    for (const [gId, g] of Object.entries(db.guilds || {})) {
      if (!g.premiumRole) continue;
      const guild = client.guilds.cache.get(gId);
      if (!guild) continue;
      guild.members.fetch(id).then(member => {
        if (member.roles.cache.has(g.premiumRole)) {
          member.roles.remove(g.premiumRole, "Auto-removed: premium revoked").catch(() => { });
        }
        sendPremiumLog(guild, `${STATUS.error} **Premium Revoked** – <@${id}> had their premium removed.`);
      }).catch(() => { });
    }
  }
  return true;
}

//  Premium log helper – sends a message to the guild's premium log channel 
async function sendPremiumLog(guild, message) {
  if (!guild) return;
  const logChId = guildData(guild.id).premiumLog;
  if (!logChId) return;
  const ch = guild.channels.cache.get(logChId);
  if (ch) {
    await sendLoggingContainer(ch, "premium", {
      guild,
      title: "Premium Event",
      icon: EMOJIS.gem,
      fields: [{ name: "Details", value: String(message || "").slice(0, 1800) }],
    }).catch(() => {});
  }
}

function buildPremiumButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("premium_view_plus")
      .setLabel("Plus")
      .setEmoji(getStatusEmojiObject("Feature", "premium"))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("premium_view_pro")
      .setLabel("Pro")
      .setEmoji(getStatusEmojiObject("Feature", "premium"))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("premium_view_ultra")
      .setLabel("Ultra")
      .setEmoji(getStatusEmojiObject("Feature", "premium"))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("premium_check_status")
      .setLabel("My Status")
      .setEmoji(getStatusEmojiObject("Feature", "settings"))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("premium_security_help")
      .setLabel("Security")
      .setEmoji(getStatusEmojiObject("Feature", "immune"))
      .setStyle(ButtonStyle.Secondary),
  );
}


/**
 * Builds the premium logs help container — shows every log feature
 * gated by tier (purge logs, audit before/after, export, retention, etc.)
 * Triggered by:  !premium logs
 */
function buildPremiumLogsContainer(userId, guildId) {
  const ARROW = getEmoji("black_dot");
  const EN    = STATUS.enabled;
  const DIS   = STATUS.disabled;
  const GEM   = featureEmoji("premium");

  const plan      = getPlanKey(userId, guildId);
  const planLabel = plan
    ? `${PREMIUM_PLANS[plan]?.emoji} **${PREMIUM_PLANS[plan]?.label}**`
    : `${DIS} **Free**`;

  const table =
    "```\n" +
    "Log Feature                  Free   Plus   Pro    Ultra\n" +
    "\n" +
    "Purge Log Channel             ✗      ✓      ✓      ✓\n" +
    "Purge Log — Automod msgs      ✗      ✓      ✓      ✓\n" +
    "Mod Action Log (ban/kick)     ✓      ✓      ✓      ✓\n" +
    "Audit Log History            7d     30d    90d    1yr\n" +
    "Log Before/After Content      ✗      ✗      ✗      ✓\n" +
    "Log Export (CSV / JSON)       ✗      ✗      ✓      ✓\n" +
    "Media Delete Log              ✓      ✓      ✓      ✓\n" +
    "Deleted Msg Snipe             ✓      ✓      ✓      ✓\n" +
    "Message Edit Log              ✗      ✓      ✓      ✓\n" +
    "Join / Leave Log              ✓      ✓      ✓      ✓\n" +
    "Invite Tracking Log           ✗      ✓      ✓      ✓\n" +
    "Role Change Log               ✗      ✗      ✓      ✓\n" +
    "Channel Change Log            ✗      ✗      ✓      ✓\n" +
    "Webhook Activity Log          ✗      ✗      ✗      ✓\n" +
    "```";

  const sections = [
    `**${ARROW} 🗑️ Purge Logs**\n` +
    `Plus+ unlocks a dedicated purge-log channel that receives a full transcript of every bulk-deleted message — whether triggered by \`${getPrefix(guildId)}purge\` or any Automod rule (spam, bad words, NSFW, links, caps, invites).`,

    `**${ARROW} 📋 Audit Log Retention**\n` +
    `Free keeps 7 days of searchable log history. Plus extends to 30 days, Pro to 90 days, and Ultra retains logs for a full year.`,

    `**${ARROW} 📝 Edit & Before/After Logs**\n` +
    `Plus+ logs message edits to the mod-log channel. Ultra additionally captures the full before/after content of every edited or deleted message for forensic auditing.`,

    `**${ARROW} 📦 Log Export**\n` +
    `Pro+ can export any log category as a \`.csv\` or \`.json\` file for compliance audits.`,

    `**${ARROW} 🔗 Invite Tracking Log**\n` +
    `Plus+ logs every invite used on join: who joined, which invite link, and who created it.`,

    `**${ARROW} 🛠️ Role & Channel Change Log**\n` +
    `Pro+ logs every role assignment/removal and channel create/rename/delete, providing a full permission-change audit trail.`,

    `**${ARROW} 🪝 Webhook Activity Log**\n` +
    `Ultra only — tracks every webhook creation, deletion, and message posted via webhook to catch impersonation or nuke attempts early.`,
  ];

  const desc =
    `## ${GEM} Premium Logs — Feature Overview\n` +
    `> Your current plan: ${planLabel}\n\n` +
    table + "\n\n" +
    sections.join("\n\n");

  return new ContainerBuilder()
    .addTextDisplayComponents(text => text.setContent(desc))
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(buildPremiumButtons());
}

function buildPremiumStatusContainer(userId, guildId) {
  const ARROW = getEmoji("black_dot");
  const EXCL = "";
  const userPremium = getPremiumUser(userId);
  const guildPremium = guildId ? getPremiumGuild(guildId) : null;
  const hasPremium = !!(userPremium || guildPremium);
  const premium = userPremium || guildPremium;
  const planInfo = premium ? PREMIUM_PLANS[premium.plan] : null;

  let desc;
  if (!hasPremium) {
    desc =
      `## ${getEmoji("config_title")} ${featureEmoji("premium")} Premium Status\n` +
      `${ARROW}  **Status:** ${STATUS.disabled} Not Premium${EXCL}\n\n` +
      `You don't have premium. Check the plans below to see what you're missing!\n\n` +
      `${ARROW}  **Get Premium:** Contact the bot owner${EXCL}`;
  } else {
    const expiry = `<t:${Math.floor(premium.expiresAt / 1000)}:R> (<t:${Math.floor(premium.expiresAt / 1000)}:D>)`;
    const scope = userPremium ? "ðŸ‘¤ Personal (You)" : "ðŸ  Server";
    desc =
      `## ${planInfo.emoji} ${planInfo.label} Premium\n` +
      `${ARROW}  **Status:** ${STATUS.enabled} Active${EXCL}\n` +
      `${ARROW}  **Plan:** ${planInfo.name}${EXCL}\n` +
      `${ARROW}  **Scope:** ${scope}${EXCL}\n` +
      `${ARROW}  **Expires:** ${expiry}${EXCL}\n` +
      `${ARROW}  **Activated:** <t:${Math.floor(premium.activatedAt / 1000)}:D>${EXCL}`;
  }

  return new ContainerBuilder()
    .addTextDisplayComponents(text => text.setContent(desc))
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(buildPremiumButtons());
}

function buildPremiumPlansContainer() {
  const ARROW = getEmoji("black_dot");
  const EXCL = "";

  const lines = Object.entries(PREMIUM_PLANS).map(([key, plan]) => {
    const duration = "30 days";
    const features = PREMIUM_FEATURES[key].map(f => `${ARROW}  ${f}${EXCL}`).join("\n");
    return `**${plan.emoji} ${plan.label} – ${plan.name} · ${plan.price}**\n${features}\n${ARROW}  **Duration:** ${duration}${EXCL}`;
  }).join("\n\n");

  const desc =
    `## ${getEmoji("config_title")} ${featureEmoji("premium")} Premium Plans\n` +
    `> Upgrade your server experience with premium!\n` +
    `> Contact the bot owner to purchase.\n\n` +
    lines;

  return new ContainerBuilder()
    .addTextDisplayComponents(text => text.setContent(desc))
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(buildPremiumButtons());
}

/**
 * Builds the security help container with module descriptions.
 * Triggered by the Security button.
 */
function buildPremiumSecurityHelpContainer(userId, guildId) {
  const ARROW = getEmoji("black_dot");
  // Core safeguards remain available to every server; only the new premium commands below are gated.

  const sections = [
    `**${ARROW} Core protection**\n` +
    `Anti-Nuke, Wall/Quarantine, and their whitelist capacity remain available without a paid tier. These safeguards are not upsells.\n`,
    `**${ARROW} Plus · security & automation**\n` +
    `Raid mode, webhook guard, bot guard, join shield, audit action log, event workflows, conditional autoroles, scheduled role reminders, conditional auto-replies, and welcome previews.\n`,
    `**${ARROW} Pro · advanced controls**\n` +
    `Role Guard, configurable trust scoring, security alert roles, auto-threads, and scheduled cleanup of the bot’s own unpinned posts. Pro raises the workflow and automation limits.\n`,
    `**${ARROW} Ultra · recovery**\n` +
    `Owner-confirmed snapshot restore and emergency verification lockdown with restoration of the server’s previous verification level. Ultra removes the automation limits.\n`,
    `**${ARROW} Safety and permissions**\n` +
    `Commands that change settings require server management permission. Restore and panic require the server owner or bot owner. Workflow tests are dry runs; restore shows a preview and asks for a one-time confirmation code.\n`,
  ];

  const desc =
    `## ${featureEmoji("antinuke")} Security Modules\n` +
    `> Core protection stays available to every server. These premium commands are gated by the active plan.\n\n` +
    sections.join("\n");

  return new ContainerBuilder()
    .addTextDisplayComponents(text => text.setContent(desc))
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small));
}

/* ================= DASHBOARD BUILDER ================= */

const DASHBOARD_OPTIONS = [
  { section: "ageGate", label: "Account Age Gate", emoji: "immune" },
  { section: "antibot", label: "Anti-Bot", emoji: "antibot" },
  { section: "antilink", label: "Anti-Link", emoji: "antilink" },
  { section: "antinuke", label: "Anti-Nuke", emoji: "antinuke" },
  { section: "autorespond", label: "Auto Respond & React", emoji: "autorespond" },
  { section: "birthday", label: "Birthday System", emoji: "birthday" },
  { section: "boost", label: "Boost Messages", emoji: "boost" },
  { section: "confession", label: "Confessions", emoji: "confession" },
  { section: "customroles", label: "Custom Roles", emoji: "customroles" },
  { section: "giveaways", label: "Giveaways", emoji: "giveaway" },
  { section: "goodbye", label: "Goodbye", emoji: "goodbye" },
  { section: "invites", label: "Invite Tracking", emoji: "invites" },
  { section: "logging", label: "Logging", emoji: "logging" },
  { section: "media", label: "Media Channels", emoji: "mediachannels" },
  { section: "sticky", label: "Sticky Messages", emoji: "sticky" },
  { section: "voice", label: "Temp Voice", emoji: "voice" },
  { section: "tickets", label: "Ticket System", emoji: "ticket" },
  { section: "wall", label: "Wall System", emoji: "wall" },
  { section: "welcome", label: "Welcome", emoji: "welcome" },
  { section: "security", label: "Security", emoji: "antinuke" },
];

const DASHBOARD_MODULES = DASHBOARD_OPTIONS.map(option => option.section);

function buildDashboard(guild, guildId, userId) {
  const memberCount = guild?.memberCount || 0;
  const channelCount = guild?.channels?.cache?.size || 0;
  const roleCount = guild?.roles?.cache?.size || 0;
  const isGPremium = isPremiumGuild(guildId);
  const g = guildData(guildId);

  const ARROW = getEmoji("arrow");
  const OK = STATUS.enabled;
  const WARN = STATUS.disabled;

  //  Per-module config completeness check 
  // Format: > {emoji} » **Label** – Configured/Remaining
  function cfg(emoji, label, done) {
    return `> ${emoji} » **${label}** – ${done ? "Configured" : "Remaining"}`;
  }

  const ticket = g.ticket;
  const welcome = g.welcome || {};
  const goodbye = g.goodbye || {};
  const boost = g.boost || {};
  const confession = g.confession || {};
  const birthday = g.birthday || {};
  const logging = g.logging || {};
  const antilink = g.antilink || {};
  const antibot = g.antibot || {};
  const antinuke = g.antinuke || {};
  const tempvoice = g.tempVoice || g.tempvoice || {};
  const invites = g.invites || {};
  const sticky = g.stickyMessages || {};
  const autorsp = g.autoresponder || {};
  const croles = g.customRoles || g.customroles || {};
  const media = g.media || g.mediaChannels || {};
  const suggest = g.suggestions || {};
  const accountage = g.accountAge || {};
  const wall = g.wallSystem || g.wall || {};
  const giveaway = g.giveawaySystem || g.giveaway || {};

  const modules = [
    cfg(featureEmoji("immune"), "Account Age Gate", !!(accountage.enabled && (accountage.minDays || accountage.minAge))),
    cfg(featureEmoji("antibot"), "Anti-Bot", !!(antibot.enabled)),
    cfg(featureEmoji("antilink"), "Anti-Link", !!(antilink.enabled)),
    cfg(featureEmoji("antinuke"), "Anti-Nuke", !!(antinuke.enabled)),
    cfg(featureEmoji("autorespond"), "Auto Respond & React", !!(autorsp.enabled && Object.keys(autorsp.triggers || {}).length > 0)),
    cfg(featureEmoji("birthday"), "Birthday System", !!(birthday.enabled && birthday.channel)),
    cfg(featureEmoji("boost"), "Boost Messages", !!(boost.enabled && boost.channel)),
    cfg(featureEmoji("confession"), "Confessions", !!(confession.enabled && confession.channel)),
    cfg(featureEmoji("customroles"), "Custom Roles", !!(croles.enabled && croles.logChannel)),
    cfg(featureEmoji("giveaway"), "Giveaways", !!(giveaway.enabled || (g.giveaways && Object.keys(g.giveaways).length > 0))),
    cfg(featureEmoji("goodbye"), "Goodbye DM", !!(goodbye.enabled)),
    cfg(featureEmoji("invites"), "Invite Tracking", !!(g.inviteTracking?.enabled)),
    cfg(featureEmoji("logging"), "Logging", !!(logging.enabled && logging.channel)),
    cfg(featureEmoji("mediachannels"), "Media Channels", !!(media.enabled && (media.onlyChannels || []).length > 0)),
    cfg(featureEmoji("sticky"), "Sticky Messages", Object.keys(sticky).length > 0),
    cfg(featureEmoji("tempvoice"), "Temp Voice", !!(tempvoice.enabled && tempvoice.category)),
    cfg(featureEmoji("ticket"), "Ticket System", !!(ticket?.channel && ticket?.supportRole)),
    cfg(featureEmoji("wall"), "Wall System", !!(wall.enabled && (wall.logChannel || wall.quarantineRoleId))),
    cfg(featureEmoji("welcome"), "Welcome", !!(welcome.enabled && welcome.channel)),
    cfg(featureEmoji("antinuke"), "Security", !!((g.security?.logChannels?.security || g.security?.logChannels?.forensics))),
  ];

  const configuredCount = modules.filter(m => m.includes("Configured")).length;
  const totalCount = modules.length;
  const enabledCount = ALL_SYSTEMS.filter(s => isSystemEnabled(guildId, s.name)).length;
  const totalSystems = ALL_SYSTEMS.length;
  const disabledCount = Math.max(0, totalSystems - enabledCount);

  // All modules in one column (matches help menu style)
  const allModules = modules.join("\n");

  const dropdownRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`dashboard_select_${userId || "unknown"}`)
      .setPlaceholder("» Select a module to configure...")
      .addOptions(DASHBOARD_OPTIONS.map(option => ({
        label: `» ${option.label}`,
        value: `dashboard_${option.section}_${userId || "unknown"}`,
        emoji: getStatusEmojiObject("Feature", option.emoji)
      })))
  );

  const container = new ContainerBuilder()
    //  Header: big server name + server icon thumbnail 
    .addTextDisplayComponents(t => t.setContent(
      `## **${guild?.name || "Server"} Dashboard**\n` +
      `> Your Server Status.`))

    //  Stats row 
    .addTextDisplayComponents(t => t.setContent(
      `• **Members:** ${memberCount.toLocaleString()}\n` +
      `• **Channels:** ${channelCount}\n` +
      `• **Roles:** ${roleCount}\n` +
      `• **Premium:** ${isGPremium ? OK + " Active" : WARN + " Inactive"}.`))

    //  All modules in one column 
    .addTextDisplayComponents(t => t.setContent(allModules))
    .addTextDisplayComponents(t => t.setContent(`-# ${configuredCount}/${totalCount} modules configured • ${enabledCount}/${totalSystems} enabled • ${disabledCount} disabled`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    //  Dropdown 
    .addActionRowComponents(dropdownRow)
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    //  Footer 
    .addTextDisplayComponents(t => t.setContent(`-# designed by youknowntg`));


  return { container, components: [], isV2: true };
}

// Ordered list of dashboard module section IDs – matches the dropdown order.
// Used by buildDashboardNavButtons to know which module comes before/after.
/**
 * Builds the 5-button navigation row for dashboard module pages.
 * Layout: â—€ prev module | â† prev page | ðŸ  home | next page → | next module â–¶
 * Mirrors the help-menu buildHelpPageButtons style.
 */
function buildDashboardNavButtons(sectionId, userId) {
  const uid = userId || "unknown";
  const idx = DASHBOARD_MODULES.indexOf(sectionId);
  const atFirst = idx <= 0;
  const atLast = idx === -1 || idx >= DASHBOARD_MODULES.length - 1;

  return new ActionRowBuilder().addComponents(
    // â—€ Previous module
    new ButtonBuilder()
      .setCustomId(`dashboard_prevmod_${sectionId}_${uid}`)
      .setEmoji(getStatusEmojiObject("Action", "backword"))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(atFirst),
    // â† Previous page (disabled – dashboard sections are single-page)
    new ButtonBuilder()
      .setCustomId(`dashboard_prevpage_${sectionId}_${uid}`)
      .setEmoji(getStatusEmojiObject("Action", "back"))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    // ðŸ  Home / back to main dashboard
    new ButtonBuilder()
      .setCustomId(`dashboard_home_${uid}`)
      .setEmoji(getStatusEmojiObject("Action", "home"))
      .setStyle(ButtonStyle.Danger),
    // Next page → (disabled – dashboard sections are single-page)
    new ButtonBuilder()
      .setCustomId(`dashboard_nextpage_${sectionId}_${uid}`)
      .setEmoji(getStatusEmojiObject("Action", "next"))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    // â–¶ Next module
    new ButtonBuilder()
      .setCustomId(`dashboard_nextmod_${sectionId}_${uid}`)
      .setEmoji(getStatusEmojiObject("Action", "forward"))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(atLast)
  );
}

function buildDashboardSection(sectionId, guild, guildId, userId) {
  const ARROW = getEmoji("black_dot");
  const EN = STATUS.enabled;
  const DIS = STATUS.disabled;
  const PREFIX = getDisplayHelpPrefix(guildId);

  const navRow = buildDashboardNavButtons(sectionId, userId);

  function makeContainer(titleLine, bodyLines, extra = []) {
    const CTITLE = getEmoji("config_title");
    const fullTitle = `${CTITLE} ${titleLine}`;
    const c = new ContainerBuilder()
      .addTextDisplayComponents(t => t.setContent(fullTitle))
      .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(t => t.setContent(bodyLines));
    if (extra.length) {
      c.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true));
      for (const line of extra) c.addTextDisplayComponents(t => t.setContent(line));
    }
    c.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(navRow);
    return { container: c, components: [], isV2: true };
  }

  if (sectionId === "features") {
    const { container } = buildTogglePanel(guildId, userId);
    container.addActionRowComponents(navRow);
    return { container, components: [], isV2: true };
  }

  if (sectionId === "moderation") {
    const modLogs = guildData(guildId).modLogs ? `<#${guildData(guildId).modLogs}>` : "*Not set*";
    const antinuke = guildData(guildId).antinuke?.enabled ? EN : DIS;
    const antibot = guildData(guildId).antibot?.enabled ? EN : DIS;
    const antilink = guildData(guildId).antilink?.enabled ? EN : DIS;
    const automod = guildData(guildId).automod?.enabled ? EN : DIS;
    return makeContainer(
      `${EMOJIS.p_searching} **Moderation Settings**`,
      `${ARROW} **Mod Logs Channel:** ${modLogs}\n` +
      `${ARROW} **Anti-Nuke:** ${antinuke}  (max bans: ${guildData(guildId).antinuke?.maxBans || 3} • max kicks: ${guildData(guildId).antinuke?.maxKicks || 3} • punishment: ${guildData(guildId).antinuke?.punishment || "ban"})\n` +
      `${ARROW} **Anti-Bot:** ${antibot}\n` +
      `${ARROW} **Anti-Link:** ${antilink}\n` +
      `${ARROW} **Auto-Mod:** ${automod}`
    );
  }

  if (sectionId === "premium") {
    const container = buildPremiumStatusContainer(null, guildId);
    return { container, isV2: true };
  }

  if (sectionId === "stats") {
    const totalMessages = Object.values(guildData(guildId).messageCount || {}).reduce((a, b) => a + (typeof b === "number" ? b : Object.values(b).reduce((x, y) => x + y, 0)), 0);
    const totalWarnings = Object.values(guildData(guildId).warnings || {}).reduce((a, b) => a + (Array.isArray(b) ? b.length : 0), 0);
    const totalGiveaways = Object.values(guildData(guildId).giveaways || {}).filter(g => g.guildId === guildId).length;
    const totalTickets = Object.keys(guildData(guildId).ticket?.tickets || {}).length;
    return makeContainer(
      `${featureEmoji("settings")} **Server Statistics**`,
      `${ARROW} **Messages Tracked:** ${totalMessages.toLocaleString()}\n` +
      `${ARROW} **Warnings Issued:** ${totalWarnings}\n` +
      `${ARROW} **Giveaways Run:** ${totalGiveaways}\n` +
      `${ARROW} **Tickets Created:** ${totalTickets}\n` +
      `${ARROW} **Active Reminders:** ${(guildData(guildId).reminders || []).filter(r => r.guildId === guildId).length}\n` +
      `${ARROW} **Auto Responders:** ${Object.keys(guildData(guildId).autoresponder?.triggers || {}).length}\n` +
      `${ARROW} **Auto Reactors:** ${Object.keys(guildData(guildId).autoreact?.triggers || {}).length}\n` +
      `${ARROW} **Total Suggestions:** ${guildData(guildId).suggestions?.count || 0}`
    );
  }

  if (sectionId === "welcome") {
    const w = guildData(guildId).welcome || {};
    const g = guildData(guildId).goodbye || {};
    return makeContainer(
      `${featureEmoji("welcome")} **Welcome & Goodbye**`,
      `** Welcome **\n` +
      `${ARROW} **Status:** ${w.enabled ? EN : DIS}\n` +
      `${ARROW} **Channel:** ${w.channel ? `<#${w.channel}>` : "*Not set*"}\n` +
      `${ARROW} **DM Welcome:** ${w.dmEnabled ? EN : DIS}\n` +
      `${ARROW} **Embed:** ${w.embedEnabled ? EN : DIS}\n\n` +
      `** Goodbye **\n` +
      `${ARROW} **Status:** ${g.enabled ? EN : DIS}\n` +
      `${ARROW} **Channel:** ${g.channel ? `<#${g.channel}>` : "*Not set*"}\n` +
      `${ARROW} **Embed:** ${g.embedEnabled ? EN : DIS}`
    );
  }

  if (sectionId === "logging") {
    const l = guildData(guildId).logging || {};
    const events = l.events || {};
    const ch = l.channels || {};
    const totalEvents = Object.keys(events).length;
    const activeEvents = Object.values(events).filter(Boolean).length;
    return makeContainer(
      `${featureEmoji("logging")} **Logging Settings**`,
      `${ARROW} **Status:** ${l.enabled ? EN : DIS}\n` +
      `${ARROW} **Active Events:** \`${activeEvents}/${totalEvents}\`\n\n` +
      `** Log Channels **\n` +
      `${ARROW} **Message Log:** ${ch.message ? `<#${ch.message}>` : l.channel ? `<#${l.channel}> *(fallback)*` : "*Not set*"}\n` +
      `${ARROW} **Moderation Log:** ${ch.moderation ? `<#${ch.moderation}>` : l.channel ? `<#${l.channel}> *(fallback)*` : "*Not set*"}\n` +
      `${ARROW} **Join/Leave Log:** ${ch.joinLeave ? `<#${ch.joinLeave}>` : l.channel ? `<#${l.channel}> *(fallback)*` : "*Not set*"}\n` +
      `${ARROW} **Invite Log:** ${ch.invite ? `<#${ch.invite}>` : l.channel ? `<#${l.channel}> *(fallback)*` : "*Not set*"}\n` +
      `${ARROW} **Voice Log:** ${ch.voice ? `<#${ch.voice}>` : l.channel ? `<#${l.channel}> *(fallback)*` : "*Not set*"}\n` +
      `${ARROW} **Action Log:** ${ch.action ? `<#${ch.action}>` : l.channel ? `<#${l.channel}> *(fallback)*` : "*Not set*"}\n` +
      `${ARROW} **Admin Log:** ${ch.admin ? `<#${ch.admin}>` : l.channel ? `<#${l.channel}> *(fallback)*` : "*Not set*"}\n\n` +
      `** Key Events **\n` +
      `${ARROW} **Message Delete/Edit:** ${(events.messageDelete !== false || events.messageEdit !== false) ? EN : DIS}\n` +
      `${ARROW} **Ban/Kick/Mute:** ${(events.memberBan !== false || events.memberKick !== false || events.memberMute !== false) ? EN : DIS}\n` +
      `${ARROW} **Join/Leave:** ${(events.memberJoin !== false || events.memberLeave !== false) ? EN : DIS}\n` +
      `${ARROW} **Voice:** ${events.voiceJoin !== false ? EN : DIS}\n` +
      `${ARROW} **Invites:** ${(events.inviteCreate !== false || events.inviteDelete !== false) ? EN : DIS}\n` +
      `${ARROW} **Roles/Channels:** ${(events.roleCreate !== false || events.channelCreate !== false) ? EN : DIS}\n` +
      `${ARROW} **Nickname/Guild:** ${(events.nicknameChange !== false || events.guildUpdate !== false) ? EN : DIS}`
    );
  }

  if (sectionId === "automod") {
    const a = guildData(guildId).automod || {};
    const wlRoles = Array.isArray(guildData(guildId).automodImmuneRoles) ? guildData(guildId).automodImmuneRoles : [];
    const wlUsers = Array.isArray(guildData(guildId).automodImmuneUsers) ? guildData(guildId).automodImmuneUsers : [];
    return makeContainer(
      `${featureEmoji("automod")} **AutoMod Settings**`,
      `${ARROW} **AutoMod Status:** ${a.enabled ? EN : DIS}\n\n` +
      `** Modules **\n` +
      `${ARROW} **Anti-Spam:** ${a.antiSpam?.enabled ? EN : DIS}  (max ${a.antiSpam?.maxMessages || 5} msgs / ${(a.antiSpam?.interval || 5000) / 1000}s)\n` +
      `${ARROW} **Anti-Mass Mention:** ${a.antiMassMention?.enabled ? EN : DIS}  (max ${a.antiMassMention?.maxMentions || 5})\n` +
      `${ARROW} **Anti-Caps:** ${a.antiCaps?.enabled ? EN : DIS}  (${a.antiCaps?.percentage || 70}% threshold)\n` +
      `${ARROW} **Anti-Emoji:** ${a.antiEmoji?.enabled ? EN : DIS}  (max ${a.antiEmoji?.maxEmojis || 10})\n` +
      `${ARROW} **Anti-Invite:** ${a.antiInvite?.enabled ? EN : DIS}\n` +
      `${ARROW} **Anti-Link:** ${guildData(guildId).antilink?.enabled ? EN : DIS}\n` +
      `${ARROW} **Whitelist Roles:** \`${wlRoles.length}\`\n` +
      `${ARROW} **Whitelist Users:** \`${wlUsers.length}\``
    );
  }

  if (sectionId === "antinuke") {
    const an = guildData(guildId).antinuke || {};
    return makeContainer(
      `${featureEmoji("antinuke")} **Anti-Nuke Settings**`,
      `${ARROW} **Status:** ${an.enabled ? EN : DIS}\n` +
      `${ARROW} **Punishment:** ${an.punishment || "ban"}\n` +
      `${ARROW} **Max Bans:** ${an.maxBans || 3}\n` +
      `${ARROW} **Max Kicks:** ${an.maxKicks || 3}\n` +
      `${ARROW} **Max Channel Deletes:** ${an.maxChannelDelete || 3}\n` +
      `${ARROW} **Max Role Deletes:** ${an.maxRoleDelete || 3}\n` +
      `${ARROW} **Time Window:** ${(an.timeWindow || 10000) / 1000}s\n` +
      `${ARROW} **Log Channel:** ${an.logs ? `<#${an.logs}>` : "*Not set*"}\n` +
      `${ARROW} **Whitelisted Users:** ${(an.whitelist || []).length}`
    );
  }

  if (sectionId === "antibot") {
    const ab = guildData(guildId).antibot || {};
    return makeContainer(
      `${featureEmoji("antibot")} **Anti-Bot Settings**`,
      `${ARROW} **Status:** ${ab.enabled ? EN : DIS}\n` +
      `${ARROW} **Action:** ${ab.action || "kick"}\n` +
      `${ARROW} **Log Channel:** ${ab.joinLogs ? `<#${ab.joinLogs}>` : "*Not set*"}\n` +
      `${ARROW} **Whitelisted Bots:** ${(ab.whitelist || []).length}`
    );
  }

  if (sectionId === "goodbye") {
    const g = guildData(guildId).goodbye || {};
    const jd = guildData(guildId).joinDm || {};
    return makeContainer(
      `${featureEmoji("goodbye")} **Goodbye & Join DM**`,
      `** Goodbye **\n` +
      `${ARROW} **Status:** ${g.enabled ? EN : DIS}\n` +
      `${ARROW} **Channel:** ${g.channel ? `<#${g.channel}>` : "*Not set*"}\n` +
      `${ARROW} **Embed:** ${g.embedEnabled ? EN : DIS}\n\n` +
      `** Join DM **\n` +
      `${ARROW} **Status:** ${jd.enabled ? EN : DIS}\n` +
      `${ARROW} **Message:** ${jd.message ? `\`${jd.message.slice(0, 50)}${jd.message.length > 50 ? "…" : ""}\`` : "*Not set*"}`
    );
  }

  if (sectionId === "boost") {
    const b = guildData(guildId).boost || {};
    return makeContainer(
      `${featureEmoji("boost")} **Boost Settings**`,
      `${ARROW} **Status:** ${b.enabled ? EN : DIS}\n` +
      `${ARROW} **Channel:** ${b.channel ? `<#${b.channel}>` : "*Not set*"}\n` +
      `${ARROW} **Embed Title:** ${b.embed?.title ? `\`${b.embed.title}\`` : "*Not set*"}\n` +
      `${ARROW} **Embed Footer:** ${b.embed?.footer ? `\`${b.embed.footer}\`` : "*Not set*"}\n` +
      `${ARROW} **Timestamp:** ${b.embed?.timestamp ? EN : DIS}`
    );
  }

  if (sectionId === "tickets") {
    const t = guildData(guildId).ticket || {};
    return makeContainer(
      `${featureEmoji("ticket")} **Ticket Settings**`,
      `${ARROW} **Status:** ${t.enabled ? EN : DIS}\n` +
      `${ARROW} **Open Channel:** ${t.channel ? `<#${t.channel}>` : "*Not set*"}\n` +
      `${ARROW} **Category:** ${t.category ? `\`${t.category}\`` : "*Not set*"}\n` +
      `${ARROW} **Support Role:** ${t.supportRole ? `<@&${t.supportRole}>` : "*Not set*"}\n` +
      `${ARROW} **Log Channel:** ${t.logs ? `<#${t.logs}>` : "*Not set*"}\n` +
      `${ARROW} **Transcript Channel:** ${t.transcriptChannel ? `<#${t.transcriptChannel}>` : "*Not set*"}\n` +
      `${ARROW} **Max Tickets/User:** ${t.maxTickets ?? 5}\n` +
      `${ARROW} **Auto-Close:** ${t.autoClose ? EN : DIS}\n` +
      `${ARROW} **DM on Close:** ${t.dmOnClose !== false ? EN : DIS}\n` +
      `${ARROW} **Open Tickets:** ${Object.keys(t.tickets || {}).length}`
    );
  }

  if (sectionId === "giveaways") {
    const gs = guildData(guildId).giveawaySystem || guildData(guildId).giveaway || {};
    const activeCount = Object.values(guildData(guildId).giveaways || {}).filter(g => g.active).length;
    return makeContainer(
      `${EMOJIS.gwys} **Giveaway Settings**`,
      `${ARROW} **Status:** ${gs.enabled !== false ? EN : DIS}\n` +
      `${ARROW} **Active Giveaways:** ${activeCount}\n` +
      `${ARROW} **Total Giveaways Run:** ${Object.keys(guildData(guildId).giveaways || {}).length}`
    );
  }

  if (sectionId === "sticky") {
    const ss = guildData(guildId).stickySystem || guildData(guildId).sticky || {};
    const stickyCount = Object.keys(guildData(guildId).stickyMessages || {}).length;
    return makeContainer(
      `${featureEmoji("sticky")} **Sticky Messages**`,
      `${ARROW} **Status:** ${ss.enabled !== false ? EN : DIS}\n` +
      `${ARROW} **Active Sticky Messages:** ${stickyCount}`
    );
  }

  if (sectionId === "autorespond") {
    const ar = guildData(guildId).autoresponder || guildData(guildId).autorespond || {};
    const arc = guildData(guildId).autoreact || {};
    return makeContainer(
      `${featureEmoji("autorespond")} **Auto Respond & React**`,
      `** Auto Responder **\n` +
      `${ARROW} **Status:** ${ar.enabled !== false ? EN : DIS}\n` +
      `${ARROW} **Triggers:** ${Object.keys(ar.triggers || {}).length}\n\n` +
      `** Auto React **\n` +
      `${ARROW} **Status:** ${arc.enabled !== false ? EN : DIS}\n` +
      `${ARROW} **Triggers:** ${Object.keys(arc.triggers || {}).length}`
    );
  }

  if (sectionId === "voice") {
    const tv = guildData(guildId).tempVoice || guildData(guildId).tempvoice || {};
    const vrCount = Object.keys(guildData(guildId).voiceRoles || {}).length;
    return makeContainer(
      `${featureEmoji("voice")} **Voice Settings**`,
      `** Temp Voice **\n` +
      `${ARROW} **Status:** ${tv.enabled ? EN : DIS}\n` +
      `${ARROW} **Create Channel:** ${tv.createChannel ? `<#${tv.createChannel}>` : "*Not set*"}\n` +
      `${ARROW} **Category:** ${tv.category ? `\`${tv.category}\`` : "*Not set*"}\n` +
      `${ARROW} **Default Name:** ${tv.defaultName || "{user}'s Channel"}\n` +
      `${ARROW} **User Limit:** ${tv.defaultLimit || "Unlimited"}\n` +
      `${ARROW} **Active Channels:** ${Object.keys(tv.channels || {}).length}\n\n` +
      `** Voice Roles **\n` +
      `${ARROW} **Configured Roles:** ${vrCount}`
    );
  }

  if (sectionId === "media") {
    const m = guildData(guildId).media || {};
    const mediaChannels  = (m.onlyChannels || guildData(guildId).mediaOnlyChannels || guildData(guildId).mediaChannels || []);
    const bypassUsers    = (m.bypassUsers  || []).length;
    const bypassRoles    = (m.bypassRoles  || []).length;
    return makeContainer(
      `${featureEmoji("mediachannels")} **Media Channels**`,
      `${ARROW} **Status:** ${m.enabled !== false ? EN : DIS}\n` +
      `${ARROW} **Log Channel:** ${m.deleteLogsChannel ? `<#${m.deleteLogsChannel}>` : "*Not set*"}\n` +
      `${ARROW} **Media-Only Channels:** ${mediaChannels.length}\n` +
      (mediaChannels.length ? mediaChannels.map(id => `  • <#${id}>`).join("\n") + "\n" : "") +
      `${ARROW} **Bypass Users:** ${bypassUsers}\n` +
      `${ARROW} **Bypass Roles:** ${bypassRoles}`
    );
  }

  if (sectionId === "birthday") {
    const b = guildData(guildId).birthday || {};
    const totalBdays = Object.keys(guildData(guildId).birthdays || b.users || {}).length;
    return makeContainer(
      `${featureEmoji("birthday")} **Birthday Settings**`,
      `${ARROW} **Status:** ${b.enabled ? EN : DIS}\n` +
      `${ARROW} **Channel:** ${b.channel ? `<#${b.channel}>` : "*Not set*"}\n` +
      `${ARROW} **Role:** ${b.role ? `<@&${b.role}>` : "*Not set*"}\n` +
      `${ARROW} **Registered Birthdays:** ${totalBdays}`
    );
  }

  if (sectionId === "wall") {
    const w = guildData(guildId).wallSystem || guildData(guildId).wall || {};
    const quarantined = typeof wallGetQuarantined === "function" ? wallGetQuarantined(guildId) : (w.quarantined?.[guildId] || {});
    return makeContainer(
      `${featureEmoji("wall")} **Wall System (Role Quarantine)**`,
      `${ARROW} **Status:** ${w.enabled ? EN : DIS}\n` +
      `${ARROW} **Whitelist Role:** ${w.immuneRoleId ? `<@&${w.immuneRoleId}>` : "*Not set*"}\n` +
      `${ARROW} **Quarantine Role:** ${w.quarantineRoleId ? `<@&${w.quarantineRoleId}>` : "*Not set*"}\n` +
      `${ARROW} **Log Channel:** ${w.logChannel ? `<#${w.logChannel}>` : "*Not set*"}\n` +
      `${ARROW} **Quarantined Users:** ${Object.keys(quarantined).length}\n` +
      `${ARROW} **Recorded Strikes:** ${Number(w.stats?.totalStrikes || 0)}`
    );
  }

  if (sectionId === "confession") {
    const cf = guildData(guildId).confession || {};
    const totalConf = (guildData(guildId).confessions || []).length;
    const bannedCount = (cf.bannedUsers || guildData(guildId).confessionBannedUsers || []).length;
    return makeContainer(
      `${featureEmoji("confession")} **Confession System**`,
      `${ARROW} **Status:** ${cf.enabled !== false ? EN : DIS}\n` +
      `${ARROW} **Channel:** ${cf.channel ? `<#${cf.channel}>` : "*Not set*"}\n` +
      `${ARROW} **Log Channel:** ${cf.logChannel ? `<#${cf.logChannel}>` : "*Not set*"}\n` +
      `${ARROW} **Total Confessions:** ${totalConf}\n` +
      `${ARROW} **Banned Users:** ${bannedCount}`
    );
  }

  if (sectionId === "antilink") {
    const al = guildData(guildId).antilink || {};
    const immuneRoles = (al.immuneRoles || []).length;
    const immuneChannels = (al.immuneChannels || []).length;
    return makeContainer(
      `${featureEmoji("antilink")} **Anti-Link Settings**`,
      `${ARROW} **Status:** ${al.enabled ? EN : DIS}\n` +
      `${ARROW} **Punishment:** ${al.punishment || "*Not set*"}\n` +
      `${ARROW} **Log Channel:** ${al.logChannel ? `<#${al.logChannel}>` : "*Not set*"}\n` +
      `${ARROW} **Whitelist Roles:** ${immuneRoles}\n` +
      `${ARROW} **Whitelist Channels:** ${immuneChannels}`
    );
  }

  if (sectionId === "invites") {
    const invData = guildData(guildId).invites?.[guildId] || {};
    const trackers = Object.keys(invData.counts || {}).length;
    return makeContainer(
      `${featureEmoji("invites")} **Invite Tracking**`,
      `${ARROW} **Status:** ${guildData(guildId).inviteTracking?.enabled !== false ? EN : DIS}\n` +
      `${ARROW} **Tracked Members:** ${trackers}\n` +
      `${ARROW} **Log Channel:** ${guildData(guildId).inviteTracking?.logChannel ? `<#${guildData(guildId).inviteTracking.logChannel}>` : "*Not set*"}`
    );
  }

  if (sectionId === "customroles") {
    const cr = guildData(guildId).customRoles || guildData(guildId).customroles || {};
    const usersWithRoles = Object.keys(cr.users || {}).length;
    return makeContainer(
      `${featureEmoji("customroles")} **Custom Roles**`,
      `${ARROW} **Status:** ${cr.enabled ? EN : DIS}\n` +
      `${ARROW} **Max Roles Per User:** ${cr.maxRoles || 1}\n` +
      `${ARROW} **Users With Custom Roles:** ${usersWithRoles}`
    );
  }

  if (sectionId === "ageGate") {
    const ag = guildData(guildId).accountAge || guildData(guildId).accountage || {};
    return makeContainer(
      `${featureEmoji("immune")} **Account Age Gate**`,
      `${ARROW} **Status:** ${ag.enabled ? EN : DIS}\n` +
      `${ARROW} **Min Account Age:** ${ag.minDays || 7} days\n` +
      `${ARROW} **Action:** ${ag.action || "kick"}\n` +
      `${ARROW} **Log Channel:** ${ag.logs ? `<#${ag.logs}>` : "*Not set*"}`,
 
    );
  }


  if (sectionId === "fun") {
    const f = guildData(guildId).fun || {};
    return makeContainer(
      `${featureEmoji("fun")} **Fun Commands**`,
      `${ARROW} **Status:** ${f.enabled !== false ? EN : DIS}\n\n` +
      `** Games **\n` +
      `${ARROW} Wordle, Hangman, Trivia, Scramble, Connect4, TicTacToe\n\n` +
      `** Social **\n` +
      `${ARROW} hug, kiss, pat, slap, wave, bite, dance, cuddle + more\n\n` +
      `** Misc **\n` +
      `${ARROW} 8ball, joke, meme, fact, quote, ship`,
     
    );
  }

  if (sectionId === "security") {
    const sec = guildData(guildId).security || {};
    const EN2  = STATUS.enabled;
    const DIS2 = STATUS.disabled;
    const tog = (val) => val ? EN2 : DIS2;
    return makeContainer(
      `${featureEmoji("antinuke")} **Security**`,
      `${ARROW} **Log Channel:** ${sec.logChannels?.security ? `<#${sec.logChannels.security}>` : "*Not set*"}\n` +
      `${ARROW} **Forensics Channel:** ${sec.logChannels?.forensics ? `<#${sec.logChannels.forensics}>` : "*Not set*"}\n` +
      `${ARROW} **Anti-Phishing:** ${tog(sec.antiPhishing === true)}\n` +
      `${ARROW} **Anti-Caps:** ${tog(sec.antiCaps === true)} *(${sec.antiCapsThresh ?? 70}% / ${sec.antiCapsMinLen ?? 8} chars)*\n` +
      `${ARROW} **Anti-Zalgo:** ${tog(sec.antiZalgo === true)}\n` +
      `${ARROW} **Anti-Duplicate:** ${tog(sec.antiDuplicate === true)}\n` +
      `${ARROW} **Anti-Everyone Bypass:** ${tog(sec.antiEveryoneBP === true)}\n` +
      `${ARROW} **Blacklisted Users:** ${Object.keys(sec.blacklistedUsers || {}).length}\n` +
      `${ARROW} **Locked Roles:** ${(sec.lockedRoles || []).length}\n` +
      `${ARROW} **Invite Whitelist:** ${(sec.inviteWhitelist || []).length} entries\n` +
      `${ARROW} **Whitelist Users:** ${(sec.whitelistUsers || []).length}\n` +
      `${ARROW} **Whitelist Roles:** ${(sec.whitelistRoles || []).length}`
    );
  }

  // Fallback – home
  return buildDashboard(guild, guildId, userId);
}

function buildGlobalTogglePanel(user = null) {
  if (!db.globalSystems) db.globalSystems = {};

  const lines = ALL_SYSTEMS.map(sys => {
    const on = isSystemEnabledGlobal(sys.name);
    const offIcon = on ? STATUS.disabled : actionEmoji("disable");
    const onIcon = on ? actionEmoji("enable") : STATUS.enabled;
    return `${offIcon} ${onIcon} **${sys.displayName}**`;
  }).join("\n");

  function makeOptions(chunk) {
    return chunk.map(sys => {
      const on = isSystemEnabledGlobal(sys.name);
      return {
        label: sys.displayName,
        description: on ? "Enabled" : "Disabled",
        value: sys.name,
        emoji: dropdownActionEmoji(on)
      };
    });
  }

  const btnRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("global_enable_all")
      .setLabel("Enable All")
      .setEmoji(getStatusEmojiObject("Action", "enable"))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("global_disable_all")
      .setLabel("Disable All")
      .setEmoji(getStatusEmojiObject("Action", "disable"))
      .setStyle(ButtonStyle.Danger)
  );

  const gChunk1 = ALL_SYSTEMS.slice(0, 25);
  const gChunk2 = ALL_SYSTEMS.slice(25);

  const selectRow1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("global_toggle_panel_select_1")
      .setPlaceholder("Choose a global feature to toggle... (1–25)")
      .addOptions(makeOptions(gChunk1))
  );

  const selectRow2 = gChunk2.length > 0
    ? new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("global_toggle_panel_select_2")
        .setPlaceholder("Choose a global feature to toggle... (26–30)")
        .addOptions(makeOptions(gChunk2))
    )
    : null;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(text =>
      text.setContent(
        `## ${getEmoji("settings") || "<a:waguri:1500964657530142790>"} Global Feature Toggle Panel`
      )
    )
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(text =>
      text.setContent(
        `> These toggles apply **globally across all servers**.\n` +
        `> Per-server settings still take effect after this.`
      )
    )
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(text => text.setContent(lines))
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(text =>
      text.setContent(`${STATUS.info} Choose a feature from the dropdowns below to toggle it.`)
    )
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(btnRow)
    .addActionRowComponents(selectRow1);
  if (selectRow2) container.addActionRowComponents(selectRow2);
  container
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(text => text.setContent(panelExpiryFooter(user || "Bot Owner", 5)));

  return { container, components: [] };
}

function getSystemsListEmbed(guildId) {
  const systems = ALL_SYSTEMS.map(sys => {
    const enabled = isSystemEnabled(guildId, sys.name);
    const status = enabled ? `${STATUS.enabled} Enabled` : `${STATUS.disabled} Disabled`;
    return `${bold(sys.displayName)}: ${status}`;
  }).join("\n");

  return createEmbed({
    title: `${featureEmoji("settings")} ${bold("All Systems")}`,
    description: systems,
    footer: "Use each feature config command to toggle"
  });
}
