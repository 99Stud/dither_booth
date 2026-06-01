import { getWebOrigin } from "@dither-booth/ports";

import { API_REPO_ROOT } from "#lib/constants.ts";
import { serializeTicketSearch } from "#lib/ticket-names-url.ts";

export const RECEIPT_TEMPLATE = "nexus" as const;
export const HEIRVEY_RECEIPT_TEMPLATE = "heirvey" as const;

export type ReceiptViewerTemplate =
  | typeof RECEIPT_TEMPLATE
  | typeof HEIRVEY_RECEIPT_TEMPLATE;

export async function buildReceiptViewerUrl(
  names: string[],
  options?: { ticketRef?: string; template?: ReceiptViewerTemplate },
): Promise<string> {
  const webOrigin = await getWebOrigin({ repoRoot: API_REPO_ROOT });
  const base = new URL("/receipt-viewer", webOrigin);
  if (names.length === 0) {
    if (options?.ticketRef)
      base.searchParams.set("ticketRef", options.ticketRef);
    if (options?.template) base.searchParams.set("template", options.template);
    return base.toString();
  }
  const url = new URL(base.href);
  url.search = serializeTicketSearch({ ticket: names });
  if (options?.ticketRef) url.searchParams.set("ticketRef", options.ticketRef);
  if (options?.template) url.searchParams.set("template", options.template);
  return url.toString();
}
