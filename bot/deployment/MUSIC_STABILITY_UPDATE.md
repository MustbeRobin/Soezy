# Music stability update - 2026-10-05

## AWS bot

Updated runtime files:
- commands/music/music.js
- utils/musicManager.js
- utils/runtimeManager.js

Shoukaku now uses the supported session resume options and a 10-second REST
timeout. Automatic node recovery does not interrupt an existing reconnect or
rebuild players that Shoukaku has resumed. Player recovery is single-flight,
preserves queue position and pause state, and ignores stale voice-close callbacks.
Recovery scans use a snapshot of the queue map, so replacing a queue cannot
cause an endless loop. Paused tracks are excluded from stall detection.

No credentials, database.json, Redis data, or UI layouts are changed.

Useful commands from /home/ubuntu/Soezy on AWS:

```sh
pm2 status
pm2 logs Soezy --lines 60 --nostream
npm run redis:verify
npm run lavalink:verify -- --sources
```

## WispByte audio server

Upload the updated application.yml from the Lavalink bundle to
/home/container/application.yml on the Lavalink server, not the Redis server.
Keep .env, Lavalink.jar, plugins, and private cookie files. Restart Lavalink once;
the startup command remains `sh start.sh`. No plugin reinstall is needed.

The updated configuration reduces encoder complexity to 5, uses MEDIUM
resampling, and increases the native audio buffer to 1000 ms. It keeps the
existing 5000 ms frame buffer and 256 MiB heap. These settings reduce CPU work
and tolerate brief pauses on the 512 MiB shared host. They cannot correct a
host outage or guarantee YouTube access.

Official configuration reference: https://lavalink.dev/configuration/config/file

Search results and successful authentication do not prove audio works. The
source verifier separately checks a short YouTube audio response. At the time
of diagnosis all four plugins loaded, but YouTube audio returned HTTP 500.
Automatic SoundCloud substitution was removed after it played the wrong recording.
Direct SoundCloud links remain supported. Full Discord voice playback and sustained
audio quality require a listening test after deployment.
