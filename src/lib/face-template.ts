export const FACE_CAPTURE_SIZE = 16;

export type CameraAccessErrorCode =
  | "not-supported"
  | "permission-denied"
  | "device-not-found"
  | "device-busy"
  | "unknown";

export class CameraAccessError extends Error {
  code: CameraAccessErrorCode;

  constructor(code: CameraAccessErrorCode, message: string) {
    super(message);
    this.name = "CameraAccessError";
    this.code = code;
  }
}

export type CapturedFaceSample = {
  vector: number[];
  quality: number;
};

const CAMERA_READY_TIMEOUT_MS = 4000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toGray(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function normalizeVector(raw: number[]) {
  const mean = raw.reduce((sum, value) => sum + value, 0) / raw.length;
  const centered = raw.map((value) => value - mean);
  const magnitude = Math.sqrt(centered.reduce((sum, value) => sum + value * value, 0)) || 1;
  return centered.map((value) => Number((value / magnitude).toFixed(6)));
}

export function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
  }
  return dot;
}

function getCenteredSquare(video: HTMLVideoElement) {
  const sourceWidth = Math.max(1, Math.floor(video.videoWidth || video.clientWidth || 1));
  const sourceHeight = Math.max(1, Math.floor(video.videoHeight || video.clientHeight || 1));
  const size = Math.min(sourceWidth, sourceHeight);
  const sx = Math.floor((sourceWidth - size) / 2);
  const sy = Math.floor((sourceHeight - size) / 2);
  return { sx, sy, size };
}

function hasVideoFrame(video: HTMLVideoElement) {
  return video.videoWidth > 0 && video.videoHeight > 0;
}

function waitForVideoFrame(video: HTMLVideoElement) {
  if (hasVideoFrame(video)) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let timer: number | null = null;
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("playing", onReady);
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
    const onReady = () => {
      if (!hasVideoFrame(video)) return;
      cleanup();
      resolve();
    };

    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("playing", onReady);
    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Camera stream is not ready"));
    }, CAMERA_READY_TIMEOUT_MS);
  });
}

export function captureFaceSample(video: HTMLVideoElement): CapturedFaceSample {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error("Camera stream is not ready");
  }

  const canvas = document.createElement("canvas");
  canvas.width = FACE_CAPTURE_SIZE;
  canvas.height = FACE_CAPTURE_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Unable to read camera frame");
  }

  const { sx, sy, size } = getCenteredSquare(video);
  context.drawImage(
    video,
    sx,
    sy,
    size,
    size,
    0,
    0,
    FACE_CAPTURE_SIZE,
    FACE_CAPTURE_SIZE,
  );

  const imageData = context.getImageData(0, 0, FACE_CAPTURE_SIZE, FACE_CAPTURE_SIZE).data;
  const grayscale: number[] = [];
  for (let offset = 0; offset < imageData.length; offset += 4) {
    grayscale.push(toGray(imageData[offset], imageData[offset + 1], imageData[offset + 2]));
  }

  const mean = grayscale.reduce((sum, value) => sum + value, 0) / grayscale.length;
  const variance =
    grayscale.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / grayscale.length;
  const stdDev = Math.sqrt(variance);
  const quality = clamp(stdDev / 64, 0, 1);

  return {
    vector: normalizeVector(grayscale),
    quality: Number(quality.toFixed(4)),
  };
}

export async function startCamera(video: HTMLVideoElement) {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    throw new CameraAccessError("not-supported", "Camera API is not supported on this device.");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 640 },
      },
      audio: false,
    });
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === "NotAllowedError" || error.name === "SecurityError") {
        throw new CameraAccessError(
          "permission-denied",
          "Camera permission denied. Please allow camera access and retry.",
        );
      }
      if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
        throw new CameraAccessError(
          "device-not-found",
          "No front camera was detected on this device.",
        );
      }
      if (error.name === "NotReadableError" || error.name === "AbortError") {
        throw new CameraAccessError(
          "device-busy",
          "Camera is busy in another app. Close other camera apps and retry.",
        );
      }
    }
    throw new CameraAccessError("unknown", "Unable to start camera stream.");
  }

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  try {
    await video.play();
  } catch {
    // Some Android WebViews can return a transient play rejection before metadata is ready.
  }
  await waitForVideoFrame(video);
  return stream;
}

export function stopCamera(stream: MediaStream | null) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
