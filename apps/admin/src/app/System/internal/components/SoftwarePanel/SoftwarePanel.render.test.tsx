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

/** What the engine says when the install dialog asks it. */
type Engine = {
  event: { startsAt: string | null; endsAt: string | null } | null;
  recentVisits: number;
  printing: boolean;
};

const QUIET: Engine = { event: null, recentVisits: 0, printing: false };

/**
 * The admin server as the panel sees it: `/admin/update` (null answers
 * 404, as off the booth) and the engine's queries through the proxy.
 */
function installFakeFetch(snapshot: UpdateSnapshot | null, engine = QUIET) {
  const original = globalThis.fetch;
  const posted: unknown[] = [];

  const engineAnswer = (path: string) => {
    if (path.includes("getCurrentEvent")) {
      return engine.event ? { campaign: engine.event } : null;
    }
    if (path.includes("getVisitStats")) {
      return { recentVisits: engine.recentVisits };
    }
    if (path.includes("getHealthz")) {
      return { printer: { printing: engine.printing } };
    }
    return null;
  };

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const path = String(input);

    if (path.startsWith("/engine/trpc")) {
      // One or more procedures per request; each answers in tRPC's envelope.
      const procedures = path.slice("/engine/trpc/".length).split("?")[0] ?? "";
      const results = procedures
        .split(",")
        .map((name) => ({ result: { data: engineAnswer(name) } }));
      return Response.json(results.length === 1 ? results[0] : results);
    }

    if (path !== "/admin/update" || !snapshot) {
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

const available = (overrides: Partial<UpdateSnapshot> = {}) =>
  createSnapshotFixture({
    release: "0.7.2",
    updateAvailable: true,
    latest: {
      version: "0.8.0",
      notes:
        "## Faster prints\n- Receipts print in **half** the time\n- Fixes `usb` on Debian 13",
      url: "https://github.com/99Stud/dither_booth/releases/tag/v0.8.0",
      publishedAt: null,
    },
    ...overrides,
  });

describe("Software panel", () => {
  test("off the booth, says so", async () => {
    installFakeFetch(null);
    renderPanel();

    expect(await screen.findByText("On the booth only")).toBeDefined();
    expect(screen.queryByRole("button", { name: /Update to/ })).toBeNull();
  });

  test("offers the newer release with its notes, and installs only after the confirm", async () => {
    const { posted } = installFakeFetch(available());
    renderPanel();

    expect(await screen.findByText("0.8.0 is available")).toBeDefined();
    expect(screen.getByText("Update available")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "What's new" }));
    expect(screen.getByText("Faster prints")).toBeDefined();
    expect(screen.getByText("half")).toBeDefined();
    expect(screen.queryByText("**half**")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Update to 0.8.0" }));
    const dialog = await screen.findByRole("alertdialog");

    expect(within(dialog).getByText("Update to 0.8.0?")).toBeDefined();
    const checks = within(dialog).getByRole("list", {
      name: "Before updating",
    });
    expect(within(checks).getByText("The booth reaches GitHub.")).toBeDefined();
    expect(within(checks).getByText("Nothing else is running.")).toBeDefined();
    expect(posted).toEqual([]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Update" }));

    await waitFor(() =>
      expect(posted).toEqual([{ action: "install", version: "0.8.0" }]),
    );
  });

  test("warns about the event, the guests and the printer without stopping the update", async () => {
    installFakeFetch(available(), {
      event: {
        startsAt: new Date(Date.now() - 3_600_000).toISOString(),
        endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      recentVisits: 3,
      printing: true,
    });
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "Update to 0.8.0" }),
    );
    const dialog = await screen.findByRole("alertdialog");

    expect(
      await within(dialog).findByText(
        "The event is running: guests may be waiting.",
      ),
    ).toBeDefined();
    expect(
      within(dialog).getByText(
        "Guests used the booth 3 times in the last 15 minutes.",
      ),
    ).toBeDefined();
    expect(
      within(dialog).getByText(
        "A ticket is printing: the restart would cut it off.",
      ),
    ).toBeDefined();
    expect(
      within(dialog)
        .getByRole("button", { name: "Update anyway" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  test("won't update without internet or room, and says which", async () => {
    installFakeFetch(
      available({
        check: {
          state: "unreachable",
          checkedAt: null,
          message: "fetch failed",
        },
        preflight: { freeBytes: 200 * 1024 ** 2, neededBytes: 1024 ** 3 },
      }),
    );
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "Update to 0.8.0" }),
    );
    const dialog = await screen.findByRole("alertdialog");

    expect(
      within(dialog).getByText(
        "The booth can't reach GitHub: is it on the internet?",
      ),
    ).toBeDefined();
    expect(
      within(dialog).getByText(/200 MB free on the SD card/),
    ).toBeDefined();
    expect(
      within(dialog)
        .getByRole("button", { name: "Update" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  test("follows a running update on its gauge and steps, with its log", async () => {
    installFakeFetch(
      available({
        job: createJobFixture({ state: "running", step: "download" }),
        jobRunning: true,
        log: ["Downloading dither-booth-0.8.0-linux-arm64.tar.zst"],
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
    expect(screen.getByText("Updating to 0.8.0")).toBeDefined();
    expect(screen.queryByRole("button", { name: /Update to/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByLabelText("Update log").textContent).toContain(
      "Downloading dither-booth-0.8.0",
    );
  });

  test("treats a job a crash left running as over", async () => {
    installFakeFetch(
      available({
        job: createJobFixture({
          state: "running",
          step: "download",
          process: { pid: 2_147_483_000, bootId: "gone", startedTicks: 0 },
          updatedAt: new Date().toISOString(),
        }),
        jobRunning: false,
      }),
    );
    renderPanel();

    expect(
      await screen.findByRole("button", { name: "Update to 0.8.0" }),
    ).toBeDefined();
    expect(screen.queryByRole("list", { name: "Update steps" })).toBeNull();
  });

  test("says when the new release didn't start and the booth went back", async () => {
    installFakeFetch(
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
    const { posted } = installFakeFetch(
      createSnapshotFixture({
        previous: {
          release: "0.7.2",
          migrated: true,
          backup: "/mnt/ssd/dither-booth/backups/update-x.sqlite",
          backupTakenAt: null,
        },
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
