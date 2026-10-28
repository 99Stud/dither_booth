import { describe, expect, test } from "bun:test";

import { renderWithProviders, screen } from "#lib/test/render";

import { RarityBadge } from "./index";

describe("RarityBadge", () => {
  test("shows the rarity as a capitalised label", () => {
    renderWithProviders(<RarityBadge rarity="legendary" />);

    expect(screen.getByText("Legendary")).toBeDefined();
  });

  test("prefixes the label with the count for stock summaries", () => {
    renderWithProviders(<RarityBadge rarity="common" count={19} />);

    expect(screen.getByText("19")).toBeDefined();
    expect(screen.getByText("Common")).toBeDefined();
  });
});
