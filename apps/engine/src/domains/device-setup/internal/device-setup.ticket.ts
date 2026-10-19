import { buildTextTicket } from "#domains/printer/printer.service";

import type { DeviceSetupLinks } from "./device-setup.links";

const formatPrintedAt = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);

/**
 * The ticket staff take from the booth to connect a device: one QR to the
 * setup page, which handles both a new device and one that already trusts
 * the booth. No admin link: the ticket can end up anywhere.
 */
export function buildSetupTicket(
  links: DeviceSetupLinks,
  printedAt = new Date(),
): Buffer {
  return buildTextTicket([
    { kind: "title", text: "DITHER BOOTH" },
    { kind: "text", text: "Connect a device" },
    { kind: "gap" },
    { kind: "qr", data: links.setupUrl },
    { kind: "small", text: "Scan with the iPad camera, then follow the page." },
    { kind: "gap" },
    { kind: "text", text: links.setupUrl },
    { kind: "gap" },
    { kind: "small", text: "Shutter" },
    ...links.shutterUrls.map((url) => ({ kind: "small" as const, text: url })),
    { kind: "gap" },
    {
      kind: "small",
      text: `Booth address ${links.ip} - ${formatPrintedAt(printedAt)}`,
    },
  ]);
}

/** `;`, `,`, `:`, `"` and `\` are escaped in a Wi-Fi QR's fields. */
const escapeWifiField = (value: string) => value.replace(/([\\;,:"])/g, "\\$1");

/** The QR an iOS or Android camera joins a WPA network from. */
export const formatWifiQr = ({ ssid, password }: BoothWifi) =>
  `WIFI:T:WPA;S:${escapeWifiField(ssid)};P:${escapeWifiField(password)};;`;

export type BoothWifi = { ssid: string; password: string };

/**
 * Printed when the booth found no network it knows and opened its own Wi-Fi:
 * join it, then pick the venue's network from the Darkroom.
 */
export function buildBoothWifiTicket(
  wifi: BoothWifi,
  links: DeviceSetupLinks,
  printedAt = new Date(),
): Buffer {
  return buildTextTicket([
    { kind: "title", text: "DITHER BOOTH" },
    { kind: "text", text: "Booth Wi-Fi is on" },
    {
      kind: "small",
      text: "No network it knows is around, so it made its own.",
    },
    { kind: "gap" },
    { kind: "text", text: "1. Join the booth Wi-Fi" },
    { kind: "qr", data: formatWifiQr(wifi) },
    { kind: "small", text: `Name ${wifi.ssid}` },
    { kind: "small", text: `Password ${wifi.password}` },
    { kind: "gap" },
    { kind: "text", text: "2. Open the setup page" },
    { kind: "qr", data: links.setupUrl },
    { kind: "small", text: links.setupUrl },
    {
      kind: "small",
      text: "Then Darkroom > Wi-Fi to pick the venue network, or keep the booth Wi-Fi.",
    },
    { kind: "gap" },
    {
      kind: "small",
      text: "Booth stuck on a network you can't reach? Power it off and on twice within 2 minutes.",
    },
    { kind: "small", text: formatPrintedAt(printedAt) },
  ]);
}
