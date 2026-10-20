import type { ResolvedKit } from "@dither-booth/shared/kits";

import {
  KIT_PREVIEW_PARENT_PARAM,
  KIT_PREVIEW_READY_MESSAGE,
  kitPreviewMessageSchema,
} from "@dither-booth/shared/kit-preview";
import { readKitSettings, resolveKit } from "@dither-booth/shared/kits";
import { useSyncExternalStore } from "react";

let previewKit: ResolvedKit | null = null;
const listeners = new Set<() => void>();

/**
 * Whether this page is admin's live preview: framed, with the admin origin
 * in its URL. Read once; a preview page stays one.
 */
export const isKitPreview = (() => {
  if (typeof window === "undefined" || window.parent === window) return false;
  return new URLSearchParams(window.location.search).has(
    KIT_PREVIEW_PARENT_PARAM,
  );
})();

/**
 * Listens for the admin's kit drafts. Only messages from the framing
 * window, from the admin origin named in the URL, shaped like a kit
 * draft, are drawn; the page then tells admin it is ready for one.
 */
export function installKitPreview(): void {
  if (!isKitPreview) return;
  const adminOrigin = new URLSearchParams(window.location.search).get(
    KIT_PREVIEW_PARENT_PARAM,
  );
  if (!adminOrigin) return;

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== adminOrigin) return;
    const parsed = kitPreviewMessageSchema.safeParse(event.data);
    if (!parsed.success) return;
    previewKit = resolveKit(
      parsed.data.kitId,
      readKitSettings(parsed.data.settings).settings,
    );
    for (const listener of listeners) listener();
  });
  window.parent.postMessage(KIT_PREVIEW_READY_MESSAGE, adminOrigin);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The draft admin is previewing, or null outside the preview. */
export const useKitPreview = (): ResolvedKit | null =>
  useSyncExternalStore(subscribe, () => previewKit);
