import { Accordion } from "@dither-booth/ui/components/ui/accordion";
import { describe, expect, test } from "bun:test";

import { createSnapshotFixture } from "#lib/system/system.testing";
import { renderWithProviders, screen } from "#lib/test/render";

import { SystemAccordionItem } from "./index";

describe("SystemAccordionItem", () => {
  test("sums up the Pi and links to the System page", async () => {
    renderWithProviders(
      <Accordion defaultValue={["system"]}>
        <SystemAccordionItem
          snapshot={createSnapshotFixture()}
          isPending={false}
          isError={false}
        />
      </Accordion>,
      { route: { path: "/control-center" } },
    );

    const link = await screen.findByRole("link", { name: "View system" });

    expect(link.getAttribute("href")).toBe("/system");
    expect(screen.getByText("61.2 °C, cool")).toBeDefined();
    expect(screen.getByText("Since boot: under-voltage")).toBeDefined();
    expect(screen.getByText(/2\.4 GB available \(63%\)/)).toBeDefined();
    expect(screen.getByText("microSD 67% free, SSD 83% free")).toBeDefined();
  });

  test("says so while the admin server doesn't answer", async () => {
    renderWithProviders(
      <Accordion defaultValue={["system"]}>
        <SystemAccordionItem isPending={false} isError />
      </Accordion>,
      { route: { path: "/control-center" } },
    );

    expect(
      await screen.findByText("The admin server didn't answer."),
    ).toBeDefined();
  });
});
