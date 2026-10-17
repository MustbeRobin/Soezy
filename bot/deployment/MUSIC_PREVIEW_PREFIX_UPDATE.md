# Preview and server-prefix fix - 2026-10-05

The live SoundCloud result for sombr's "we never dated" reported 196963 ms but
its stream identifier ended in /preview/hls. This explains the early ending
after the YouTube request fell back to SoundCloud.

commands/music/music.js now:
- Rejects preview stream identifiers and explicit isPreview flags.
- Filters previews from searches, playlists, and direct URL results.
- Rejects stale queued previews before playback.
- Does not substitute SoundCloud search results for failed YouTube requests.
- Searches only the requested provider, without implicit cross-source retries.
- Resolves saved YouTube/SoundCloud tracks by their exact URL, not title search.
- Reads each guild's current prefix from client._db.prefixes for end-of-queue,
  reconnect, and queue-restored messages instead of using the global prefix.

This does not change the configured server prefix or any message layout.
No database migration is required. No account credentials are changed.

The earlier fallback selected another uploader's 186984 ms recording. The user
confirmed that recording was wrong. Title and duration similarity did not prove
recording identity; that fallback has been removed, not made more permissive.
Unavailable requests report playback failure and advance only the explicit queue.
Direct YouTube availability still depends on the source accepting the WispByte host.

The local Lavalink application.yml also enables soundcloudFilterOutPreviewTracks;
that optional server-side protection requires uploading it to WispByte and
restarting Lavalink. The AWS bot-side filtering works without that upload.

References:
- https://lavalink.dev/configuration/config/file
- https://github.com/lavalink-devs/lavaplayer/blob/master/main/src/main/java/com/sedmelluq/discord/lavaplayer/source/soundcloud/SoundCloudAudioSourceManager.java
