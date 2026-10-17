const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const VIDEO_LINK_PATTERN = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?[^\s]+|youtu\.be\/[^\s]+|youtube\.com\/shorts\/[^\s]+|instagram\.com\/reel\/[^\s]+|instagram\.com\/p\/[^\s]+)/i;

function extractSupportedVideoLink(content) {
  const match = String(content || "").match(VIDEO_LINK_PATTERN);
  return match?.[0]?.replace(/[)>.,]+$/, "") || null;
}

function isSupportedVideoLink(url) {
  return Boolean(extractSupportedVideoLink(url));
}

async function readVideoResponse(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "SoezyBot/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Video download failed with HTTP ${response.status}.`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_VIDEO_BYTES) throw new Error("The video is too large for Discord.");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_VIDEO_BYTES) throw new Error("The video is too large for Discord.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function downloadSupportedVideo(content) {
  const sourceUrl = extractSupportedVideoLink(content);
  if (!sourceUrl) return null;
  const apiUrl = process.env.VIDEO_DOWNLOAD_API_URL || "https://api.cobalt.tools/";
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (process.env.VIDEO_DOWNLOAD_API_KEY) {
    headers.Authorization = `Bearer ${process.env.VIDEO_DOWNLOAD_API_KEY}`;
  }
  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: sourceUrl,
      downloadMode: "auto",
      videoQuality: "720",
      filenameStyle: "basic",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Video service failed with HTTP ${response.status}.`);
  const result = await response.json();
  const mediaUrl = result?.url || result?.stream || result?.redirect;
  if (!mediaUrl) throw new Error("The video service did not return a playable video.");
  const buffer = await readVideoResponse(mediaUrl);
  return { buffer, filename: "soezy-video.mp4", sourceUrl };
}

globalThis.extractSupportedVideoLink = extractSupportedVideoLink;
globalThis.isSupportedVideoLink = isSupportedVideoLink;
globalThis.downloadSupportedVideo = downloadSupportedVideo;
