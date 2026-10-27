import { Accordion } from "@dither-booth/ui/components/ui/accordion";
import { describe, expect, test } from "bun:test";

import { renderWithProviders, screen } from "#lib/test/render";

import { PrinterAccordionItem } from "./index";

describe("PrinterAccordionItem", () => {
  test("View logs opens the printer's warnings and errors", async () => {
    renderWithProviders(
      <Accordion defaultValue={["printer"]}>
        <PrinterAccordionItem
          isHealthzPending={false}
          isHealthzSuccess={false}
          isHealthzError={true}
        />
      </Accordion>,
      { route: { path: "/control-center" } },
    );

    const link = await screen.findByRole("link", { name: "View logs" });

    expect(link.getAttribute("href")).toBe(
      "/logs?source=engine.printer&levels=error%2Cwarn",
    );
  });
});
