import { describe, expect, it } from "bun:test";

import type { LogEntry } from "./logs.types";

import { matchesLogFilter } from "./logs.utils";

const entry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
  id: "engine::0:0",
  timestamp: "2026-10-27T12:00:00.000Z",
  service: "engine",
  stream: "out",
  level: "info",
  source: "engine.printer",
  event: "print-started",
  raw: '[kiosk] {"event":"print-started","details":{"ticket":"A-42"}}',
  origin: "server",
  ...overrides,
});

describe("matchesLogFilter", () => {
  it("lets everything through an empty filter", () => {
    expect(matchesLogFilter(entry(), {})).toBe(true);
  });

  it("matches nothing when no service is selected", () => {
    expect(matchesLogFilter(entry(), { services: [] })).toBe(false);
  });

  it("files browser lines under the Browser chip, not their server", () => {
    const browserLine = entry({ service: "shutter", origin: "browser" });

    expect(matchesLogFilter(browserLine, { services: ["browser"] })).toBe(true);
    expect(matchesLogFilter(browserLine, { services: ["shutter"] })).toBe(
      false,
    );
    expect(matchesLogFilter(entry(), { services: ["browser"] })).toBe(false);
  });

  it("filters by level and exact source", () => {
    expect(matchesLogFilter(entry(), { levels: ["warn", "error"] })).toBe(
      false,
    );
    expect(
      matchesLogFilter(entry({ level: "warn" }), { levels: ["warn"] }),
    ).toBe(true);
    expect(matchesLogFilter(entry(), { source: "engine.printer" })).toBe(true);
    expect(matchesLogFilter(entry(), { source: "engine" })).toBe(false);
  });

  it("searches the raw line and the error, ignoring case", () => {
    expect(matchesLogFilter(entry(), { text: "a-42" })).toBe(true);
    expect(
      matchesLogFilter(
        entry({ error: { message: "x", stack: "at PrintQueue" } }),
        {
          text: "printqueue",
        },
      ),
    ).toBe(true);
    expect(matchesLogFilter(entry(), { text: "lottery" })).toBe(false);
  });

  it("needs every part of the filter to match", () => {
    expect(
      matchesLogFilter(entry({ level: "error" }), {
        services: ["engine"],
        levels: ["error"],
        text: "lottery",
      }),
    ).toBe(false);
  });
});
