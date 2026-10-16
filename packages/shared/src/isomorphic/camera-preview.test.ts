import { describe, expect, test } from "bun:test";

import {
  type CameraSignal,
  cameraSignalSchema,
} from "#isomorphic/camera-preview";
import { KIOSK_COMMAND_SCHEMA } from "#isomorphic/kiosk";

describe("cameraSignalSchema", () => {
  test("parses every kind of signal", () => {
    const signals: CameraSignal[] = [
      { kind: "start", iceServers: [] },
      {
        kind: "start",
        iceServers: [
          { urls: ["turn:turn.example:3478"], username: "u", credential: "c" },
        ],
      },
      { kind: "offer", sdp: "v=0" },
      { kind: "answer", sdp: "v=0" },
      {
        kind: "candidate",
        candidate: {
          candidate: "candidate:1 1 udp 1 10.0.0.2 5000 typ host",
          sdpMid: "0",
          sdpMLineIndex: 0,
        },
      },
      { kind: "candidate", candidate: null },
      { kind: "end", reason: "viewer-left" },
    ];

    for (const signal of signals) {
      expect(cameraSignalSchema.parse(signal)).toEqual(signal);
    }
  });

  test("rejects an oversized SDP, an unknown kind or reason", () => {
    expect(
      cameraSignalSchema.safeParse({ kind: "offer", sdp: "x".repeat(20_001) })
        .success,
    ).toBe(false);
    expect(cameraSignalSchema.safeParse({ kind: "record" }).success).toBe(
      false,
    );
    expect(
      cameraSignalSchema.safeParse({ kind: "end", reason: "bored" }).success,
    ).toBe(false);
  });
});

describe("KIOSK_COMMAND_SCHEMA camera", () => {
  test("carries one signal for one page and session", () => {
    const command = {
      type: "camera",
      pageId: "page-1",
      sessionId: "session-1",
      signal: { kind: "end", reason: "timeout" },
      commandId: "c1",
    } as const;

    expect(KIOSK_COMMAND_SCHEMA.parse(command)).toEqual(command);
    expect(
      KIOSK_COMMAND_SCHEMA.safeParse({ ...command, sessionId: "" }).success,
    ).toBe(false);
  });
});
