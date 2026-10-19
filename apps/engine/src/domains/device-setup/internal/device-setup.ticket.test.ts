import { describe, expect, test } from "bun:test";

import {
  buildBoothWifiTicket,
  buildSetupTicket,
  formatWifiQr,
} from "./device-setup.ticket";

describe("buildSetupTicket", () => {
  const ticket = buildSetupTicket(
    {
      darkroomUrl: "https://booth.local:3000/darkroom",
      ip: "192.168.1.42",
      localSetupUrl: "http://booth.local:3003",
      setupUrl: "http://192.168.1.42:3003",
      shutterUrls: ["https://booth.local:3000", "https://192.168.1.42:3000"],
    },
    "Venue-Guest",
    { printedAt: new Date("2026-10-19T14:05:00Z") },
  ).toString("latin1");

  test("names the Wi-Fi the iPad has to be on", () => {
    expect(ticket).toContain("On Venue-Guest");
  });

  test("encodes the setup page in the QR and prints its address", () => {
    // GS ( k store: length = data + 3, then `1P0` and the data.
    expect(ticket).toContain("1P0http://192.168.1.42:3003");
    expect(ticket.split("http://192.168.1.42:3003")).toHaveLength(3);
  });

  test("adds a second QR at .local, after the IP one", () => {
    expect(ticket.indexOf("1P0http://booth.local:3003")).toBeGreaterThan(
      ticket.indexOf("1P0http://192.168.1.42:3003"),
    );
  });

  test("lists the Shutter addresses, and never the admin", () => {
    expect(ticket).toContain("https://booth.local:3000");
    expect(ticket).not.toContain(":3002");
  });
});

describe("booth Wi-Fi ticket", () => {
  test("escapes the characters a Wi-Fi QR reserves", () => {
    expect(formatWifiQr({ password: 'a;b"c', ssid: "Dither:Booth" })).toBe(
      'WIFI:T:WPA;S:Dither\\:Booth;P:a\\;b\\"c;;',
    );
  });

  test("joins the booth Wi-Fi first, then opens the setup page", () => {
    const ticket = buildBoothWifiTicket(
      { password: "k3mn7pqrst", ssid: "DitherBooth-AB12" },
      {
        darkroomUrl: "https://10.42.0.1:3000/darkroom",
        ip: "10.42.0.1",
        localSetupUrl: null,
        setupUrl: "http://10.42.0.1:3003",
        shutterUrls: ["https://10.42.0.1:3000"],
      },
    ).toString("latin1");

    expect(ticket.indexOf("WIFI:T:WPA;S:DitherBooth-AB12")).toBeLessThan(
      ticket.indexOf("1P0http://10.42.0.1:3003"),
    );
    expect(ticket).toContain("Password k3mn7pqrst");
  });

  test("leads with why the booth came back to its own Wi-Fi", () => {
    const ticket = buildBoothWifiTicket(
      { password: "k3mn7pqrst", ssid: "DitherBooth-AB12" },
      {
        darkroomUrl: "https://10.42.0.1:3000/darkroom",
        ip: "10.42.0.1",
        localSetupUrl: null,
        setupUrl: "http://10.42.0.1:3003",
        shutterUrls: ["https://10.42.0.1:3000"],
      },
      { notice: "Couldn't join Venue-Guest: Wrong password." },
    ).toString("latin1");

    expect(ticket.indexOf("Couldn't join Venue-Guest")).toBeLessThan(
      ticket.indexOf("Booth Wi-Fi is on"),
    );
  });
});
