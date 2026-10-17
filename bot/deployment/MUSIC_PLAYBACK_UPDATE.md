# Music playback error update

## What was verified

On 2026-10-03, the configured WispByte Lavalink endpoint authenticated successfully
and reported Lavalink 4.2.2 with YouTube, SoundCloud and Bandcamp sources enabled.
A separate stream request for the video in the supplied logs failed with HTTP 500
and "This video cannot be loaded". The logs show all configured YouTube playback
clients failing. This is not a Lavalink password or Redis authentication failure.
The exact upstream cause is not confirmed; do not assume an IP ban solely from
these errors. Discord voice playback remains unverified.

## Local changes

- `utils/metrics.js`: shares counters and one timer across the VM and CommonJS
  loaders. Both read the real runtime's guild count, caches and listener counts.
- `commands/music/music.js`: uses one bounded, redacted error handler for initial
  playback and both move commands. Discord receives a short explanation, not a
  Java stack trace. Duplicate and stale exceptions cannot skip a newer track.
- Failed tracks no longer repeat through loop/autoplay. Explicitly queued tracks
  still advance, and normal successful-track looping is preserved.
- Failed track resolution/start releases the queue lock before advancing, fixing
  a deadlock. Finished play-lock entries are removed.
- Added `tests/metrics.test.js` and `tests/musicPlaybackFailure.test.js`.

Verification: 115 tests passed; `npm run check` passed; `npm run validate` loaded
198 commands without failed imports, missing exports or duplicate names.
No dependencies, credentials, Redis files or database.json were changed.

## Upload to AWS, not WispByte

Upload and extract `soezy-music-playback-fix.zip` into `/home/ubuntu/Soezy`, retaining
the ZIP's folder structure. It contains only the files named above and this note.
Do not replace your .env, config.json, database.json or other project files.
This is an incremental update to the already-installed Lavalink authentication
fix; it does not replace that earlier update. No npm install is needed.

Then run:

```sh
cd /home/ubuntu/Soezy
npm run check && npm run validate && npm run lavalink:verify &&
pm2 startOrRestart ecosystem.config.js --only Soezy --update-env
pm2 logs Soezy --lines 40 --nostream
```

Expect one metrics line per minute. The HTTP verifier does not test audio.
In Discord, test a direct supported SoundCloud link and a YouTube track separately.
The YouTube failure should be concise and should not repeat the failed track.
Do not launch a second bot with `npm start` while PM2 is running.

## Cookies and Google sign-in

The official YouTube plugin 1.18.2 has no browser-cookie configuration or
cookies.txt loader. Adding `cookie:` or `YOUTUBE_COOKIE` will not enable it.
The upstream cookie proposal was closed without merging; do not install that old
fork or an unknown JAR merely to gain cookie support.

Google OAuth remains disabled as requested. No browser cookies were extracted,
copied, stored, or transmitted. Cookies shown in screenshots are session secrets;
sign out of the exposed Google session and never paste fresh values into chat.
Cookie-based playback would require a separately evaluated implementation and
cannot be guaranteed to resolve the upstream playback failure.

References:
- https://github.com/lavalink-devs/youtube-source/issues/83
- https://github.com/lavalink-devs/youtube-source/pull/98
- https://github.com/lavalink-devs/youtube-source/blob/1.18.2/plugin/src/main/java/dev/lavalink/youtube/plugin/YoutubeOauthConfig.java
- https://github.com/lavalink-devs/youtube-source
