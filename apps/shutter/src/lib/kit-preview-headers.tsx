import { KIT_PREVIEW_PARENT_PARAM } from "@dither-booth/shared/kit-preview";

/**
 * Only a page that asks to be admin's live preview may be framed, and only
 * by admin. Everything else is served as before.
 */
export function getKitPreviewDocumentHeaders(
  adminOrigins: readonly string[],
): (url: URL) => HeadersInit | undefined {
  const policy = `frame-ancestors ${adminOrigins.join(" ")}`;

  return (url) =>
    url.searchParams.has(KIT_PREVIEW_PARENT_PARAM)
      ? { "Content-Security-Policy": policy }
      : undefined;
}
