var soezyMusic;
try {
  soezyMusic = require("./commands/music/music");
} catch {
  soezyMusic = require("../commands/music/music");
}

module.exports = soezyMusic;

if (typeof client !== "undefined" && !globalThis.__soezyMusicRuntimeLoaded) {
  globalThis.__soezyMusicRuntimeLoaded = true;

  soezyMusic.initShoukaku(client);

  client.on("voiceStateUpdate", (oldState, newState) => {
    soezyMusic.handleVoiceStateUpdate(oldState, newState).catch(err => {
      console.error("[Music VoiceState Error]", err);
    });
  });

  client.on("guildDelete", guild => {
    try {
      soezyMusic.handleGuildDelete(guild);
    } catch (err) {
      console.error("[Music GuildDelete Error]", err);
    }
  });
}
