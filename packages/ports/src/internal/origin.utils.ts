const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function tryParseOrigin(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * True when `requestOrigin` matches `configuredOrigin`, or is a loopback host
 * (`localhost` / `127.0.0.1` / `::1`) with the same protocol and port.
 *
 * Local TLS certs include those SANs, so opening admin/web via localhost is valid
 * even when the public origin uses the LAN IP from the TLS manifest.
 */
export function isAllowedConfiguredOrigin(
  requestOrigin: string | undefined,
  configuredOrigin: string,
): boolean {
  if (!requestOrigin) {
    return false;
  }

  const requestUrl = tryParseOrigin(requestOrigin);
  const configuredUrl = tryParseOrigin(configuredOrigin);

  if (!requestUrl || !configuredUrl) {
    return false;
  }

  if (requestUrl.origin === configuredUrl.origin) {
    return true;
  }

  if (!LOOPBACK_HOSTNAMES.has(requestUrl.hostname)) {
    return false;
  }

  return (
    requestUrl.protocol === configuredUrl.protocol &&
    requestUrl.port === configuredUrl.port
  );
}
