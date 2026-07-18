const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function tryParseOrigin(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * True when `requestOrigin` matches `configuredOrigin`, or is a loopback /
 * manifest hostname (`localhost` / `127.0.0.1` / `::1` / machine hostnames)
 * with the same protocol and port.
 *
 * Local TLS certs include those SANs, so opening admin/web via localhost or the
 * machine hostname is valid even when the public origin uses the LAN IP.
 */
export function isAllowedConfiguredOrigin(
  requestOrigin: string | undefined,
  configuredOrigin: string,
  allowedHostnames: readonly string[] = [],
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

  const requestHostname = requestUrl.hostname.toLowerCase();
  const allowedHostnameSet = new Set([
    ...LOOPBACK_HOSTNAMES,
    ...allowedHostnames.map((value) => value.toLowerCase()),
  ]);

  if (!allowedHostnameSet.has(requestHostname)) {
    return false;
  }

  return (
    requestUrl.protocol === configuredUrl.protocol &&
    requestUrl.port === configuredUrl.port
  );
}
