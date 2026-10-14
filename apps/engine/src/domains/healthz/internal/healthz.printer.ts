import { getErrorMessage } from "@dither-booth/shared/errors";
import USB, { type TDevice } from "@node-escpos/usb-adapter";

import {
  createHealthyDependencyHealthz,
  createUnhealthyDependencyHealthz,
} from "./healthz.utils";

export function checkPrinterHealthz(printerUSBAdapter: USB | undefined) {
  let detectedPrinters: TDevice[];

  try {
    detectedPrinters = USB.findPrinter();
  } catch (error) {
    const details = {
      adapterDeviceAttached: printerUSBAdapter?.device !== undefined,
    };
    const message = "Failed to scan USB printer devices.";

    return createUnhealthyDependencyHealthz({
      cause: getErrorMessage(error),
      context: details,
      details,
      message,
    });
  }

  const adapterDevice = printerUSBAdapter?.device ?? null;
  const currentDevicePresent =
    adapterDevice !== null && detectedPrinters.includes(adapterDevice);
  const details = {
    adapterDeviceAttached: adapterDevice !== null,
    currentDevicePresent,
    detectedPrinterCount: detectedPrinters.length,
  };

  if (!printerUSBAdapter) {
    return createUnhealthyDependencyHealthz({
      context: details,
      details,
      message: "Printer device is not initialized.",
    });
  }

  if (!adapterDevice) {
    return createUnhealthyDependencyHealthz({
      context: details,
      details,
      message: "Printer device is detached.",
    });
  }

  if (!currentDevicePresent) {
    return createUnhealthyDependencyHealthz({
      context: details,
      details,
      message: "Printer device is not detected on the USB bus.",
    });
  }

  return createHealthyDependencyHealthz({
    details,
  });
}
