import { TICKET_NAME_MODERATION_MESSAGE } from "@dither-booth/moderation";
import { describe, expect, it } from "bun:test";

import { router } from "#internal/trpc.ts";
import { generateReceipt } from "./generate-receipt.ts";

/** Minimal valid PNG (1×1) so server-side dithering can run in tests. */
const VALID_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const createCaller = () => {
  return router({ generateReceipt }).createCaller({
    db: undefined as never,
    page: undefined,
  });
};

describe("generateReceipt", () => {
  it("rejects blocked ticket names before receipt generation starts", async () => {
    await expect(
      createCaller().generateReceipt({
        image: "data:image/png;base64,AAAA",
        names: ["F.U.C.K"],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: TICKET_NAME_MODERATION_MESSAGE,
    });
  });

  it("still requires an initialized page for allowed names", async () => {
    await expect(
      createCaller().generateReceipt({
        image: VALID_PNG_DATA_URL,
        names: ["LEXOS"],
      }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Receipt page is not initialized.",
    });
  });
});
