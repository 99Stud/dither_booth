import { API_REPO_ROOT } from "#lib/constants.ts";
import { serializeTicketSearch } from "#lib/ticket-names-url.ts";
import { getWebOrigin } from "@dither-booth/ports";

export function buildReceiptViewerUrl(names: string[]): string {
  const webOrigin = getWebOrigin({ repoRoot: API_REPO_ROOT });
  const base = new URL("/receipt-viewer", webOrigin);
  if (names.length === 0) {
    return base.toString();
  }
  const url = new URL(base.href);
  url.search = serializeTicketSearch({ ticket: names });
  return url.toString();
}
