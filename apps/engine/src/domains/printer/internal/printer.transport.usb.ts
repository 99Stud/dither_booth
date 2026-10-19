import {
  type Device,
  findByIds,
  type InEndpoint,
  type Interface,
  type OutEndpoint,
  type Transfer,
  usb,
} from "usb";

import {
  PrinterGoneError,
  type PrinterLink,
  PrinterNotFoundError,
  type PrinterTransport,
} from "./printer.transport";

/** Epson TM-T20III. */
const VENDOR_ID = 0x04b8;
const PRODUCT_ID = 0x0e28;
const PACKET_SIZE = 64;
/** An idle printer answers at once with a zero-length packet; this is a backstop. */
const READ_TIMEOUT_MS = 200;
const CLOSE_DRAIN_TIMEOUT_MS = 1_000;

type Endpoint = InEndpoint | OutEndpoint;

/**
 * The booth's printer over libusb. It takes the printer from the kernel's
 * `usblp` driver while open and gives it back on close. The service user
 * needs write access to the device node (the `lp` group on the booth).
 */
export function createUsbPrinterTransport(): PrinterTransport {
  return {
    async open() {
      const device = findByIds(VENDOR_ID, PRODUCT_ID);
      if (!device) throw new PrinterNotFoundError();

      device.open();
      try {
        return claim(device);
      } catch (error) {
        try {
          device.close();
        } catch {
          /* already closed */
        }
        throw error;
      }
    },
    onAttach(listener) {
      const onDevice = (device: Device) => {
        const { idProduct, idVendor } = device.deviceDescriptor;
        if (idVendor === VENDOR_ID && idProduct === PRODUCT_ID) listener();
      };
      usb.on("attach", onDevice);
      return () => {
        usb.removeListener("attach", onDevice);
      };
    },
  };
}

function claim(device: Device): PrinterLink {
  const printerInterface = device.interface(0);
  let hadKernelDriver = false;

  try {
    hadKernelDriver = printerInterface.isKernelDriverActive();
    if (hadKernelDriver) printerInterface.detachKernelDriver();
  } catch {
    // macOS has no kernel driver to detach; libusb says so with an error.
  }
  printerInterface.claim();

  const out = printerInterface.endpoints.find(
    (endpoint): endpoint is OutEndpoint => endpoint.direction === "out",
  );
  const input = printerInterface.endpoints.find(
    (endpoint): endpoint is InEndpoint => endpoint.direction === "in",
  );
  if (!out || !input) throw new Error("The printer has no bulk endpoints.");

  const pending = new Set<Transfer>();

  /**
   * One libusb transfer. Unlike `transferAsync`, it can be cancelled, and a
   * device can't be closed while one is pending.
   */
  const transfer = (
    endpoint: Endpoint,
    timeoutMs: number,
    data: Buffer,
    signal?: AbortSignal,
  ) =>
    new Promise<Buffer>((resolve, reject) => {
      const cancel = () => current.cancel();
      const current = endpoint.makeTransfer(
        timeoutMs,
        (error, buffer, actualLength) => {
          pending.delete(current);
          signal?.removeEventListener("abort", cancel);
          if (error) reject(error);
          else resolve(buffer.subarray(0, actualLength));
        },
      );

      pending.add(current);
      current.submit(data);
      if (signal?.aborted) cancel();
      else signal?.addEventListener("abort", cancel, { once: true });
    });

  return {
    async read() {
      try {
        return await transfer(
          input,
          READ_TIMEOUT_MS,
          Buffer.alloc(PACKET_SIZE),
        );
      } catch (error) {
        if (isErrno(error, usb.LIBUSB_TRANSFER_TIMED_OUT))
          return Buffer.alloc(0);
        throw new PrinterGoneError(error);
      }
    },
    async write(bytes, signal) {
      try {
        await transfer(out, 0, bytes, signal);
      } catch (error) {
        if (!signal?.aborted) throw error;
        // Resets the data toggle on both ends after a cancelled transfer.
        await clearHalt(out).catch(() => {});
        throw signal.reason;
      }
    },
    close: () => release(device, printerInterface, pending, hadKernelDriver),
  };
}

async function release(
  device: Device,
  printerInterface: Interface,
  pending: Set<Transfer>,
  hadKernelDriver: boolean,
) {
  for (const current of pending) current.cancel();
  const deadline = Date.now() + CLOSE_DRAIN_TIMEOUT_MS;
  while (pending.size > 0 && Date.now() < deadline) await Bun.sleep(5);

  await new Promise<void>((resolve) =>
    printerInterface.release(true, () => resolve()),
  );
  try {
    if (hadKernelDriver) printerInterface.attachKernelDriver();
  } catch {
    // Unplugged meanwhile: nothing to give back.
  }
  try {
    device.close();
  } catch {
    // Already gone.
  }
}

const clearHalt = (endpoint: Endpoint) =>
  new Promise<void>((resolve, reject) =>
    endpoint.clearHalt((error) => (error ? reject(error) : resolve())),
  );

const isErrno = (error: unknown, errno: number) =>
  typeof error === "object" &&
  error !== null &&
  "errno" in error &&
  error.errno === errno;
