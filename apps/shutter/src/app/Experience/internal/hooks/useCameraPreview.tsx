import type { KioskCommand } from "@dither-booth/shared/kiosk";
import type { WebcamHandle } from "@dither-booth/ui/components/misc/Webcam";

import { logKioskEvent } from "@dither-booth/logging";
import { createCameraPublisher } from "@dither-booth/shared/browser/camera-preview";
import { useMutation } from "@tanstack/react-query";
import { type RefObject, useCallback, useEffect, useRef } from "react";

import { SHUTTER_CAMERA_LOG_SOURCE } from "#lib/constants";
import { useKioskCamera } from "#lib/kiosk/kiosk-camera";
import { useTRPC } from "#lib/trpc/trpc.client";

type CameraCommand = Extract<KioskCommand, { type: "camera" }>;
type Publisher = ReturnType<typeof createCameraPublisher>;

/**
 * Sends the booth camera to admin's live view: one WebRTC publisher per
 * session the engine opens on this page, fed a copy of the Webcam's track.
 * Returns the handler for this page's `camera` commands.
 */
export const useCameraPreview = (webcamRef: RefObject<WebcamHandle | null>) => {
  const trpc = useTRPC();
  const { mutateAsync: sendKioskCameraSignal } = useMutation(
    trpc.booth.sendKioskCameraSignal.mutationOptions(),
  );
  const publishers = useRef(new Map<string, Publisher>());
  const cameraStatus = useKioskCamera()?.status;

  const stopAll = useCallback((reason: "camera-off" | "page-left") => {
    for (const publisher of publishers.current.values()) publisher.stop(reason);
  }, []);

  // A camera that stops working ends every live view of it.
  useEffect(() => {
    if (cameraStatus !== "ready") stopAll("camera-off");
  }, [cameraStatus, stopAll]);

  useEffect(() => () => stopAll("page-left"), [stopAll]);

  return useCallback(
    ({ pageId, sessionId, signal }: CameraCommand) => {
      const sendSignal = (next: CameraCommand["signal"]) =>
        sendKioskCameraSignal({ pageId, sessionId, signal: next });

      if (signal.kind !== "start") {
        void publishers.current.get(sessionId)?.handleSignal(signal);
        return;
      }

      const track = webcamRef.current?.getVideoTrack();
      if (!track) {
        void sendSignal({ kind: "end", reason: "camera-off" }).catch(
          () => undefined,
        );
        return;
      }

      logKioskEvent(
        "info",
        SHUTTER_CAMERA_LOG_SOURCE,
        "camera-preview-publishing",
        {
          details: { sessionId },
        },
      );
      publishers.current.set(
        sessionId,
        createCameraPublisher({
          track,
          iceServers: signal.iceServers,
          sendSignal,
          onClose: () => publishers.current.delete(sessionId),
        }),
      );
    },
    [sendKioskCameraSignal, webcamRef],
  );
};
