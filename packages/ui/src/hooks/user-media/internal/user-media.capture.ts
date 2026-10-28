export type CapturePhotoOptions = Omit<
  PhotoSettings,
  "imageWidth" | "imageHeight"
>;

export type CapturePhoto = (
  photoSettings?: CapturePhotoOptions,
) => Promise<Blob>;

export interface PhotoCaptureCoordinator {
  prewarmPhotoCapture: () => Promise<void>;
  takePhoto: CapturePhoto;
}

export const createPhotoCaptureCoordinator = (
  capturePhoto: CapturePhoto,
): PhotoCaptureCoordinator => {
  let captureQueue: Promise<void> = Promise.resolve();
  let prewarmInFlight: Promise<void> | undefined;

  const enqueueCapture = <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    const result = captureQueue.then(operation);
    captureQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const prewarmPhotoCapture = () => {
    if (prewarmInFlight) {
      return prewarmInFlight;
    }

    const prewarm = enqueueCapture(async () => {
      await capturePhoto();
    });
    prewarmInFlight = prewarm;

    const clearPrewarm = () => {
      if (prewarmInFlight === prewarm) {
        prewarmInFlight = undefined;
      }
    };

    void prewarm.then(clearPrewarm, clearPrewarm);

    return prewarm;
  };

  const takePhoto: CapturePhoto = (photoSettings) =>
    enqueueCapture(() => capturePhoto(photoSettings));

  return {
    prewarmPhotoCapture,
    takePhoto,
  };
};

export interface FrameGrabFallbackOptions {
  takePhoto: CapturePhoto;
  /** A fresh frame of the live picture, or a rejection when there is none. */
  grabFrame: () => Promise<Blob>;
  /** `takePhoto` failed with this error and a grabbed frame stands in. */
  onFallback: (error: unknown) => void;
}

/**
 * `takePhoto`, or a frame of the live picture when it fails. The device's
 * still-photo path can break while the video runs fine ("platform error",
 * "setPhotoOptions failed" in Chromium), and a photo from the picture the
 * guest saw beats no photo. When there is no live picture either, the
 * original error is what the caller needs to see.
 */
export const withFrameGrabFallback =
  ({
    takePhoto,
    grabFrame,
    onFallback,
  }: FrameGrabFallbackOptions): CapturePhoto =>
  async (photoSettings) => {
    try {
      return await takePhoto(photoSettings);
    } catch (error) {
      let frame: Blob;

      try {
        frame = await grabFrame();
      } catch {
        throw error;
      }

      onFallback(error);

      return frame;
    }
  };
