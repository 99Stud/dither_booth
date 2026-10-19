import { describe, expect, test } from "bun:test";

import { needsNewCertificate } from "./cert";

describe("needsNewCertificate", () => {
  test("keeps the certificate while the booth stays on the same address", () => {
    expect(
      needsNewCertificate({
        certificateIp: "192.168.1.42",
        hasCertificate: true,
        coversBoothWifi: true,
        lanIp: "192.168.1.42",
      }),
    ).toBe(false);
  });

  test("re-issues on a new network, or when there's no certificate", () => {
    expect(
      needsNewCertificate({
        certificateIp: "192.168.1.42",
        hasCertificate: true,
        coversBoothWifi: true,
        lanIp: "10.0.0.7",
      }),
    ).toBe(true);
    expect(
      needsNewCertificate({
        certificateIp: "192.168.1.42",
        hasCertificate: false,
        coversBoothWifi: true,
        lanIp: "192.168.1.42",
      }),
    ).toBe(true);
    expect(
      needsNewCertificate({
        certificateIp: undefined,
        hasCertificate: true,
        coversBoothWifi: true,
        lanIp: "192.168.1.42",
      }),
    ).toBe(true);
  });

  test("keeps it on the booth Wi-Fi, whose address every certificate covers", () => {
    expect(
      needsNewCertificate({
        certificateIp: "192.168.1.42",
        coversBoothWifi: true,
        hasCertificate: true,
        lanIp: "10.42.0.1",
      }),
    ).toBe(false);
  });

  test("re-issues a certificate from before the booth Wi-Fi was covered", () => {
    expect(
      needsNewCertificate({
        certificateIp: "192.168.1.42",
        coversBoothWifi: false,
        hasCertificate: true,
        lanIp: "192.168.1.42",
      }),
    ).toBe(true);
  });
});
