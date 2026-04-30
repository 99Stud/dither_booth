import { describe, expect, it } from "bun:test";

import { getProxiedRequestHeaders, getSafeFileUrl } from "./server-utils";

const distRoot = new URL("file:///tmp/dither-booth-web-dist/");

describe("getSafeFileUrl", () => {
  it("resolves asset paths inside the dist directory", () => {
    expect(getSafeFileUrl(distRoot, "assets/app.js")?.href).toBe(
      "file:///tmp/dither-booth-web-dist/assets/app.js",
    );
  });

  it("rejects parent directory traversal", () => {
    expect(() => getSafeFileUrl(distRoot, "../secret.txt")).toThrow();
    expect(() => getSafeFileUrl(distRoot, "%2e%2e/secret.txt")).toThrow();
  });

  it("rejects backslash traversal before creating a file URL", () => {
    expect(() => getSafeFileUrl(distRoot, "..\\secret.txt")).toThrow();
    expect(() => getSafeFileUrl(distRoot, "%2e%2e%5Csecret.txt")).toThrow();
  });
});

describe("getProxiedRequestHeaders", () => {
  it("drops spoofable proxy headers while preserving request metadata", () => {
    const headers = getProxiedRequestHeaders(
      new Headers({
        authorization: "Bearer token",
        connection: "upgrade",
        "content-type": "application/json",
        forwarded: "for=evil",
        host: "evil.example",
        "proxy-authorization": "secret",
        "x-forwarded-host": "evil.example",
      }),
    );

    expect(headers.get("authorization")).toBe("Bearer token");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.has("connection")).toBe(false);
    expect(headers.has("forwarded")).toBe(false);
    expect(headers.has("host")).toBe(false);
    expect(headers.has("proxy-authorization")).toBe(false);
    expect(headers.has("x-forwarded-host")).toBe(false);
  });
});
