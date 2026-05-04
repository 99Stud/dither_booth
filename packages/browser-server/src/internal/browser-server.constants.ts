export const BUILD_ASSET_MANIFEST_FILE_NAME = "build-assets.json";
export const PUBLIC_ASSET_MANIFEST_FILE_NAME = "public-assets.json";
export const IMMUTABLE_ASSET_CACHE_CONTROL =
  "public, max-age=31536000, immutable";
export const PUBLIC_ASSET_CACHE_CONTROL = "no-cache";

export const HASHED_FILE_PATTERN = /(?:^|\/)[^/]+-[a-z0-9]{8,}\.[^/.]+$/i;

export const BLOCKED_PROXY_HEADERS = new Set([
  "connection",
  "forwarded",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
