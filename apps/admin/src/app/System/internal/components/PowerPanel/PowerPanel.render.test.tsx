import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { PowerResult } from "#lib/power/power.protocol";

import { installReducedMotion } from "#lib/system/system.render-testing";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "#lib/test/render";

import { PowerPanel } from "./index";

let restoreMotion: () => void;
let restoreFetch: (() => void) | undefined;

beforeEach(() => {
  restoreMotion = installReducedMotion();
});

afterEach(() => {
  restoreFetch?.();
  restoreMotion();
});

/** The admin server as the panel sees it: `/admin/power`, and nothing else. */
function installFakePowerFetch({
  available,
  result,
}: {
  /** `"page"`: what the admin's page fallback answers off the booth. */
  available: boolean | "page";
  result?: PowerResult;
}) {
  const original = globalThis.fetch;
  const posted: unknown[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== "/admin/power") {
      return new Response("not found", { status: 404 });
    }

    if (init?.method === "POST") {
      posted.push(JSON.parse(String(init.body)));

      return Response.json(result, { status: result?.ok ? 202 : 503 });
    }

    if (available === "page") {
      return new Response("<!doctype html><html></html>", {
        headers: { "content-type": "text/html;charset=utf-8" },
      });
    }

    return available
      ? Response.json({ available: true })
      : new Response("not found", { status: 404 });
  }) as typeof fetch;

  restoreFetch = () => {
    globalThis.fetch = original;
  };

  return { posted };
}

const renderPanel = () =>
  renderWithProviders(<PowerPanel />, { route: { path: "/system" } });

describe("Power panel", () => {
  for (const available of [false, "page"] as const) {
    test(`off the booth (${available === "page" ? "the page fallback" : "404"}), says so and offers nothing`, async () => {
      installFakePowerFetch({ available });
      renderPanel();

      expect(await screen.findByText("On the booth only")).toBeDefined();

      for (const name of ["Restart apps", "Reboot", "Power off"]) {
        expect(
          screen.getByRole("button", { name }).hasAttribute("disabled"),
        ).toBe(true);
      }
    });
  }

  test("reboots only after the confirm, then waits for the booth", async () => {
    const { posted } = installFakePowerFetch({
      available: true,
      result: {
        ok: true,
        action: "reboot",
        acceptedAt: "2026-10-29T10:00:00.000Z",
      },
    });
    renderPanel();

    expect(await screen.findByText("Ready")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Reboot" }));

    const dialog = await screen.findByRole("alertdialog");

    expect(within(dialog).getByText("Reboot the Pi?")).toBeDefined();
    expect(posted).toEqual([]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Reboot" }));

    expect(
      await screen.findByText(
        "Rebooting the Pi. This page reconnects on its own once it's back.",
      ),
    ).toBeDefined();
    expect(posted).toEqual([{ action: "reboot" }]);
    expect(
      screen
        .getByRole("button", { name: "Power off" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  test("shows why the booth refused", async () => {
    installFakePowerFetch({
      available: true,
      result: {
        ok: false,
        code: "not-permitted",
        message:
          "The booth doesn't allow this yet. Run `sudo booth service` on the booth.",
      },
    });
    renderPanel();

    await screen.findByText("Ready");
    fireEvent.click(screen.getByRole("button", { name: "Restart apps" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Restart apps",
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "sudo booth service",
      ),
    );
  });
});
