import { describe, expect, it } from "bun:test";

import { parseNotes } from "./update.markdown";

describe("parseNotes", () => {
  it("reads GitHub's generated notes: headings, bullets, paragraphs", () => {
    expect(
      parseNotes(
        "## What's Changed\r\n* feat: a thing by @me in #1\r\n* fix: another\r\n\r\n**Full Changelog**: https://x/y\r\n",
      ),
    ).toEqual([
      { kind: "heading", text: "What's Changed" },
      { kind: "list", items: ["feat: a thing by @me in #1", "fix: another"] },
      { kind: "paragraph", text: "**Full Changelog**: https://x/y" },
    ]);
  });

  it("joins a paragraph's lines, and drops empty ones", () => {
    expect(parseNotes("one\ntwo\n\n\nthree")).toEqual([
      { kind: "paragraph", text: "one two" },
      { kind: "paragraph", text: "three" },
    ]);
  });
});
