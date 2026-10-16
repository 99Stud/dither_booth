import type { KitId } from "@dither-booth/shared/kits";
import type { ReceiptTemplate } from "@dither-booth/shared/routes";

import { DEFAULT_KIT_ID } from "@dither-booth/shared/kits";

import { LotteryReceiptTemplate } from "#components/receipt-templates/LotteryReceiptTemplate/index";

import type { Kit, TicketComponent } from "./kit.types";

import { TARTINES_KIT } from "./tartines/index";

/** Every kit this release ships; a manifest without code fails to compile. */
const KITS = {
  tartines: TARTINES_KIT,
} satisfies Record<KitId, Kit>;

export function getKitTicket(
  kitId: KitId | undefined,
  template: ReceiptTemplate,
): TicketComponent {
  const kit = KITS[kitId ?? DEFAULT_KIT_ID];

  return template === "photo"
    ? kit.tickets.photo
    : (kit.tickets.lottery ?? LotteryReceiptTemplate);
}
