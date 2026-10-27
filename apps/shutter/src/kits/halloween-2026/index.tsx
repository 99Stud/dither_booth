import type { Kit } from "#kits/kit.types";

import { HalloweenPhotoTicket } from "#kits/halloween-2026/HalloweenPhotoTicket/index";

/**
 * Bal des Vampires photo ticket on #18's charcoal smoke: the look lives in
 * the manifest (shader, camera). No lottery ticket, so the default one prints.
 */
export const HALLOWEEN_2026_KIT: Kit = {
  tickets: { photo: HalloweenPhotoTicket },
};
