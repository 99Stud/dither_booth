import { isIP } from "node:net";
import { hostname as osHostname } from "node:os";

/**
 * Hostnames to include as TLS SANs / origin aliases for the current machine.
 * Always includes bare hostname and `hostname.local` (mDNS) when resolvable.
 */
export function getMachineCertificateHostnames(
  rawHostname: string = osHostname(),
): string[] {
  const trimmed = rawHostname.trim().toLowerCase();

  if (!trimmed) {
    return [];
  }

  const base = trimmed.endsWith(".local")
    ? trimmed.slice(0, -".local".length)
    : trimmed;

  if (!base || base === "localhost" || isIP(base) !== 0) {
    return [];
  }

  return [base, `${base}.local`];
}
