import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "bun:test";

import {
  WEB_HEALTHZ_SERVICE,
  webHealthzPayloadSchema,
} from "./healthz.constants";
import {
  createHealthzPayload,
  fetchRemoteHealthzPayload,
} from "./healthz.utils";

describe("createHealthzPayload", () => {
  it("creates a healthy payload with an ISO timestamp", () => {
    const payload = createHealthzPayload({
      mode: "development",
      service: "api",
    });

    expect(payload.ok).toBe(true);
    expect(payload.service).toBe("api");
    expect(payload.mode).toBe("development");
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
  });
});

describe("fetchRemoteHealthzPayload", () => {
  it("returns a parsed remote health payload", async () => {
    const payload = createHealthzPayload({
      mode: "production",
      service: WEB_HEALTHZ_SERVICE,
    });

    const parsed = await fetchRemoteHealthzPayload({
      fetcher: async () => Response.json(payload),
      schema: webHealthzPayloadSchema,
      serviceName: "Web",
      timeoutMs: 5000,
      url: new URL("https://web.local/healthz"),
    });

    expect(parsed).toEqual(payload);
  });

  it("maps remote non-OK responses to BAD_GATEWAY", async () => {
    try {
      await fetchRemoteHealthzPayload({
        fetcher: async () => new Response(null, { status: 503 }),
        schema: webHealthzPayloadSchema,
        serviceName: "Web",
        timeoutMs: 5000,
        url: new URL("https://web.local/healthz"),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("BAD_GATEWAY");
      expect((error as TRPCError).message).toBe(
        "Web health endpoint returned HTTP 503.",
      );
      return;
    }

    throw new Error("Expected fetchRemoteHealthzPayload to throw.");
  });

  it("rejects unexpected remote payloads", async () => {
    try {
      await fetchRemoteHealthzPayload({
        fetcher: async () =>
          Response.json({
            ok: true,
            service: "api",
            mode: "production",
            timestamp: new Date().toISOString(),
          }),
        schema: webHealthzPayloadSchema,
        serviceName: "Web",
        timeoutMs: 5000,
        url: new URL("https://web.local/healthz"),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("BAD_GATEWAY");
      expect((error as TRPCError).message).toBe(
        "Web health endpoint returned unexpected payload.",
      );
      return;
    }

    throw new Error("Expected fetchRemoteHealthzPayload to throw.");
  });
});
