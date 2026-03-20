import { useEffect } from "react";

export const useUserMedia = (onStream: (stream: MediaStream) => void) => {
  useEffect(() => {
    let active: MediaStream | undefined;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((next) => {
        if (cancelled) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        active = next;
        onStream(next);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error(e);
      });

    return () => {
      cancelled = true;
      active?.getTracks().forEach((track) => track.stop());
    };
  }, []);
};
