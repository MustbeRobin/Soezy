// ============ CONFIG FILES ============
const config = require("./config.json");
const { getLavalinkConfiguration } = require("./utils/lavalinkConfig");
config.token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || config.token;
config.clientSecret = process.env.DISCORD_CLIENT_SECRET || config.clientSecret;
config.anthropicKey = process.env.ANTHROPIC_KEY || config.anthropicKey;
config.spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET || config.spotifyClientSecret;
config.bridgeSecret = process.env.BRIDGE_SECRET || config.bridgeSecret;
const lavalinkConfiguration = getLavalinkConfiguration();
config.lavalinkNodes = lavalinkConfiguration.nodes;
config.lavalinkConfigError = lavalinkConfiguration.error;
let db = (typeof __soezyPreloadedDB !== "undefined" && __soezyPreloadedDB && typeof __soezyPreloadedDB === "object" && !Array.isArray(__soezyPreloadedDB))
  ? __soezyPreloadedDB
  : {};
globalThis.config = config;
globalThis.__soezyConfig = config;
globalThis.db = db;
const nsfwWords = require("./config/nsfwWords");
const badWordData = require("./config/badWords");

// ============ MODULE-LEVEL REST CLIENT ============
// Must be at module scope so all event handlers (messageCreate, interactionCreate, etc.)
// can use it — a local `const rest` inside the ready event is not accessible elsewhere.
const restClient = new REST({ version: "10" }).setToken(config.token);
if (typeof installSoezyRestQueue === "function") installSoezyRestQueue(restClient, "global REST client");
const badWords = badWordData.words;

// ============ GLOBAL BIO HELPER ============
// Discord's Gateway never sends user bios to bots.
// The only way to read them is the undocumented profile endpoint.
// Returns the global About Me text in lowercase, or "" on failure.
async function fetchGlobalBio(userId, guildId) {
  try {
    const profile = await restClient.get(
      `/users/${userId}/profile?guild_id=${guildId}&with_mutual_guilds=false&with_mutual_friends_count=false`
    );
    return (profile?.user?.bio || "").toLowerCase();
  } catch {
    return "";
  }
}

// ============ CONSTANTS ============
const DEFAULT_PREFIX = "!";
const CONFESSION_PREFIX = "$";

// ============ TIMEZONE CONFIG ============
const TIMEZONE_OFFSETS_HOURS = {
  "UTC":  0,
  "GMT":  0,
  "IST":  5.5,
  "EST": -5,
  "CST": -6,
  "MST": -7,
  "PST": -8,
  "CET":  1,
  "EET":  2,
};

// Keep the familiar aliases above, and also accept every IANA timezone
// available in the current Node runtime (for example Africa/Cairo).
try {
  const ianaZones = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [];
  for (const zone of ianaZones) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longOffset",
      hour: "2-digit",
      minute: "2-digit"
    }).formatToParts(new Date());
    const offsetPart = parts.find(part => part.type === "timeZoneName")?.value || "GMT";
    const match = offsetPart.match(/GMT([+-])(\d{2}):?(\d{2})/);
    TIMEZONE_OFFSETS_HOURS[zone] = match
      ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) + Number(match[3]) / 60)
      : 0;
  }
} catch (error) {
  console.warn("[TIMEZONE] Could not load IANA timezone names:", error.message);
}
globalThis.TIMEZONE_OFFSETS_HOURS = TIMEZONE_OFFSETS_HOURS;

/** Get the configured timezone code for a guild (default: UTC) */
function getGuildTZ(guildId) {
  return db.guilds?.[guildId]?.timezone || "UTC";
}

/** Get the timezone offset in milliseconds for a guild */
function getGuildTZOffsetMs(guildId) {
  const tz = getGuildTZ(guildId);
  return (TIMEZONE_OFFSETS_HOURS[tz] ?? 0) * 60 * 60 * 1000;
}

/** Returns "YYYY-MM-DD" string representing today in the guild's timezone */
function getTodayInGuildTZ(guildId) {
  const offset = getGuildTZOffsetMs(guildId);
  return new Date(Date.now() + offset).toISOString().split("T")[0];
}

/** Returns the UTC timestamp (ms) of the next 12:00 AM midnight in the guild's timezone */
function getNextMidnightUTCForGuild(guildId) {
  const offsetMs  = getGuildTZOffsetMs(guildId);
  const nowInTZ   = new Date(Date.now() + offsetMs);
  return Date.UTC(
    nowInTZ.getUTCFullYear(),
    nowInTZ.getUTCMonth(),
    nowInTZ.getUTCDate() + 1,
    0, 0, 0, 0
  ) - offsetMs;
}

/** Returns the current hour (0–23) in the guild's timezone */
function getCurrentHourInGuildTZ(guildId) {
  const offset = getGuildTZOffsetMs(guildId);
  return new Date(Date.now() + offset).getUTCHours();
}

/** Human-readable label for a timezone code */
function getTZLabel(tz) {
  const labels = {
    "UTC": "UTC (Coordinated Universal Time, UTC±0)",
    "GMT": "GMT (Greenwich Mean Time, UTC±0)",
    "IST": "IST (Indian Standard Time, UTC+5:30)",
    "EST": "EST (Eastern Standard Time, UTC-5)",
    "CST": "CST (Central Standard Time, UTC-6)",
    "MST": "MST (Mountain Standard Time, UTC-7)",
    "PST": "PST (Pacific Standard Time, UTC-8)",
    "CET": "CET (Central European Time, UTC+1)",
    "EET": "EET (Eastern European Time, UTC+2)",
  };
  return labels[tz] || tz;
}

// ============ EMOJIS ============
const EMOJIS = {
  stats_globe: '<:stats_globe:1560014672302837794>',
  stats_users: '<:stats_users:1560014678909001789>',
  stats_channels: '<:stats_channels:1560014683388518474>',
  stats_servers: '<:stats_servers:1560014686219538433>',
  stats_uptime: '<:stats_uptime:1560014690459852835>',
  stats_files: '<:stats_files:1560014693660233749>',
  stats_code: '<:stats_code:1560014699024617543>',
  stats_modules: '<:stats_modules:1560014702057103382>',
  stats_python: '<:stats_python:1560014705307951194>',
  stats_nodejs: '<:stats_nodejs:1560309753853382788>',
  stats_discord_python: '<:stats_discord_python:1560014708025856070>',
  stats_platform: '<:stats_platform:1560014711104213042>',
  stats_ping: '<:stats_ping:1560014713616596993>',
  stats_ram: '<:stats_ram:1560014716640694313>',
  stats_cpu: '<:stats_cpu:1560014719161598173>',
  stats_linux: '<:stats_linux:1560014722567373021>',
  stats_owners: '<:stats_owners:1560014726367289364>',
  stats_admins: '<:stats_admins:1560014732117676102>',
  stats_developers: '<:stats_developers:1560014734835843192>',
  stats_partners: '<:stats_partners:1560014737754824774>',
  stick: '<:tick:1559236522711187577>',
  welcome_ping: '<:welcome_ping:1559500364280238131>',
  welcome_arrow: '<:welcome_arrow:1559500371527999519>',
  tick_animated: '<:tick:1559236522711187577>',
  moderation_update: '<:moderation_update:1509957160480800799>',
  Tick: '<:tick:1559236522711187577>',
  scross: '<:scross:1559257945030525110>',
  moderation_dm_tick: '<:tick:1559236522711187577>',
  an_title: '<:an_title:1559244464659243119>',
  an_tick: '<:tick:1559236522711187577>',
  an_alert: '<:an_alert:1559244473685254266>',
  an_disable: '<:scross:1559257945030525110>',
  wrong: '<:scross:1559257945030525110>',
  reason: '<a:reason:1559133140746768435>',
  member: '<:member:1559133144345477120>',
  spotify: '<a:spotify:1559133162377052300>',
  youtube: '<a:youtube:1559133166088884294>',
  success: "<:tick:1559236522711187577>",
  error: "<:scross:1559257945030525110>",
  warning: "<:huh:1502437804129386587>",
  info: "<a:heart:1500970723127328979>",
  loading: "<a:loading:1559133110472286298>",
  tick: "<:tick:1559236522711187577>",
  cross_box: "<:scross:1559257945030525110>",
  black_dot: "<a:BlackDot:1500970762452992091>",

  // Community-provided emoji set
  hello: '<a:hello:1559656128017731607>',
  scatcute: '<a:scatcute:1559656132996501574>',
  sworking: '<a:sworking:1559656138352361514>',
  scake: '<a:scake:1559656142555316314>',
  steddycry: '<a:steddycry:1559656146472538112>',
  syum: '<a:syum:1559656150377693305>',
  work_work: '<a:WorkWork:1559656154425200793>',
  hm_money_money_uwu: '<a:hm_MoneyMoney_uwu:1559656159894306836>',
  hm_bubu_drum_owo: '<a:hm_bubu_drum_owo:1559656164277624873>',
  hm_bubuhmm_owo: '<a:hm_bubuhmm_owo:1559656169922887732>',
  hm_pandacry_owo: '<a:hm_pandacry_owo:1559656175384137728>',
  hm_sweat_owo: '<a:hm_sweat_owo:1559656180169576488>',
  kittyfacedown: '<a:kittyfacedown:1559656184267673742>',
  kittypout: '<a:kittypout:1559656188558188726>',
  sp_ragii_dance: '<a:SP_ragii_dance:1559656193637617754>',
  adi_badmaash: '<a:Adi_badmaash:1559656197873991782>',
  hsrt_pagal: '<:hsrt_pagal:1559656202756161576>',
  hsrt_peace: '<:hsrt_peace:1559656207520895026>',
  white_bear_shut: '<:014White_BearShut:1559656211970789406>',
  babi_1: '<:1_babi:1559656216232337549>',
  babi_2: '<:2_babi:1559656220942671982>',
  babi_3: '<:3_babi:1559656224260358285>',
  babi_4: '<:4_babi:1559656228941070336>',
  babi_5: '<:5_babi:1559656233588228119>',
  babi_6: '<:6_babi:1559656238717993140>',
  babi_7: '<:7_babi:1559656246037053443>',
  babi_8: '<:8_babi:1559656250265047062>',
  babi_9: '<:9_babi:1559656254278737961>',
  rulers_paradise_03: '<:03_Rulers_p4radise:1559656258028699719>',
  mochamad_12: '<a:12_mochamad:1559656263414063166>',

  // Personality emojis — used in status/container embeds, log titles, moderation embeds
  ahh:      '<:ahh:1502437705164783687>',
  blush:    '<:blush:1502437536549572688>',
  drink:    '<:drink:1502594587665895424>',
  eating:   '<:eating:1502594497224245340>',
  happy:    '<:happy:1502437389107331113>',
  hehe:     '<:hehe:1502437558007759019>',
  hmm:      '<:hmm:1502437726375378944>',
  huh:      '<:huh:1502437804129386587>',
  laugh:    '<:laugh:1502437514160378048>',
  p_searching: '<:searching:1502437607169069290>',
  smile:    '<:smile:1502437684038336552>',
  thinking: '<a:thinking:1559656266261995620>',
  thought:  '<:thought:1502437754523484160>',
  umm_hmm:  '<:umm_hmm:1502437465959436308>',
  p_waguri: '<:waguri:1502437357880869047>',
  yippie:   '<:yippie:1502437584708833463>',
  gwys:     '<a:gwys:1559133127895556109>',
  pty :      '<a:giveaway:1485877625464422551>',

  // Feature emojis
moderation: '<:moderation:1558901366250799270>',
autorespond: '<:autoresponder:1558901370596360288>',
general: '<:general:1558901375939780728>',
autoreact: '<:general:1558901375939780728>',
sticker: '<:general:1558901375939780728>',
media: '<:media:1558901382071976037>',
reminders: '<:general:1558901375939780728>',
confession: '<:confession:1558901387407007834>',
birthday: '<:birthday:1558901393815896115>',
filter: '<:configs:1558901400258486334>',
immune: '<:immune:1558901408114413759>',
whitelist: '<:immune:1558901408114413759>',
utility: '<:settings:1558901413306835117>',
ticket: '<:ticket:1558901419887697953>',
welcome: '<:welcome:1558901431203926076>',
giveaway: '<:giveaway:1558901439345070182>',
logging: '<:logging:1558901446471065694>',
antibot: '<:moderation:1558901366250799270>',
antinuke: '<:antinuke:1558901456654962808>',
antilink: '<:configs:1558901400258486334>',
tempvoice: '<:voice:1558901462543769713>',

economy: '<:economy:1558901469158051842>',
fun: '<:fun:1558901476661665812>',
automod: '<:automod:1558901482621771836>',
music: '<:music:1558901489576181850>',
wall: '<:wall:1558901496744124467>',
voice: '<:voice:1558901462543769713>',
customroles: '<:buttonrole:1558901503001886780>',
boost: '<:boost:1558901510845366345>',
buttonroles: '<:buttonrole:1558901503001886780>',
connectionroles: '<:buttonrole:1558901503001886780>',
dropdownroles: '<:buttonrole:1558901503001886780>',
invites: '<:invites:1558901517967167569>',
joindm: '<:general:1558901375939780728>',
mediachannels: '<:media:1558901382071976037>',
messages: '<:general:1558901375939780728>',
sticky: '<:sticky:1558901522631364689>',
file: '<:general:1558901375939780728>',
settings: '<:settings:1558901413306835117>',
goodbye: '<:goodbye:1558901530009010348>',
permit: '<:permit:1558901536246071336>',
counting: '<:general:1558901375939780728>',
reports: '<:reports:1558901542474612812>',
premium: '<:waguri:1558901549353279630>',
  
  // Action emojis
  ban:      '<a:RimuFight:1487777401864847381>',
  kick:     '<a:throw:1487777762608676965>',
  mute:     '<:slisten:1487777225691365436>',
  unmute:   '<a:singing:1487777743759343781>',
  ban_title: '<a:Adi_badmaash:1559656197873991782>',
  unban_title: '<:hsrt_peace:1559656207520895026>',
  mute_title: '<a:hm_sweat_owo:1559656180169576488>',
  unmute_title: '<a:hello:1559656128017731607>',
  kick_title: '<a:steddycry:1559656146472538112>',
  fban_title: '<:hsrt_pagal:1559656202756161576>',
  fkick_title: '<a:scatcute:1559656132996501574>',
  fmute_title: '<a:hm_bubuhmm_owo:1559656169922887732>',
  warn:     '<a:swhy:1487769488060321984>',
  lock:     '<a:sstruggle:1487777468021608549>',
  unlock:   '<a:sqtyay:1487777506156216370>',
  purge:    '<a:sblehhhh:1487777548493656146>',
  slowmode: '<a:thinking:1559656266261995620>',
  sthinking: '<a:thinking:1559656266261995620>',
  arrow:    '<a:BlackDot:1502262177808257125>',

 // Other
crown:          '<:owner:1500964949059702845>',
star:           '<:sparkle:1500965089812021359>',
heart:          '<:heartss:1500965113446924373>',
fire:           '<:angry:1500970641988522135>',
trophy:         '<:giveaway:1500964866628911266>',
medal:          '<:laugh:1500965071206092850>',
gift:           '<:cake:1500967543685251223>',
party:          '<:fun:1500970622191272056>',
sparkle:        '<:sparkle:1500965089812021359>',
clock:          '<:confuse:1500970521876238446>',
calendar:       '<:cake:1500967543685251223>',
chart:          '<:flower:1500970456054759574>',
money:          '<:flower:1500970456054759574>',
coin:           '<:flower:1500970456054759574>',
gem:            '<:sparkle:1500965089812021359>',
dice:           '<:fun:1500970622191272056>',
slot:           '<:fun:1500970622191272056>',
music_note:     '<:music:1500964970261905601>',
microphone:     '<:voice:1500965024452182078>',
headphones:     '<:music:1500964970261905601>',
ping:           '<:nervous:1500970704139714622>',
link:           '<:huh:1500965178961821715>',
image:          '<:dino:1500970594479374346>',
video:          '<:singing:1500965160913862787>',
audio:          '<:music:1500964970261905601>',
document:       '<:hmm:1500964833384861736>',
folder:         '<:bow:1500964904541229138>',
search:         '<a:thinking:1559656266261995620>',
edit:           '<:confuse:1500970521876238446>',
delete:         '<:mood_off:1500965195231531008>',
add:            '<:hi:1500971017445703690>',
remove:         '<:goodbye:1500970956267720775>',
check:          '<:sthumbsup:1487777417161605202>',
cross:          '<:scross:1559257945030525110>',
question:       '<:huh:1500965178961821715>',
exclamation:    '<:angry:1500970641988522135>',
arrow_right:    '<:sparkle:1500965089812021359>',
arrow_left:     '<:sparkle:1500965089812021359>',
arrow_up:       '<:sparkle:1500965089812021359>',
arrow_down:     '<:sad:1500964884190461976>',
refresh:        '<a:thinking:1559656266261995620>',
home:           '<:bow:1500964904541229138>',
gear:           '<:confuse:1500970521876238446>',
wrench:         '<:huh:1500965178961821715>',
hammer:         '<:angry:1500970641988522135>',
shield:         '<:owner:1500964949059702845>',
key:            '<:selute:1500970558656090172>',
bell:           '<:hi:1500971017445703690>',
muted_bell:     '<:mood_off:1500965195231531008>',
speaker:        '<:voice:1500965024452182078>',
megaphone:      '<:singing:1500965160913862787>',
mail:           '<:bow:1500964904541229138>',
inbox:          '<:hmm:1500964833384861736>',
outbox:         '<:hmm:1500964833384861736>',
package:        '<:giveaway:1500964866628911266>',
tag:            '<:aughh:1500964790007496865>',
bookmark:       '<:sparkle:1500965089812021359>',
clip:           '<:dino:1500970594479374346>',
pushpin:        '<:selute:1500970558656090172>',
round_pushpin:  '<:selute:1500970558656090172>',
triangular_flag:'<:angry:1500970641988522135>',
white_flag:     '<:bow:1500964904541229138>',
black_flag:     '<:goodbye:1500970956267720775>',
crossed_flags:  '<:fun:1500970622191272056>',
label:          '<:aughh:1500964790007496865>',
verified:       '<:sthumbsup:1487777417161605202>',
unverified:     '<:sad:1500964884190461976>',

// Personality emojis (Soul's character) — used in status/container embeds, log titles, mod embeds
soezy_error:   '<:hmm:1502437726375378944>',
soezy_success: '<:yippie:1502437584708833463>',
soezy_info:    '<:thinking:1502437488000761907>',
soezy_warning: '<:huh:1502437804129386587>',
soezy_fun:     '<:laugh:1502437514160378048>',
soezy_laugh:   '<:laugh:1502437514160378048>',
soezy_judge:   '<:hmm:1502437726375378944>',
soezy_excite:  '<:happy:1502437389107331113>',
soezy_yum:     '<:eating:1502594497224245340>',
soezy_tea:     '<:drink:1502594587665895424>',
soezy_spaz:    '<:ahh:1502437705164783687>',
soezy_swish:   '<:waguri:1502437357880869047>',
soezy_ykyk:    '<:hehe:1502437558007759019>',
empty_square:  '<:nervous:1500970704139714622>',
point_up:      '<:bow:1500964904541229138>',
raised_hand:   '<:angry:1500970641988522135>',
money_bag:     '<:flower:1500970456054759574>',
slot_machine:  '<:fun:1500970622191272056>',
airdrop:       '<:giveaway:1500964866628911266>',
boom:          '<:mood_off:1500965195231531008>',
globe:         '<:nervous:1500970704139714622>',
house:         '<:bow:1500964904541229138>',
trash:         '<:goodbye:1500970956267720775>',
hammer_tool:   '<:angry:1500970641988522135>',
ticket_stub:   '<:hmm:1500964833384861736>',
refresh_symbol:'<:confuse:1500970521876238446>',
green_square:  '<:hi:1500971017445703690>',
  giveaway_button: '<a:gwys:1559133127895556109>',
  sangry:        '<a:sangry:1486688548722708653>',
  sbackword:     '<:sbackword:1486643600887648377>',
  sback:         '<:sback:1486643699713704036>',
  shome:         '<:shome:1486643502145077258>',
  snext:         '<:snext:1486643721616363540>',
  sforward:      '<:sforward:1486643552589975692>',
  help_previous_module: '<:help_previous_module:1559131738205065226>',
  help_previous: '<:help_previous:1559131731192455191>',
  help_home: '<:help_home:1559131733624889354>',
  help_next: '<:help_next:1559131729489559582>',
  help_next_module: '<:help_next_module:1559131735810117672>',
  enable:        '<:tick:1559236522711187577>',
  disable:       '<:scross:1559257945030525110>',
  senable:       '<:tick:1559236522711187577>',
  sdisable:      '<:scross:1559257945030525110>',
  pencil:        '<:hmm:1500964833384861736>',
  hint:          '<:aughh:1500964790007496865>',
  yes:           '<:tick:1559236522711187577>',
  no:            '<:scross:1559257945030525110>',
  ok:            '<:ok:1500971034575241236>',
  ok_no:         '<:no:1500970979273343027>',
  config_title:  '<a:thinking:1559656266261995620>',
  rock:          '🪨',
  scissors:      '✂️',
  paper:         '📄',
  
};

function getEmoji(name) {
  if (!EMOJIS?.[name]) return EMOJIS.info;
  return EMOJIS?.[name] || "❔";
}

const STATUS = {
  enabled: EMOJIS.senable,
  disabled: EMOJIS.sdisable,
  success: EMOJIS.success,
  error: EMOJIS.error,
  warning: EMOJIS.warning,
  info: EMOJIS.info,
  Help: {
    backword: EMOJIS.help_previous_module,
    back: EMOJIS.help_previous,
    home: EMOJIS.help_home,
    next: EMOJIS.help_next,
    forward: EMOJIS.help_next_module,
  },
  Action: {
    arrow: EMOJIS.arrow,
    backword: EMOJIS.sbackword,
    back: EMOJIS.sback,
    home: EMOJIS.shome,
    next: EMOJIS.snext,
    forward: EMOJIS.sforward,
    enable: EMOJIS.enable,
    disable: EMOJIS.disable,
    enabled: EMOJIS.senable,
    disabled: EMOJIS.sdisable,
    send: EMOJIS.outbox,
    delete: EMOJIS.delete,
    edit: EMOJIS.edit,
    refresh: EMOJIS.refresh,
  },
  Feature: {
    moderation: EMOJIS.moderation,
    afk: EMOJIS.afk,
    autorespond: EMOJIS.autorespond,
    autoreact: EMOJIS.autoreact,
    media: EMOJIS.media,
    confession: EMOJIS.confession,
    birthday: EMOJIS.birthday,
    immune: EMOJIS.immune,
    whitelist: EMOJIS.whitelist,
    utility: EMOJIS.utility,
    ticket: EMOJIS.ticket,
    welcome: EMOJIS.welcome,
    giveaway: EMOJIS.giveaway,
    logging: EMOJIS.logging,
    antibot: EMOJIS.antibot,
    antinuke: EMOJIS.antinuke,
    antilink: EMOJIS.antilink,
    economy: EMOJIS.economy,
    fun: EMOJIS.fun,
    automod: EMOJIS.automod,
    music: EMOJIS.music,
    wall: EMOJIS.wall,
    voice: EMOJIS.voice,
    customroles: EMOJIS.customroles,
    boost: EMOJIS.boost,
    invites: EMOJIS.invites,
    joindm: EMOJIS.joindm,
    mediachannels: EMOJIS.mediachannels,
    buttonroles: EMOJIS.buttonroles,
    roles: EMOJIS.buttonroles,
    general: EMOJIS.general,
    permit: EMOJIS.permit,
    tempvoice: EMOJIS.tempvoice,
    sticky: EMOJIS.sticky,
    settings: EMOJIS.settings,
    config: EMOJIS.filter,
    goodbye: EMOJIS.goodbye,
    counting: EMOJIS.counting,
    reports: EMOJIS.reports,
    premium: EMOJIS.gem,
    owner: EMOJIS.loading,
  },
};

function getEmojiObjectFromRaw(raw) {
  raw = String(raw || getEmoji("question"));
  const match = raw.match(/^<(a?):([^:>]+):(\d+)>$/);
  if (!match) return { name: raw };
  return { animated: match[1] === "a", name: match[2], id: match[3] };
}

function getEmojiObject(name) {
  return getEmojiObjectFromRaw(getEmoji(name));
}

function getStatusEmojiObject(group, name) {
  return getEmojiObjectFromRaw(STATUS?.[group]?.[name] || STATUS?.[name] || getEmoji(name));
}

// ============ ANTINUKE EVENTS ============
const ANTINUKE_EVENTS = [
  { id: "antibot",           label: "Antibot" },
  { id: "antiautomod",       label: "AntiAutomod Update" },
  { id: "antiban",           label: "Antiban" },
  { id: "antikick",          label: "Antikick" },
  { id: "antichannelcreate", label: "Antichannel Create" },
  { id: "antichanneldelete", label: "Antichannel Delete" },
  { id: "antichannelupdate", label: "Antichannel Update" },
  { id: "antistickercreate", label: "Antisticker Create" },
  { id: "antistickerdelete", label: "Antisticker Delete" },
  { id: "antistickerupdate", label: "Antisticker Update" },
  { id: "antiguildupdate",   label: "Antiguild Update" },
  { id: "antirolecreate",    label: "Antirole Create" },
  { id: "antiroledelete",    label: "Antirole Delete" },
  { id: "antiroleupdate",    label: "Antirole Update" },
  { id: "antiunban",         label: "Antiunban" },
  { id: "antiwebhookcreate", label: "Antiwebhook Create" },
  { id: "antiwebhookdelete", label: "Antiwebhook Delete" },
  { id: "antiwebhookupdate", label: "Antiwebhook Update" },
  { id: "antimemberupdate",  label: "Antimember Update" },
  { id: "antiemojiupdate",   label: "AntiEmoji Update" },
  { id: "antiemojicreate",   label: "AntiEmoji Create" },
  { id: "antiemojidelete",   label: "AntiEmoji Delete" },
  { id: "antiautomodcreate", label: "AntiAutomod Create" },
  { id: "antiautomoddelete", label: "AntiAutomod Delete" },
  { id: "antimassroleremove",  label: "Anti Mass Role Remove" },
  { id: "antipermschange",     label: "Anti Permission Overwrite" },
];

const EMOJI_ENABLE  = "<:tick:1559236522711187577>";
const EMOJI_DISABLE = "<:scross:1559257945030525110>";
const YES_EMOJI = EMOJI_ENABLE;
const NO_EMOJI = EMOJI_DISABLE;
