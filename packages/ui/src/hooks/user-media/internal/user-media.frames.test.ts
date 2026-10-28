/// <reference types="bun" />

import { describe, expect, it } from "bun:test";

import {
  CAMERA_NO_PICTURE_MESSAGE,
  type FrameSource,
  waitForFrame,
  watchFirstFrame,
} from "./user-media.frames";

const tick = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * A video with `requestVideoFrameCallback`, whose frames the test paints,
 * and `timeupdate` listeners, which the test fires as playback moves.
 */
const createFrameCallbackVideo = () => {
  const callbacks = new Map<number, () => void>();
  const listeners = new Set<() => void>();
  let nextHandle = 1;
  const cancelled: number[] = [];

  const video: FrameSource = {
    requestVideoFrameCallback: (callback) => {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    },
    cancelVideoFrameCallback: (handle) => {
      cancelled.push(handle);
      callbacks.delete(handle);
    },
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };

  return {
    video,
    cancelled,
    listeners,
    paintFrame: () => {
      for (const callback of Array.from(callbacks.values())) callback();
    },
    advancePlayback: () => {
      for (const listener of Array.from(listeners)) listener();
    },
  };
};

/** A video without `requestVideoFrameCallback`: only `timeupdate` events. */
const createTimeUpdateVideo = () => {
  const listeners = new Set<() => void>();

  const video: FrameSource = {
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };

  return {
    video,
    listeners,
    paintFrame: () => {
      for (const listener of Array.from(listeners)) listener();
    },
  };
};

describe("watchFirstFrame", () => {
  it("reports the first painted frame once and then stops listening", () => {
    const { video, cancelled, listeners, paintFrame, advancePlayback } =
      createFrameCallbackVideo();
    let frames = 0;
    let timeouts = 0;

    watchFirstFrame(video, {
      timeoutMs: 1000,
      onFrame: () => frames++,
      onTimeout: () => timeouts++,
    });
    paintFrame();
    paintFrame();
    advancePlayback();

    expect(frames).toBe(1);
    expect(timeouts).toBe(0);
    expect(cancelled).toEqual([1]);
    expect(listeners.size).toBe(0);
  });

  it("counts playback on a hidden video whose frame callbacks never run", () => {
    // The Shutter hides its live feed (`display: none` in the Darkroom,
    // `visibility: hidden` in the Experience); a browser may not run frame
    // callbacks for a video it doesn't draw.
    const { video, cancelled, advancePlayback } = createFrameCallbackVideo();
    let frames = 0;
    let timeouts = 0;

    watchFirstFrame(video, {
      timeoutMs: 1000,
      onFrame: () => frames++,
      onTimeout: () => timeouts++,
    });
    advancePlayback();

    expect(frames).toBe(1);
    expect(timeouts).toBe(0);
    expect(cancelled).toEqual([1]);
  });

  it("reports a camera that opened but never drew, and ignores a late frame", async () => {
    const { video, paintFrame } = createFrameCallbackVideo();
    let frames = 0;
    let timeouts = 0;

    watchFirstFrame(video, {
      timeoutMs: 10,
      onFrame: () => frames++,
      onTimeout: () => timeouts++,
    });
    await tick(30);
    paintFrame();

    expect(timeouts).toBe(1);
    expect(frames).toBe(0);
  });

  it("uses timeupdate alone where requestVideoFrameCallback is missing", () => {
    const { video, listeners, paintFrame } = createTimeUpdateVideo();
    let frames = 0;

    watchFirstFrame(video, {
      timeoutMs: 1000,
      onFrame: () => frames++,
      onTimeout: () => {},
    });

    expect(listeners.size).toBe(1);
    paintFrame();
    expect(frames).toBe(1);
    expect(listeners.size).toBe(0);
  });

  it("does nothing once stopped", async () => {
    const { video, paintFrame } = createFrameCallbackVideo();
    let frames = 0;
    let timeouts = 0;

    const stop = watchFirstFrame(video, {
      timeoutMs: 10,
      onFrame: () => frames++,
      onTimeout: () => timeouts++,
    });
    stop();
    paintFrame();
    await tick(30);

    expect(frames).toBe(0);
    expect(timeouts).toBe(0);
  });
});

describe("waitForFrame", () => {
  it("resolves on a frame and rejects without one", async () => {
    const painted = createFrameCallbackVideo();
    const resolved = waitForFrame(painted.video, 1000);
    painted.paintFrame();
    await expect(resolved).resolves.toBeUndefined();

    const dark = createFrameCallbackVideo();
    await expect(waitForFrame(dark.video, 10)).rejects.toThrow(
      CAMERA_NO_PICTURE_MESSAGE,
    );
  });
});
