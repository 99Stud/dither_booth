import { describe, expect, it } from "bun:test";

import { getMachineCertificateHostnames } from "./hostname.utils";

describe("getMachineCertificateHostnames", () => {
  it("returns bare hostname and .local alias", () => {
    expect(getMachineCertificateHostnames("99framboises")).toEqual([
      "99framboises",
      "99framboises.local",
    ]);
  });

  it("normalizes an existing .local suffix", () => {
    expect(getMachineCertificateHostnames("99Framboises.local")).toEqual([
      "99framboises",
      "99framboises.local",
    ]);
  });

  it("skips localhost and IP hostnames", () => {
    expect(getMachineCertificateHostnames("localhost")).toEqual([]);
    expect(getMachineCertificateHostnames("127.0.0.1")).toEqual([]);
    expect(getMachineCertificateHostnames("192.168.1.10")).toEqual([]);
    expect(getMachineCertificateHostnames("")).toEqual([]);
  });
});
