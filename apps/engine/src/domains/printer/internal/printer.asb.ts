import type { PrinterFault } from "./printer.types";

const ASB_PACKET_SIZE = 4;
/** Fixed bits of an ASB first byte: bits 0, 1, 4, 7 read 0, 0, 1, 0. */
const isAsbHeader = (byte: number) => (byte & 0x93) === 0x10;
/** A one-byte DLE EOT reply: bits 0, 1, 4, 7 read 0, 1, 1, 0. */
const isRealTimeReply = (byte: number) => (byte & 0x93) === 0x12;

export type AsbReading = {
  /** In order of urgency, the most urgent first. */
  conditions: PrinterFault[];
  /** The printer says it's offline, Feed button included. */
  offline: boolean;
};

/**
 * One Automatic Status Back packet (GS a), as the TM-T20III sends it. Bits
 * from Epson's GS a table; the ones marked "seen" were checked on the booth's
 * printer (docs/specs/printer-watchdog.md).
 */
export function decodeAsb(packet: Buffer): AsbReading {
  const [byte1 = 0, byte2 = 0, byte3 = 0] = packet;
  const conditions: PrinterFault[] = [];

  // Byte 3 bits 2-3: roll paper end (seen).
  if ((byte3 & 0x0c) === 0x0c) conditions.push("paper-out");
  // Byte 1 bit 5: cover open (seen).
  if (byte1 & 0x20) conditions.push("cover-open");
  // Byte 2 bits 3, 5, 6: auto-cutter, unrecoverable, auto-recoverable error.
  if (byte2 & 0x68) conditions.push("error");
  // Byte 3 bits 0-1: roll paper near end. Only when paper is still there.
  if ((byte3 & 0x03) === 0x03 && !conditions.includes("paper-out")) {
    conditions.push("paper-near-end");
  }

  // Byte 1 bit 3: offline (seen), also set while Feed is held.
  return { conditions, offline: (byte1 & 0x08) !== 0 };
}

/**
 * Cuts the printer's IN stream into 4-byte ASB packets. A read can hold part
 * of a packet or several; DLE EOT replies can be mixed in, since the raster
 * itself may contain `10 04 n`.
 */
export function createAsbParser() {
  let pending: number[] = [];

  return {
    push(bytes: Buffer): Buffer[] {
      const packets: Buffer[] = [];

      for (const byte of bytes) {
        if (isRealTimeReply(byte)) continue;

        if (isAsbHeader(byte)) {
          pending = [byte];
        } else if (pending.length > 0) {
          pending.push(byte);
        }

        if (pending.length === ASB_PACKET_SIZE) {
          packets.push(Buffer.from(pending));
          pending = [];
        }
      }

      return packets;
    },
    reset() {
      pending = [];
    },
  };
}
