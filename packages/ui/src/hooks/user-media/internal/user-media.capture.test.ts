/// <reference types="bun" />

import { describe, expect, it } from "bun:test";

import {
  createPhotoCaptureCoordinator,
  type CapturePhoto,
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
