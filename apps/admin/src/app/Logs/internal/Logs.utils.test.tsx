import { describe, expect, it } from "bun:test";

import { getLogErrorText } from "./Logs.utils";

describe("getLogErrorText", () => {
  it("shows the stack once when it already starts with the message", () => {
    expect(
      getLogErrorText({
        name: "PrinterError",
        message: "Cover open",
        stack: "PrinterError: Cover open\n    at print (printer.ts:1:1)",
      }),
    ).toBe("PrinterError: Cover open\n    at print (printer.ts:1:1)");
  });

  it("keeps the message and cause when the stack doesn't repeat them", () => {
    expect(
      getLogErrorText({
        message: "Timed out",
        cause: "socket closed",
        stack: "    at wait (net.ts:4:2)",
      }),
    ).toBe("Timed out\n\nCause: socket closed\n\n    at wait (net.ts:4:2)");
  });

  it("keeps message, cause, stack in that order when the stack repeats the message", () => {
    expect(
      getLogErrorText({
        name: "PrinterError",
        message: "Cover open",
        cause: "lid sensor",
        stack: "PrinterError: Cover open\n    at print (printer.ts:1:1)",
      }),
    ).toBe(
      "PrinterError: Cover open\n\nCause: lid sensor\n\n    at print (printer.ts:1:1)",
    );
  });

  it("shows the message once for an unnamed error whose stack names it Error", () => {
    expect(
      getLogErrorText({
        message: "boom",
        stack: "Error: boom\n    at run (x.ts:1:1)",
      }),
    ).toBe("Error: boom\n    at run (x.ts:1:1)");
  });

  it("shows only the message when there is no stack", () => {
    expect(getLogErrorText({ name: "TypeError", message: "boom" })).toBe(
      "TypeError: boom",
    );
  });
});
