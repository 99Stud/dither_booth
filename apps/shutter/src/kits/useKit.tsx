import type { KitCopy } from "@dither-booth/shared/kit-copy";
import type { ResolvedKit } from "@dither-booth/shared/kits";

import { DEFAULT_KIT_ID, resolveKit } from "@dither-booth/shared/kits";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "#lib/trpc/trpc.client";

/** Shown until the engine answers, so the kiosk never waits on it. */
const FALLBACK_KIT = resolveKit(DEFAULT_KIT_ID, {});

/**
 * The event's kit, with its edits. A `kit-updated` kiosk command refetches
 * it (`useKioskCommands`), so a save in admin shows within a second.
 */
export const useKitQuery = () => {
  const trpc = useTRPC();
  return useQuery(trpc.booth.getKit.queryOptions());
};

export const useKit = (): ResolvedKit => useKitQuery().data ?? FALLBACK_KIT;

export const useKitCopy = (): KitCopy => useKit().copy;
