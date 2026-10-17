const { SlashCommandBuilder } = require("discord.js");

const rateCommands = [
  "howgay", "howlesbian", "howugly", "hownigga", "howsimp", "howcute",
  "howhorny", "howpretty", "howbaby", "howcrazy", "howsus",
  "cuterate", "hornyrate", "lesbianrate", "prettyrate", "babyrate",
  "crazyrate", "susrate", "simpcheck", "uglyrate", "niggarate", "lovemeter", "loverate",
];

const gifCommands = [
  "hug", "kiss", "peck", "cuddle", "pat", "slap", "punch", "bite", "poke", "smile",
  "blush", "horny", "feed", "tickle", "wave", "cry", "dance", "pout",
  "laugh", "confused", "sleep", "sleepy", "angry", "stare", "wink", "thumbsup", "facepalm",
  "shrug", "highfive", "bonk", "handhold", "boop", "nom", "lick", "kidnap", "kill", "yeet", "bully", "torture",
  "blushkiss", "instantkiss", "instanthug", "instantslap",
];

const simpleCommands = ["joke", "run"];

const descriptions = {
  joke: "Tell a quick random joke",
  peck: "Send a wholesome cheek kiss GIF",
  run: "Send a running-away GIF",
  lovemeter: "Measure love compatibility with another user",
  loverate: "Measure love compatibility with another user",
  smile: "Send a smile GIF",
  bully: "Send a bullying GIF",
  torture: "Send a torture GIF",
  simpcheck: "Check someone's simp levels",
  howgay: "Check someone's rainbow energy",
  howlesbian: "Check someone's sapphic sparkle",
  howugly: "Check someone's ugly energy",
  hownigga: "Check someone's n-word energy",
  howsimp: "Check someone's simp levels",
  howcute: "Check someone's cute energy",
  howhorny: "Check someone's chaotic energy",
  howpretty: "Check someone's pretty points",
  howbaby: "Check someone's baby energy",
  howcrazy: "Check someone's wildness",
  howsus: "Check someone's suspicion",
};

function withUserOption(builder) {
  return builder.addUserOption(o =>
    o.setName("user").setDescription("User to target").setRequired(false)
  );
}

module.exports = [
  ...rateCommands.map(name => ({
    category: "fun",
    data: withUserOption(new SlashCommandBuilder()
      .setName(name)
      .setDescription(descriptions[name] || `Run ${name} on a user`)),
  })),
  ...gifCommands.map(name => ({
    category: "fun",
    data: withUserOption(new SlashCommandBuilder()
      .setName(name)
      .setDescription(descriptions[name] || `Send an anime ${name} GIF`)),
  })),
  ...simpleCommands.map(name => ({
    category: "fun",
    data: new SlashCommandBuilder()
      .setName(name)
      .setDescription(descriptions[name] || `Run ${name}`),
  })),
];
