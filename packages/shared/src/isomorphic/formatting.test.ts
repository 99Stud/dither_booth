import { describe, expect, test } from "bun:test";

import { formatBoothTicketNumber, parseBoothTicketRef } from "./formatting";

describe("booth ticket numbers", () => {
  test("formats six digits with the printed prefix", () => {
    expect(formatBoothTicketNumber("061856")).toBe("STUD_DITHERBOOTH_061856");
  });

  test("parses six digits and the printed ticket string", () => {
    expect(parseBoothTicketRef("061856")).toBe("061856");
    expect(parseBoothTicketRef("  STUD_DITHERBOOTH_061856  ")).toBe("061856");
  });

  test("rejects values that are not a booth ticket number", () => {
    expect(parseBoothTicketRef("61856")).toBeNull();
    expect(parseBoothTicketRef("STUD_DITHERBOOTH_ABC123")).toBeNull();
    expect(parseBoothTicketRef("made-up")).toBeNull();
  });
});
