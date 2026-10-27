import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { validateLogsSearch } from "#lib/logs/logs.search";
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "#lib/test/render";

import { Logs } from "./index";
import {
  installFakeLogSockets,
  logEntry,
  scrollLogsUp,
} from "./internal/Logs.testing";

let sockets: ReturnType<typeof installFakeLogSockets>;

beforeEach(() => {
  sockets = installFakeLogSockets();
});

afterEach(() => {
  sockets.restore();
});

const renderLogs = (url = "/logs") =>
  renderWithProviders(<Logs />, {
    route: { path: "/logs", url, validateSearch: validateLogsSearch },
  });

/** Renders the page and connects it: the socket is open, nothing sent yet. */
const openLogs = async (url?: string) => {
  const result = renderLogs(url);
  await screen.findByRole("log");
  const socket = sockets.latest();
  socket.open();
  return { ...result, socket };
};

describe("Logs page", () => {
  test("asks the booth for the latest lines and shows them", async () => {
    const { socket } = await openLogs();

    expect(socket.lastRequest()).toEqual({
      type: "history",
      filter: {},
      limit: 500,
    });

    socket.history([
      logEntry({ service: "engine", event: "printer-connected" }),
      logEntry({ service: "shutter", event: "kiosk-page-connected" }),
    ]);

    expect(await screen.findByText("printer-connected")).toBeDefined();
    expect(screen.getByText("kiosk-page-connected")).toBeDefined();
  });

  test("adds live lines from every service as they arrive", async () => {
    const { socket } = await openLogs();
    socket.history([logEntry({ event: "first-line" })]);
    await screen.findByText("first-line");

    socket.append([
      logEntry({ service: "admin", event: "admin-line" }),
      logEntry({ service: "system", event: "wifi-joined" }),
    ]);

    expect(await screen.findByText("admin-line")).toBeDefined();
    expect(screen.getByText("wifi-joined")).toBeDefined();
  });

  test("a service chip hides its lines, updates the URL and asks again", async () => {
    const { socket, router } = await openLogs();
    socket.history([
      logEntry({ service: "engine", event: "engine-line" }),
      logEntry({ service: "shutter", event: "shutter-line" }),
    ]);
    await screen.findByText("engine-line");

    fireEvent.click(screen.getByRole("button", { name: /^Shutter/ }));

    await waitFor(() =>
      expect(router?.state.location.search).toEqual({
        services: "engine,admin,system,browser",
      }),
    );
    expect(socket.lastRequest()).toEqual({
      type: "history",
      filter: { services: ["engine", "admin", "system", "browser"] },
      limit: 500,
    });

    socket.history([logEntry({ service: "engine", event: "engine-line-2" })]);
    expect(await screen.findByText("engine-line-2")).toBeDefined();
    expect(screen.queryByText("shutter-line")).toBeNull();

    // Live lines arrive unfiltered: the page hides them itself.
    socket.append([
      logEntry({ service: "shutter", event: "shutter-live" }),
      logEntry({ service: "engine", event: "engine-live" }),
    ]);
    expect(await screen.findByText("engine-live")).toBeDefined();
    expect(screen.queryByText("shutter-live")).toBeNull();
  });

  test("a level toggle hides that level and shows each level's count", async () => {
    const { socket, router } = await openLogs();
    socket.history([
      logEntry({ level: "error", event: "print-failed" }),
      logEntry({ level: "warn", event: "paper-low" }),
      logEntry({ level: "info", event: "ticket-printed" }),
      logEntry({ level: "info", event: "visit-started" }),
    ]);
    await screen.findByText("print-failed");

    const levels = screen.getByRole("group", { name: "Levels" });
    expect(
      within(levels).getByRole("button", { name: /Info/ }).textContent,
    ).toBe("Info2");

    fireEvent.click(within(levels).getByRole("button", { name: /Info/ }));

    await waitFor(() =>
      expect(router?.state.location.search).toEqual({ levels: "error,warn" }),
    );
    expect(socket.lastRequest()?.filter).toEqual({ levels: ["error", "warn"] });
  });

  test("search filters the lines, marks matches and goes in the URL", async () => {
    const { socket, router } = await openLogs();
    socket.history([logEntry({ event: "paper-low" })]);
    await screen.findByText("paper-low");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search logs" }), {
      target: { value: "paper" },
    });

    await waitFor(() =>
      expect(router?.state.location.search).toEqual({ q: "paper" }),
    );
    expect(socket.lastRequest()?.filter).toEqual({ text: "paper" });

    socket.history([logEntry({ event: "paper-low" })]);
    socket.append([logEntry({ event: "ticket-printed" })]);

    const mark = await screen.findByText("paper", { selector: "mark" });
    expect(mark.parentElement?.textContent).toBe("paper-low");
    expect(screen.queryByText("ticket-printed")).toBeNull();
  });

  test("/ focuses search", async () => {
    await openLogs();

    fireEvent.keyDown(document.body, { key: "/" });

    expect(document.activeElement).toBe(
      screen.getByRole("searchbox", { name: "Search logs" }),
    );
  });

  test("expanding a line shows its details, error and stack", async () => {
    const { socket } = await openLogs();
    socket.history([
      logEntry({
        level: "error",
        source: "engine.printer",
        event: "print-failed",
        details: { ticket: 42 },
        error: {
          name: "PrinterError",
          message: "Paper out",
          stack: "PrinterError: Paper out\n    at print (printer.ts:10)",
        },
      }),
    ]);
    const line = await screen.findByRole("button", { name: /print-failed/ });
    expect(line.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(line);

    expect(line.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/"ticket": 42/)).toBeDefined();
    expect(screen.getByText(/at print \(printer\.ts:10\)/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Copy JSON" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Copy line" })).toBeDefined();
  });

  test("plain-text lines show their raw text", async () => {
    const { socket } = await openLogs();
    socket.history([
      logEntry({
        level: "error",
        source: undefined,
        event: undefined,
        raw: "Segmentation fault at 0x0",
      }),
    ]);

    expect(await screen.findByText("Segmentation fault at 0x0")).toBeDefined();
  });

  test("shows restart and rotation dividers", async () => {
    const { socket } = await openLogs();
    socket.history([
      logEntry({
        service: "engine",
        source: "engine.server",
        event: "server-started",
        timestamp: "2026-10-27T14:02:15.000Z",
      }),
    ]);

    expect(
      await screen.findByRole("separator", { name: /^Engine restarted · / }),
    ).toBeDefined();

    socket.status("admin", "rotated", "The log file was rotated.");

    expect(
      await screen.findByRole("separator", { name: /^Admin log rotated · / }),
    ).toBeDefined();
  });

  test("restart dividers show through the printer's View logs preset", async () => {
    const { socket } = await openLogs(
      "/logs?source=engine.printer&levels=warn,error",
    );
    socket.history([]);

    socket.append([
      logEntry({
        service: "engine",
        source: "engine.server",
        event: "server-started",
        timestamp: "2026-10-27T14:02:15.000Z",
      }),
      logEntry({ service: "engine", source: "engine.server", event: "noise" }),
    ]);

    expect(
      await screen.findByRole("separator", { name: /^Engine restarted · / }),
    ).toBeDefined();
    expect(screen.queryByText("noise")).toBeNull();
  });

  test("says when the booth has no logs yet", async () => {
    const { socket } = await openLogs();
    expect(screen.getByLabelText("Loading logs")).toBeDefined();

    socket.history([]);

    expect(await screen.findByText("No logs yet")).toBeDefined();
  });

  test("says when no line matches, with a way to clear the filters", async () => {
    const { socket, router } = await openLogs("/logs?levels=error");
    socket.history([]);

    await screen.findByText("No lines match");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() => expect(router?.state.location.search).toEqual({}));
    expect(socket.lastRequest()?.filter).toEqual({});
  });

  test("says which sources are unavailable, and why", async () => {
    const { socket } = await openLogs("/logs?services=engine");
    socket.status("engine", "unavailable", "Not running under PM2.");
    socket.history([]);

    const list = within(screen.getByRole("log"));
    expect(await list.findByText("Logs unavailable")).toBeDefined();
    expect(list.getByRole("listitem").textContent).toBe(
      "Engine: Not running under PM2.",
    );
    expect(
      screen.getByRole("button", { name: /^Engine.*unavailable/ }),
    ).toBeDefined();
  });

  test("each service chip shows its error count", async () => {
    const { socket } = await openLogs();
    socket.history([
      logEntry({ service: "engine", level: "error" }),
      logEntry({ service: "engine", level: "error" }),
      logEntry({ service: "shutter", level: "warn" }),
    ]);

    expect(
      await screen.findByRole("button", { name: "Engine 2 errors" }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Shutter" })).toBeDefined();
  });

  test("the connection badge follows the socket, and a reconnect resumes with no gap", async () => {
    renderLogs();
    expect(
      await screen.findByRole("status", { name: "Connection: Connecting" }),
    ).toBeDefined();

    const socket = sockets.latest();
    socket.open();
    socket.history([logEntry({ event: "before-drop" })], { cursor: "c-1" });
    await screen.findByText("before-drop");
    expect(
      screen.getByRole("status", { name: "Connection: Live" }),
    ).toBeDefined();

    socket.drop();

    expect(
      await screen.findByRole("status", { name: "Connection: Reconnecting" }),
    ).toBeDefined();
    expect(
      await screen.findByRole("separator", { name: /^Connection lost · / }),
    ).toBeDefined();

    // Back online: the page tries again at once.
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    const resumed = sockets.latest();
    expect(resumed).not.toBe(socket);
    resumed.open();

    expect(resumed.lastRequest()).toEqual({
      type: "history",
      filter: {},
      limit: 500,
      after: "c-1",
    });

    resumed.history([logEntry({ event: "while-away" })], { done: true });

    expect(await screen.findByText("while-away")).toBeDefined();
    expect(
      await screen.findByRole("separator", {
        name: /^Reconnected · no lines missed/,
      }),
    ).toBeDefined();
    expect(
      screen.getByRole("status", { name: "Connection: Live" }),
    ).toBeDefined();
  });

  test("a rotation while away marks the reconnect as a possible gap", async () => {
    const { socket } = await openLogs();
    socket.history([logEntry({ event: "before-drop" })]);
    await screen.findByText("before-drop");
    socket.drop();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    const resumed = sockets.latest();
    resumed.open();

    resumed.status("engine", "rotated", "The log file was rotated.");
    resumed.history([], { done: true });

    expect(
      await screen.findByRole("separator", {
        name: /^Reconnected · some lines may be missing/,
      }),
    ).toBeDefined();
  });

  test("after falling behind, waits out the backoff and reloads the latest lines, marked as a gap", async () => {
    const { socket } = await openLogs();
    socket.history([logEntry({ event: "before-drop" })], { cursor: "c-1" });
    await screen.findByText("before-drop");

    socket.drop(1013);
    await act(() => Bun.sleep(50));
    expect(sockets.latest()).toBe(socket);
    expect(
      screen.getByRole("status", { name: "Connection: Reconnecting" }),
    ).toBeDefined();

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    const reloaded = sockets.latest();
    expect(reloaded).not.toBe(socket);
    reloaded.open();

    expect(reloaded.lastRequest()).toEqual({
      type: "history",
      filter: {},
      limit: 500,
    });

    reloaded.history([logEntry({ event: "latest-line" })]);

    expect(await screen.findByText("latest-line")).toBeDefined();
    expect(screen.getByText("before-drop")).toBeDefined();
    expect(
      await screen.findByRole("separator", {
        name: /^Reconnected · some lines may be missing/,
      }),
    ).toBeDefined();
  });

  test("goes Offline after failed attempts, with a way to retry", async () => {
    const { socket } = await openLogs();
    socket.history([]);
    await screen.findByText("No logs yet");

    socket.drop();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      act(() => {
        window.dispatchEvent(new Event("online"));
      });
      sockets.latest().drop();
    }

    expect(
      await screen.findByRole("status", { name: "Connection: Offline" }),
    ).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain(
      "Can't reach the booth's logs.",
    );

    const before = sockets.sockets.length;
    fireEvent.click(screen.getByRole("button", { name: "Retry now" }));
    expect(sockets.sockets.length).toBe(before + 1);
  });

  test("pause holds new lines and announces new errors; resume shows them", async () => {
    const { socket } = await openLogs();
    socket.history([logEntry({ event: "first-line" })]);
    await screen.findByText("first-line");

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(
      screen.getByRole("status", { name: "Connection: Paused" }),
    ).toBeDefined();

    socket.append([
      logEntry({ level: "error", event: "print-failed" }),
      logEntry({ level: "error", event: "print-failed-again" }),
      logEntry({ level: "info", event: "visit-started" }),
    ]);

    expect(
      await screen.findByRole("status", { name: "Connection: Paused · 3 new" }),
    ).toBeDefined();
    expect(screen.getByText("2 new errors")).toBeDefined();
    expect(screen.queryByText("print-failed")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));

    expect(await screen.findByText("print-failed")).toBeDefined();
    expect(screen.getByText("visit-started")).toBeDefined();
    expect(
      screen.getByRole("status", { name: "Connection: Live" }),
    ).toBeDefined();
  });

  test("scrolling up stops following and shows a pill that jumps back", async () => {
    const { socket } = await openLogs();
    socket.history([logEntry({ event: "first-line" })]);
    await screen.findByText("first-line");

    await scrollLogsUp();
    socket.append([logEntry({ event: "new-1" }), logEntry({ event: "new-2" })]);

    const pill = await screen.findByRole("button", {
      name: "2 new lines · Jump to latest",
    });
    fireEvent.click(pill);

    expect(screen.queryByRole("button", { name: /Jump to latest/ })).toBeNull();
  });

  test("End jumps to the latest line", async () => {
    const { socket } = await openLogs();
    socket.history([logEntry({ event: "first-line" })]);
    await screen.findByText("first-line");
    await scrollLogsUp();
    socket.append([logEntry({ event: "new-1" })]);
    await screen.findByRole("button", { name: "1 new line · Jump to latest" });

    fireEvent.keyDown(document.body, { key: "End" });

    expect(screen.queryByRole("button", { name: /Jump to latest/ })).toBeNull();
  });

  test("asks for older lines, with the current filter, at the top", async () => {
    const { socket } = await openLogs("/logs?levels=error");
    socket.history([logEntry({ level: "error", event: "newer" })], {
      done: false,
      cursor: "c-9",
    });
    await screen.findByText("newer");

    await waitFor(() =>
      expect(socket.lastRequest()).toEqual({
        type: "history",
        filter: { levels: ["error"] },
        limit: 500,
        before: "c-9",
      }),
    );

    socket.history([logEntry({ level: "error", event: "older" })], {
      done: true,
    });

    expect(await screen.findByText("older")).toBeDefined();
    expect(screen.getByText("Start of the log")).toBeDefined();
  });

  test("starts from the filter in the URL", async () => {
    const { socket } = await openLogs(
      "/logs?services=engine&levels=warn,error&source=engine.printer&q=paper",
    );

    expect(socket.lastRequest()).toEqual({
      type: "history",
      filter: {
        services: ["engine"],
        levels: ["error", "warn"],
        source: "engine.printer",
        text: "paper",
      },
      limit: 500,
    });
  });
});
