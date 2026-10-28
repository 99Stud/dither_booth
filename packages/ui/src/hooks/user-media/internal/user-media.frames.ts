/** What a camera that opened but draws nothing reports, to staff in admin. */
export const CAMERA_NO_PICTURE_MESSAGE = "The camera gives no picture.";

/** The part of `HTMLVideoElement` the frame helpers use, so a test can fake it. */
export interface FrameSource {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
  addEventListener: (type: "timeupdate", listener: () => void) => void;
  removeEventListener: (type: "timeupdate", listener: () => void) => void;
}

export interface WatchFirstFrameOptions {
  timeoutMs: number;
  onFrame: () => void;
  onTimeout: () => void;
}

/**
 * Tells a picture from an open camera. `getUserMedia` can resolve, and the
 * track stay live, while the browser's capture pipeline draws nothing (seen
 * on a page reloaded while its camera was running): nothing else says so.
 * Calls `onFrame` once a frame arrives, or `onTimeout` when none has by
 * `timeoutMs`, never both. Returns a stop function. Listens for both
 * `requestVideoFrameCallback` and `timeupdate` (about 4 Hz while playing),
 * whichever comes first: a browser may not run frame callbacks for a video
 * it doesn't draw (`display: none`, `visibility: hidden`), and the Shutter
 * hides its live feed, while `timeupdate` follows playback.
 */
export const watchFirstFrame = (
  video: FrameSource,
  { timeoutMs, onFrame, onTimeout }: WatchFirstFrameOptions,
) => {
  let done = false;
  let handle: number | undefined;

  const frame = () => {
    if (done) return;
    stop();
    onFrame();
  };

  const timer = setTimeout(() => {
    if (done) return;
    stop();
    onTimeout();
  }, timeoutMs);

  function stop() {
    done = true;
    clearTimeout(timer);
    if (handle !== undefined) video.cancelVideoFrameCallback?.(handle);
    video.removeEventListener("timeupdate", frame);
  }

  handle = video.requestVideoFrameCallback?.(frame);
  video.addEventListener("timeupdate", frame);

  return stop;
};

/** Resolves on the next painted frame, rejects after `timeoutMs`. */
export const waitForFrame = (video: FrameSource, timeoutMs: number) =>
  new Promise<void>((resolve, reject) => {
    watchFirstFrame(video, {
      timeoutMs,
      onFrame: resolve,
      onTimeout: () => reject(new Error(CAMERA_NO_PICTURE_MESSAGE)),
    });
  });

/**
 * A JPEG of what the camera shows, taken after a fresh frame so a stalled
 * picture is never printed. The fallback when `ImageCapture.takePhoto`
 * fails on a camera that otherwise works (virtual cameras, some phones
 * used as a camera).
 */
export const grabVideoFrame = async (
  video: HTMLVideoElement,
  timeoutMs: number,
): Promise<Blob> => {
  await waitForFrame(video, timeoutMs);

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  if (canvas.width === 0 || canvas.height === 0) {
    throw new Error("The camera picture has no size.");
  }

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("No 2D canvas context.");
  }

  context.drawImage(video, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.92);
  });

  if (!blob) {
    throw new Error("Could not encode the camera picture.");
  }

  return blob;
};
