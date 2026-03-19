import { Printer } from "@node-escpos/core";
import USB from "@node-escpos/usb-adapter";

const device = new USB();

export const print = () => {
  console.log("Printing...");
  device.open(async (err) => {
    if (err) {
      console.error(err);
      return;
    }
    const printer = new Printer(device, {
      encoding: "US-ASCII",
    });

    printer.text("Hello, world!");
    printer.cut();
    printer.close();
  });
};
