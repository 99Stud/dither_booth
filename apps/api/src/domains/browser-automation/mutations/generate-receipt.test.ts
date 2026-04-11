import { TICKET_NAME_MODERATION_MESSAGE } from "@dither-booth/moderation";
import { describe, expect, it } from "bun:test";

import { router } from "#internal/trpc.ts";
import { generateReceipt } from "./generate-receipt.ts";

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
        image: "data:image/png;base64,AAAA",
        names: ["LEXOS"],
      }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Receipt page is not initialized.",
    });
  });
});
