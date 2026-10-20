import { describe, expect, test } from "bun:test";

import { getKitPreviewDocumentHeaders } from "#lib/kit-preview-headers";

const headersFor = getKitPreviewDocumentHeaders([
  "https://192.168.1.10:3001",
  "https://booth.local:3001",
]);

describe("getKitPreviewDocumentHeaders", () => {
  test("lets only admin frame a page that asks to be the preview", () => {
    expect(
      headersFor(
        new URL("https://booth.local:3000/preview?kitPreview=https://x"),
      ),
    ).toEqual({
      "Content-Security-Policy":
        "frame-ancestors https://192.168.1.10:3001 https://booth.local:3001",
    });
  });

  test("adds nothing to the kiosk or any other page", () => {
    expect(headersFor(new URL("https://booth.local:3000/"))).toBeUndefined();
    expect(
      headersFor(new URL("https://booth.local:3000/preview")),
    ).toBeUndefined();
  });
});
