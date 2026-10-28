import { describe, expect, test } from "bun:test";

import { planDataRelocation, withSsdFstabEntry } from "./ssd";

const UUID = "d10337d4-72d7-4f23-8a00-8508413e5061";
const ENTRY = `UUID=${UUID} /mnt/ssd ext4 defaults,nofail 0 2`;
const BASE = [
  "proc            /proc           proc    defaults          0       0",
  "PARTUUID=9232935e-02  /               ext4    defaults,noatime  0       1",
].join("\n");

describe("withSsdFstabEntry", () => {
  test("appends the entry on its own line", () => {
    expect(withSsdFstabEntry(`${BASE}\n`, UUID)).toBe(`${BASE}\n${ENTRY}\n`);
  });

  test("starts a new line when fstab lacks a trailing newline", () => {
    expect(withSsdFstabEntry(BASE, UUID)).toBe(`${BASE}\n${ENTRY}\n`);
  });

  test("rewrites the entry booth 0.6.0 wrote with a literal \\n", () => {
    const broken = `${BASE}\n${ENTRY}\\n`;

    expect(withSsdFstabEntry(broken, UUID)).toBe(`${BASE}\n${ENTRY}\n`);
  });

  test("leaves a valid entry unchanged", () => {
    const fstab = `${BASE}\n${ENTRY}\n`;

    expect(withSsdFstabEntry(fstab, UUID)).toBe(fstab);
  });

  test("keeps another drive already mounted at /mnt/ssd", () => {
    const fstab = `${BASE}\nUUID=other /mnt/ssd ext4 defaults 0 2\n`;

    expect(withSsdFstabEntry(fstab, UUID)).toBe(fstab);
  });

  test("ignores a commented-out entry", () => {
    const fstab = `${BASE}\n# ${ENTRY}\n`;

    expect(withSsdFstabEntry(fstab, UUID)).toBe(`${fstab}${ENTRY}\n`);
  });
});

describe("planDataRelocation", () => {
  test("keeps a symlink, whatever the databases", () => {
    expect(planDataRelocation("symlink", { local: true, ssd: true })).toBe(
      "keep",
    );
  });

  test("links when the data folder is missing", () => {
    expect(planDataRelocation("missing", { local: false, ssd: true })).toBe(
      "link",
    );
  });

  test("moves a folder's database onto an SSD without one", () => {
    expect(planDataRelocation("directory", { local: true, ssd: false })).toBe(
      "move",
    );
  });

  test("moves a folder without a database next to the SSD's", () => {
    expect(planDataRelocation("directory", { local: false, ssd: true })).toBe(
      "move",
    );
  });

  test("refuses when the folder and the SSD both hold a database", () => {
    expect(planDataRelocation("directory", { local: true, ssd: true })).toBe(
      "conflict",
    );
  });
});
