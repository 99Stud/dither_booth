import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

/**
 * Admin's preview only draws: no engine mutation, no camera, no kiosk
 * channel. These files are the preview's own code, so a call to any of those
 * showing up here is a visit, a print or a camera prompt waiting to happen
 * inside an admin tab.
 */
const PREVIEW_FILES = [
  new URL("kitPreview.tsx", import.meta.url),
  new URL("../app/KitPreview/index.tsx", import.meta.url),
  new URL(
    "../app/Experience/internal/components/KitLanding/index.tsx",
    import.meta.url,
  ),
];

const FORBIDDEN = [
  "useMutation",
  "useTRPC",
  "useSubscription",
  "getUserMedia",
  "react-webcam",
  "useKioskCommands",
];

describe("the kit preview", () => {
  test.each(PREVIEW_FILES.map((url) => [url.pathname, url] as const))(
    "%s never reaches the engine, the camera or the kiosk channel",
    async (_, url) => {
      const source = await readFile(url, "utf8");
      for (const word of FORBIDDEN) expect(source).not.toContain(word);
    },
  );
});
