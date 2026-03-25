import { useCallback, useEffect, useRef } from "react";

export type CapturePhotoOptions = Omit<
  PhotoSettings,
  "imageWidth" | "imageHeight"
>;

const getMaxSquareSide = (track: MediaStreamTrack) => {
  const { width, height } = track.getCapabilities();
  const maxWidth = width?.max;
  const maxHeight = height?.max;

  if (maxWidth === undefined || maxHeight === undefined) {
    return undefined;
  }

  return Math.floor(Math.min(maxWidth, maxHeight));
};

const getSquarePhotoSettings = async (
  imageCapture: ImageCapture,
  preferredSide?: number,
) => {
  try {
    const photoCapabilities = await imageCapture.getPhotoCapabilities();
    console.log("📷 Camera capabilities", photoCapabilities);
    const { imageWidth, imageHeight } = photoCapabilities;
    const capabilityWidth = imageWidth?.max;
    const capabilityHeight = imageHeight?.max;

    if (capabilityWidth === undefined || capabilityHeight === undefined) {
      if (preferredSide === undefined) {
        return undefined;
      }

      return {
        imageWidth: preferredSide,
        imageHeight: preferredSide,
      };
    }

    const nextSide = Math.floor(
      Math.min(
        preferredSide ?? Number.POSITIVE_INFINITY,
        capabilityWidth,
        capabilityHeight,
      ),
    );

    if (!Number.isFinite(nextSide)) {
      return undefined;
    }

    return {
      imageWidth: nextSide,
      imageHeight: nextSide,
    };
  } catch {
    if (preferredSide === undefined) {
      return undefined;
    }

    return {
      imageWidth: preferredSide,
      imageHeight: preferredSide,
    };
  }
};

const applySquareConstraints = async (
  track: MediaStreamTrack,
  maxSquareSide?: number,
) => {
  const exactConstraints: MediaTrackConstraints = {
    aspectRatio: {
      exact: 1,
    },
  };

  if (maxSquareSide !== undefined) {
    exactConstraints.width = {
      exact: maxSquareSide,
    };
    exactConstraints.height = {
      exact: maxSquareSide,
    };
  }

  try {
    await track.applyConstraints(exactConstraints);
  } catch {
    // Fall back to softer constraints so the preview and capture stay usable.
    const idealConstraints: MediaTrackConstraints = {
      aspectRatio: {
        ideal: 1,
      },
    };

    if (maxSquareSide !== undefined) {
      idealConstraints.width = {
        ideal: maxSquareSide,
      };
      idealConstraints.height = {
        ideal: maxSquareSide,
      };
    }

    await track.applyConstraints(idealConstraints);
  }
};

export const useUserMedia = (params: {
  onStream: (stream: MediaStream) => void;
}) => {
  const { onStream } = params;

  const onStreamRef = useRef(onStream);
  const takePhotoRef = useRef<
    ((photoSettings?: CapturePhotoOptions) => Promise<Blob>) | undefined
  >(undefined);

  onStreamRef.current = onStream;

  const clearTakePhoto = useCallback(() => {
    takePhotoRef.current = undefined;
  }, []);

  const takePhoto = useCallback(async (photoSettings?: CapturePhotoOptions) => {
    const capturePhoto = takePhotoRef.current;

    if (!capturePhoto) {
      throw new Error("Camera is not ready yet.");
    }

    return capturePhoto(photoSettings);
  }, []);

  useEffect(() => {
    let active: MediaStream | undefined;
    let cancelled = false;

    if (!window.isSecureContext) {
      console.error("Camera access requires a secure context.");
      clearTakePhoto();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      console.error("MediaDevices.getUserMedia is not available.");
      clearTakePhoto();
      return;
    }

    if (typeof ImageCapture === "undefined") {
      console.error("ImageCapture is not available.");
      clearTakePhoto();
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then(async (next) => {
        if (cancelled) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        active = next;

        const track = next.getVideoTracks()[0];

        if (track) {
          try {
            const maxSquareSide = getMaxSquareSide(track);

            await applySquareConstraints(track, maxSquareSide);

            const imageCapture = new ImageCapture(track);
            const squarePhotoSettings = await getSquarePhotoSettings(
              imageCapture,
              maxSquareSide,
            );
            takePhotoRef.current = async (
              photoSettings?: CapturePhotoOptions,
            ) => {
              if (cancelled || track.readyState !== "live") {
                throw new DOMException(
                  "Video track is no longer live.",
                  "InvalidStateError",
                );
              }

              const nextPhotoSettings =
                squarePhotoSettings === undefined
                  ? photoSettings
                  : {
                      ...photoSettings,
                      ...squarePhotoSettings,
                    };

              try {
                console.log("Taking a picture 📸");
                console.log("settings", nextPhotoSettings);

                return await imageCapture.takePhoto(nextPhotoSettings);
              } catch (error) {
                if (squarePhotoSettings === undefined) {
                  throw error;
                }
                console.error(error);
                if (photoSettings) {
                  console.log("Taking a picture 📸");
                  console.log("user settings", photoSettings);
                } else {
                  console.log("Taking a picture with default settings 📸");
                }
                return imageCapture.takePhoto(photoSettings);
              }
            };
          } catch (e) {
            clearTakePhoto();
            console.error(e);
          }
        } else {
          clearTakePhoto();
        }

        onStreamRef.current(next);
      })
      .catch((e) => {
        if (cancelled) return;
        clearTakePhoto();
        console.error(e);
      });

    return () => {
      cancelled = true;
      clearTakePhoto();
      active?.getTracks().forEach((track) => track.stop());
    };
  }, [clearTakePhoto]);

  return {
    takePhoto,
  };
};
