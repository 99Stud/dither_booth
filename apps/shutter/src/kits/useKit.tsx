import type { KitCopy } from "@dither-booth/shared/kit-copy";
import type { ResolvedKit } from "@dither-booth/shared/kits";

import { DEFAULT_KIT_ID, resolveKit } from "@dither-booth/shared/kits";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "#lib/trpc/trpc.client";

import { isKitPreview, useKitPreview } from "./kitPreview";

/** Shown until the engine answers, so the kiosk never waits on it. */
const FALLBACK_KIT = resolveKit(DEFAULT_KIT_ID, {});

/**
 * The event's kit, with its edits. A `kit-updated` kiosk command refetches
 * it (`useKioskCommands`), so a save in admin shows within a second. In
 * admin's preview it is the draft admin sends instead, and the engine is
 * never asked.
 */
export const useKitQuery = () => {
  const trpc = useTRPC();
  const preview = useKitPreview();
  const query = useQuery({
    ...trpc.booth.getKit.queryOptions(),
    enabled: !isKitPreview,
  });
  return { ...query, data: isKitPreview ? (preview ?? undefined) : query.data };
};

export const useKit = (): ResolvedKit => useKitQuery().data ?? FALLBACK_KIT;

export const useKitCopy = (): KitCopy => useKit().copy;
