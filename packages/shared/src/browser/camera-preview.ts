import type {
  CameraIceServer,
  CameraPreviewEndReason,
  CameraSignal,
} from "#isomorphic/camera-preview";

/**
 * The two ends of a live view of the booth camera, as thin wrappers around
 * `RTCPeerConnection`. They know nothing about how signals travel: the
 * caller passes `sendSignal` and feeds incoming ones to `handleSignal`, so
 * admin (tRPC) and Studio (Bell, later) share them as they are.
 */

/** The live view's longest side, in pixels: enough to check framing. */
const PREVIEW_MAX_SIDE = 480;
const PREVIEW_MAX_FRAMERATE = 15;
const PREVIEW_MAX_BITRATE = 600_000;
/** A viewer that isn't connected by then gives up. */
const VIEWER_CONNECT_TIMEOUT_MS = 15_000;

type SendSignal = (signal: CameraSignal) => Promise<unknown>;

/**
 * How the publisher encodes the live view. The capture track keeps its full
 * resolution for photos; the encoder scales its copy down instead.
 */
export const getPreviewEncoding = ({
  width,
  height,
}: {
  width?: number;
  height?: number;
}) => ({
  scaleResolutionDownBy: Math.max(
    1,
    Math.max(width ?? 0, height ?? 0) / PREVIEW_MAX_SIDE,
  ),
  maxFramerate: PREVIEW_MAX_FRAMERATE,
  maxBitrate: PREVIEW_MAX_BITRATE,
});

/** H.264 first: the iPad encodes it in hardware. Otherwise unchanged. */
export const orderCodecs = <T extends { mimeType: string }>(codecs: T[]) => [
  ...codecs.filter((codec) => codec.mimeType.toLowerCase() === "video/h264"),
  ...codecs.filter((codec) => codec.mimeType.toLowerCase() !== "video/h264"),
];

const toCandidateSignal = (
  candidate: RTCIceCandidate | null,
): CameraSignal => ({
  kind: "candidate",
  candidate: candidate
    ? {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
        usernameFragment: candidate.usernameFragment,
      }
    : null,
});

/**
 * One side's plumbing: signals go out in order (each is its own request,
 * and an answer must not overtake its offer), and candidates that arrive
 * before the remote description wait for it.
 */
const createSignalling = (pc: RTCPeerConnection, sendSignal: SendSignal) => {
  let sending: Promise<unknown> = Promise.resolve();
  let pending: Array<RTCIceCandidateInit | null> = [];

  const addCandidate = (candidate: RTCIceCandidateInit | null) =>
    candidate ? pc.addIceCandidate(candidate) : pc.addIceCandidate();

  return {
    send(signal: CameraSignal) {
      sending = sending.then(() => sendSignal(signal)).catch(() => undefined);
    },
    async receiveCandidate(candidate: RTCIceCandidateInit | null) {
      if (!pc.remoteDescription) {
        pending.push(candidate);
        return;
      }
      await addCandidate(candidate);
    },
    async flushCandidates() {
      const waiting = pending;
      pending = [];
      for (const candidate of waiting) await addCandidate(candidate);
    },
  };
};

/**
 * The kiosk page's end: sends a scaled-down copy of `track`. Closing stops
 * only the copy, never the capture track.
 */
export const createCameraPublisher = ({
  track,
  iceServers,
  sendSignal,
  onClose,
}: {
  track: MediaStreamTrack;
  iceServers: CameraIceServer[];
  sendSignal: SendSignal;
  onClose: () => void;
}) => {
  const pc = new RTCPeerConnection({ iceServers });
  const signalling = createSignalling(pc, sendSignal);
  const copy = track.clone();
  copy.contentHint = "motion";
  const transceiver = pc.addTransceiver(copy, { direction: "sendonly" });
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    pc.close();
    copy.stop();
    onClose();
  };

  // Best effort: browsers disagree on which capability list they accept.
  const codecs = RTCRtpSender.getCapabilities?.("video")?.codecs;
  try {
    if (codecs) transceiver.setCodecPreferences(orderCodecs(codecs));
  } catch {
    // The browser's own order is fine too.
  }

  pc.onicecandidate = (event) =>
    signalling.send(toCandidateSignal(event.candidate));
  pc.onconnectionstatechange = () => {
    if (pc.connectionState !== "failed") return;
    signalling.send({ kind: "end", reason: "failed" });
    close();
  };

  void (async () => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signalling.send({ kind: "offer", sdp: offer.sdp ?? "" });

      const parameters = transceiver.sender.getParameters();
      parameters.encodings = (
        parameters.encodings.length > 0 ? parameters.encodings : [{}]
      ).map((encoding) => ({
        ...encoding,
        ...getPreviewEncoding(track.getSettings()),
      }));
      await transceiver.sender.setParameters(parameters);
    } catch {
      signalling.send({ kind: "end", reason: "failed" });
      close();
    }
  })();

  return {
    async handleSignal(signal: CameraSignal) {
      if (closed) return;
      if (signal.kind === "end") return close();

      try {
        if (signal.kind === "answer") {
          await pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
          await signalling.flushCandidates();
        } else if (signal.kind === "candidate") {
          await signalling.receiveCandidate(signal.candidate);
        }
      } catch {
        signalling.send({ kind: "end", reason: "failed" });
        close();
      }
    },
    /** Stops sending and tells the viewer why. */
    stop(reason: CameraPreviewEndReason) {
      if (closed) return;
      signalling.send({ kind: "end", reason });
      close();
    },
  };
};

export type CameraViewerState =
  | { status: "connecting" }
  | { status: "live" }
  | { status: "ended"; reason: CameraPreviewEndReason };

/**
 * The viewer's end: answers the kiosk page's offer and hands the incoming
 * video to `onStream`. Create it on `start`, with the ICE servers it carries.
 */
export const createCameraViewer = ({
  iceServers,
  sendSignal,
  onStream,
  onState,
}: {
  iceServers: CameraIceServer[];
  sendSignal: SendSignal;
  onStream: (stream: MediaStream) => void;
  onState: (state: CameraViewerState) => void;
}) => {
  const pc = new RTCPeerConnection({ iceServers });
  const signalling = createSignalling(pc, sendSignal);
  pc.addTransceiver("video", { direction: "recvonly" });
  let closed = false;
  let timeoutId: number | undefined;

  const finish = (reason: CameraPreviewEndReason, tellPublisher: boolean) => {
    if (closed) return;
    closed = true;
    window.clearTimeout(timeoutId);
    if (tellPublisher) signalling.send({ kind: "end", reason });
    pc.close();
    onState({ status: "ended", reason });
  };

  timeoutId = window.setTimeout(() => {
    if (pc.connectionState !== "connected") finish("failed", true);
  }, VIEWER_CONNECT_TIMEOUT_MS);

  pc.ontrack = (event) =>
    onStream(event.streams[0] ?? new MediaStream([event.track]));
  pc.onicecandidate = (event) =>
    signalling.send(toCandidateSignal(event.candidate));
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") {
      window.clearTimeout(timeoutId);
      onState({ status: "live" });
    } else if (pc.connectionState === "failed") {
      finish("failed", true);
    }
  };
  onState({ status: "connecting" });

  return {
    async handleSignal(signal: CameraSignal) {
      if (closed) return;
      if (signal.kind === "end") return finish(signal.reason, false);

      try {
        if (signal.kind === "offer") {
          await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
          await signalling.flushCandidates();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          signalling.send({ kind: "answer", sdp: answer.sdp ?? "" });
        } else if (signal.kind === "candidate") {
          await signalling.receiveCandidate(signal.candidate);
        }
      } catch {
        finish("failed", true);
      }
    },
    /** Stops watching; the engine tells the kiosk page when the stream ends. */
    close() {
      finish("viewer-left", false);
    },
  };
};
