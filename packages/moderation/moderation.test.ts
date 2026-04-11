import { describe, expect, it } from "bun:test";

import {
  sanitizeTicketNameInput,
  TICKET_NAME_MODERATION_MESSAGE,
  assertTicketNames,
  validateTicketNames,
} from "./src/index.ts";

describe("validateTicketNames", () => {
  it("accepts ordinary ticket names", () => {
    expect(validateTicketNames(["LEXOS", "ROUSSET"])).toEqual({
      ok: true,
    });
  });

  it("rejects English profanity", () => {
    expect(validateTicketNames(["FUCK"])).toEqual({
      message: TICKET_NAME_MODERATION_MESSAGE,
      ok: false,
    });
  });

  it("rejects French profanity", () => {
    expect(validateTicketNames(["PUTE"])).toEqual({
      message: TICKET_NAME_MODERATION_MESSAGE,
      ok: false,
    });
  });

  it("rejects imported French list entries beyond the manual seed words", () => {
    expect(validateTicketNames(["BORDEL"])).toEqual({
      message: TICKET_NAME_MODERATION_MESSAGE,
      ok: false,
    });
  });

  it("rejects hate-associated historical names", () => {
    expect(validateTicketNames(["HITLER"])).toEqual({
      message: TICKET_NAME_MODERATION_MESSAGE,
      ok: false,
    });
    expect(validateTicketNames(["ADOLF HITLER"])).toEqual({
      message: TICKET_NAME_MODERATION_MESSAGE,
      ok: false,
    });
  });

  it("rejects profanity after kiosk-style sanitization", () => {
    expect(sanitizeTicketNameInput("F.U.C.K")).toBe("FUCK");
    expect(validateTicketNames(["F.U.C.K"])).toEqual({
      message: TICKET_NAME_MODERATION_MESSAGE,
      ok: false,
    });
  });

  it("allows safe names that contain ambiguous French substrings", () => {
    expect(validateTicketNames(["CONSTANCE"])).toEqual({
      ok: true,
    });
  });
});

describe("assertTicketNames", () => {
  it("throws the shared moderation message for blocked names", () => {
    expect(() => {
      assertTicketNames(["FUCK"]);
    }).toThrow(TICKET_NAME_MODERATION_MESSAGE);
  });
});
