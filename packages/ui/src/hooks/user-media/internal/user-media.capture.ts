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
