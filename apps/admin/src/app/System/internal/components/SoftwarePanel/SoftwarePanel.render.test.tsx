import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { UpdateSnapshot } from "#lib/update/update.protocol";

import { installReducedMotion } from "#lib/system/system.render-testing";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "#lib/test/render";
import {
  createJobFixture,
  createSnapshotFixture,
} from "#lib/update/update.testing";

import { SoftwarePanel } from "./index";

let restoreMotion: () => void;
let restoreFetch: (() => void) | undefined;

beforeEach(() => {
  restoreMotion = installReducedMotion();
});

afterEach(() => {
  restoreFetch?.();
  restoreMotion();
});

/** `/admin/update` as the panel sees it; null answers 404, as off the booth. */
function installFakeUpdateFetch(snapshot: UpdateSnapshot | null) {
  const original = globalThis.fetch;
  const posted: unknown[] = [];

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    if (String(input) !== "/admin/update" || !snapshot) {
      return new Response("not found", { status: 404 });
    }

    if (init?.method === "POST") {
      posted.push(JSON.parse(String(init.body)));
      return Response.json({ ok: true, snapshot }, { status: 202 });
    }

    return Response.json(snapshot);
  }) as typeof fetch;

  restoreFetch = () => {
    globalThis.fetch = original;
  };

  return { posted };
}

const renderPanel = () =>
  renderWithProviders(<SoftwarePanel />, { route: { path: "/system" } });

describe("Software panel", () => {
  test("off the booth, says so", async () => {
    installFakeUpdateFetch(null);
    renderPanel();

    expect(await screen.findByText("On the booth only")).toBeDefined();
    expect(screen.queryByRole("button", { name: /Update to/ })).toBeNull();
  });

  test("offers the newer release, and installs it only after the confirm", async () => {
    const { posted } = installFakeUpdateFetch(
      createSnapshotFixture({
        release: "0.7.2",
        updateAvailable: true,
        latest: {
          version: "0.8.0",
          notes: "Faster prints.",
          url: "",
          publishedAt: null,
        },
      }),
    );
    renderPanel();

    expect(await screen.findByText("0.8.0 is available")).toBeDefined();
    expect(screen.getByText("Update available")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Update to 0.8.0" }));
    const dialog = await screen.findByRole("alertdialog");

    expect(within(dialog).getByText("Update to 0.8.0?")).toBeDefined();
    expect(posted).toEqual([]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Update" }));

    await waitFor(() =>
      expect(posted).toEqual([{ action: "install", version: "0.8.0" }]),
    );
  });

  test("follows a running update step by step, with nothing to press", async () => {
    installFakeUpdateFetch(
      createSnapshotFixture({
        release: "0.7.2",
        updateAvailable: true,
        job: createJobFixture({ state: "running", step: "download" }),
      }),
    );
    renderPanel();

    const steps = await screen.findByRole("list", { name: "Update steps" });

    expect(
      within(steps)
        .getByText("Download")
        .closest("li")
        ?.getAttribute("aria-current"),
    ).toBe("step");
    expect(screen.getByText("Updating")).toBeDefined();
    expect(screen.queryByRole("button", { name: /Update to/ })).toBeNull();
  });

  test("says when the new release didn't start and the booth went back", async () => {
    installFakeUpdateFetch(
      createSnapshotFixture({
        release: "0.7.2",
        job: createJobFixture({
          state: "rolled-back",
          step: "rollback",
          updatedAt: new Date().toISOString(),
          error: "v0.8.0 didn't start: dither-booth-engine is errored.",
        }),
      }),
    );
    renderPanel();

    expect(
      await screen.findByText(
        "0.8.0 didn't start. The booth went back to 0.7.2.",
      ),
    ).toBeDefined();
    expect(screen.getByText("Rolled back")).toBeDefined();
  });

  test("rolls back across a migration only by restoring, and says what's lost", async () => {
    const { posted } = installFakeUpdateFetch(
      createSnapshotFixture({
        previous: { release: "0.7.2", migrated: true, backupTakenAt: null },
      }),
    );
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Roll back" }));
    const dialog = await screen.findByRole("alertdialog");

    expect(
      within(dialog).getByText(/Visits and draws since then are lost/),
    ).toBeDefined();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Roll back and restore" }),
    );

    await waitFor(() =>
      expect(posted).toEqual([{ action: "rollback", mode: "restore-db" }]),
    );
  });
});
