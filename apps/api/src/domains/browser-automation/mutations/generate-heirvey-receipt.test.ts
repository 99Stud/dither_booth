import { describe, expect, it } from "bun:test";

import { router } from "#internal/trpc.ts";
import { generateHeirveyReceipt } from "./generate-heirvey-receipt.ts";

const createCaller = () => {
  return router({ generateHeirveyReceipt }).createCaller({
    db: undefined as never,
    browser: undefined,
  });
};

describe("generateHeirveyReceipt", () => {
  it("requires an initialized browser", async () => {
    await expect(createCaller().generateHeirveyReceipt({})).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Browser is not initialized.",
    });
  });
});
