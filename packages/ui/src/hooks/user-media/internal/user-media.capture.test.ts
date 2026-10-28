/// <reference types="bun" />

import { describe, expect, it } from "bun:test";

import {
  createPhotoCaptureCoordinator,
  type CapturePhoto,
  withFrameGrabFallback,
} from "./user-media.capture";

const createDeferred = <Value>() => {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    reject,
    resolve,
  };
};

describe("createPhotoCaptureCoordinator", () => {
  it("deduplicates an in-flight prewarm and gives takePhoto a fresh result", async () => {
    const captures: ReturnType<typeof createDeferred<Blob>>[] = [];
    const capturePhoto: CapturePhoto = () => {
      const capture = createDeferred<Blob>();
      captures.push(capture);
      return capture.promise;
    };
    const coordinator = createPhotoCaptureCoordinator(capturePhoto);

    const firstPrewarm = coordinator.prewarmPhotoCapture();
    const duplicatePrewarm = coordinator.prewarmPhotoCapture();
    const receiptPhotoPromise = coordinator.takePhoto();

    expect(duplicatePrewarm).toBe(firstPrewarm);
    await Promise.resolve();
    expect(captures).toHaveLength(1);

    const discardedPhoto = new Blob(["prewarm"], { type: "image/jpeg" });
    captures[0]?.resolve(discardedPhoto);
    await firstPrewarm;
    await Promise.resolve();

    expect(captures).toHaveLength(2);

    const receiptPhoto = new Blob(["receipt"], { type: "image/jpeg" });
    captures[1]?.resolve(receiptPhoto);

    expect(await receiptPhotoPromise).toBe(receiptPhoto);
    expect(await receiptPhotoPromise).not.toBe(discardedPhoto);
  });

  it("continues the queue after a failed prewarm", async () => {
    const receiptPhoto = new Blob(["receipt"], { type: "image/jpeg" });
    let captureCount = 0;
    const coordinator = createPhotoCaptureCoordinator(async () => {
      captureCount += 1;

      if (captureCount === 1) {
        throw new Error("Prewarm failed.");
      }

      return receiptPhoto;
    });

    const prewarmPromise = coordinator.prewarmPhotoCapture();
    const receiptPhotoPromise = coordinator.takePhoto();

    await expect(prewarmPromise).rejects.toThrow("Prewarm failed.");
    expect(await receiptPhotoPromise).toBe(receiptPhoto);
    expect(captureCount).toBe(2);
  });

  it("allows another prewarm after the previous one settles", async () => {
    let captureCount = 0;
    const coordinator = createPhotoCaptureCoordinator(async () => {
      captureCount += 1;
      return new Blob([String(captureCount)]);
    });

    await coordinator.prewarmPhotoCapture();
    await coordinator.prewarmPhotoCapture();

    expect(captureCount).toBe(2);
  });
});

describe("withFrameGrabFallback", () => {
  const photo = new Blob(["photo"], { type: "image/jpeg" });
  const frame = new Blob(["frame"], { type: "image/jpeg" });

  it("returns the device photo and never grabs a frame when takePhoto works", async () => {
    let grabs = 0;
    const fallbacks: unknown[] = [];
    const capture = withFrameGrabFallback({
      takePhoto: async () => photo,
      grabFrame: async () => {
        grabs++;
        return frame;
      },
      onFallback: (error) => fallbacks.push(error),
    });

    await expect(capture()).resolves.toBe(photo);
    expect(grabs).toBe(0);
    expect(fallbacks).toEqual([]);
  });

  it("stands a fresh frame in for a failed takePhoto and reports why", async () => {
    const platformError = new DOMException("platform error", "UnknownError");
    const fallbacks: unknown[] = [];
    const capture = withFrameGrabFallback({
      takePhoto: async () => {
        throw platformError;
      },
      grabFrame: async () => frame,
      onFallback: (error) => fallbacks.push(error),
    });

    await expect(capture()).resolves.toBe(frame);
    expect(fallbacks).toEqual([platformError]);
  });

  it("rethrows the takePhoto error when there is no live picture either", async () => {
    const platformError = new DOMException(
      "setPhotoOptions failed",
      "UnknownError",
    );
    const fallbacks: unknown[] = [];
    const capture = withFrameGrabFallback({
      takePhoto: async () => {
        throw platformError;
      },
      grabFrame: async () => {
        throw new Error("The camera gives no picture.");
      },
      onFallback: (error) => fallbacks.push(error),
    });

    await expect(capture()).rejects.toBe(platformError);
    expect(fallbacks).toEqual([]);
  });
});
