import { describe, expect, it } from "bun:test";

import { isAllowedConfiguredOrigin } from "./origin.utils";

describe("isAllowedConfiguredOrigin", () => {
  const adminLan = "https://192.168.1.172:3002";

  it("allows the exact configured origin", () => {
    expect(isAllowedConfiguredOrigin(adminLan, adminLan)).toBe(true);
  });

  it("allows localhost and 127.0.0.1 on the same port", () => {
    expect(
      isAllowedConfiguredOrigin("https://localhost:3002", adminLan),
    ).toBe(true);
    expect(
      isAllowedConfiguredOrigin("https://127.0.0.1:3002", adminLan),
    ).toBe(true);
  });

  it("allows manifest machine hostnames on the same port", () => {
    const hostnames = ["99framboises", "99framboises.local"];

    expect(
      isAllowedConfiguredOrigin(
        "https://99framboises.local:3002",
        adminLan,
        hostnames,
      ),
    ).toBe(true);
    expect(
      isAllowedConfiguredOrigin(
        "https://99framboises:3002",
        adminLan,
        hostnames,
      ),
    ).toBe(true);
  });

  it("rejects missing or foreign origins", () => {
    expect(isAllowedConfiguredOrigin(undefined, adminLan)).toBe(false);
    expect(
      isAllowedConfiguredOrigin("https://evil.local:3002", adminLan),
    ).toBe(false);
    expect(
      isAllowedConfiguredOrigin("https://evil.local:3002", adminLan, [
        "99framboises.local",
      ]),
    ).toBe(false);
    expect(
      isAllowedConfiguredOrigin("https://localhost:3999", adminLan),
    ).toBe(false);
    expect(
      isAllowedConfiguredOrigin("http://localhost:3002", adminLan),
    ).toBe(false);
  });
});
