import { useEffect, useState } from "react";

export const useUserMedia = (params: {
  onStream: (stream: MediaStream) => void;
}) => {
  const { onStream } = params;

  const [takePhoto, setTakePhoto] =
    useState<(photoSettings?: PhotoSettings) => Promise<Blob>>();

  useEffect(() => {
    let active: MediaStream | undefined;
    let cancelled = false;
    const clearTakePhoto = () => setTakePhoto(undefined);

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
            const imageCapture = new ImageCapture(track);
            setTakePhoto(() => async (photoSettings?: PhotoSettings) => {
              if (cancelled || track.readyState !== "live") {
                throw new DOMException(
                  "Video track is no longer live.",
                  "InvalidStateError",
                );
              }

              return imageCapture.takePhoto(photoSettings);
            });
          } catch (e) {
            clearTakePhoto();
            console.error(e);
          }
        } else {
          clearTakePhoto();
        }

        onStream(next);
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
  }, []);

  return {
    takePhoto,
  };
};
