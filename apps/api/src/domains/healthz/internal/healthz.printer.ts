import { getErrorMessage } from "#lib/misc/misc.utils";
import USB, { type TDevice } from "@node-escpos/usb-adapter";

import { createDependencyHealthz } from "./healthz.utils";

export function checkPrinterDependency(printerDevice: USB | undefined) {
  let detectedPrinters: TDevice[];

  try {
    detectedPrinters = USB.findPrinter();
  } catch (error) {
    return createDependencyHealthz({
      ok: false,
      message: "Failed to scan USB printer devices.",
      details: {
        error: getErrorMessage(error),
      },
    });
  }

  const adapterDevice = printerDevice?.device ?? null;
  const currentDevicePresent =
    adapterDevice !== null && detectedPrinters.includes(adapterDevice);
  const details = {
    adapterDeviceAttached: adapterDevice !== null,
    currentDevicePresent,
    detectedPrinterCount: detectedPrinters.length,
  };

  if (!printerDevice) {
    return createDependencyHealthz({
      ok: false,
      message: "Printer device is not initialized.",
      details,
    });
  }

  if (!adapterDevice) {
    return createDependencyHealthz({
      ok: false,
      message: "Printer device is detached.",
      details,
    });
  }

  if (!currentDevicePresent) {
    return createDependencyHealthz({
      ok: false,
      message: "Printer device is not detected on the USB bus.",
      details,
    });
  }

  return createDependencyHealthz({
    ok: true,
    details,
  });
}
