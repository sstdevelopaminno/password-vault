import crypto from "crypto";
import { FACE_PIN_SESSION_TTL_SEC } from "@/lib/session-security";

export const FACE_VECTOR_LENGTH = 256;
export const FACE_MATCH_THRESHOLD = 0.74;
export const FACE_MAX_FAILED_ATTEMPTS = 5;
export const FACE_LOCK_MINUTES = 5;

type FacePinSessionPayload = {
  userId: string;
  activeSession: string;
  exp: number;
  version: 1;
};

export type FaceSamplePayload = {
  vector: number[];
  quality?: number;
  motionScore?: number;
};

export type StoredFaceTemplate = {
  version: "v1";
  vectors: number[][];
  enrolledAt: string;
  qualityScore: number;
};

function base64url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64url(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function signingKey() {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error("APP_ENCRYPTION_KEY must be set and at least 32 chars");
  }
  return key;
}

function sign(data: string) {
  return base64url(crypto.createHmac("sha256", signingKey()).update(data).digest());
}

export function normalizeFaceVector(input: number[]) {
  if (!Array.isArray(input) || input.length !== FACE_VECTOR_LENGTH) {
    throw new Error("Invalid face vector length");
  }

  const values = input.map((value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new Error("Invalid face vector value");
    }
    return number;
  });

  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error("Invalid face vector magnitude");
  }

  return values.map((value) => Number((value / magnitude).toFixed(6)));
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length !== FACE_VECTOR_LENGTH || right.length !== FACE_VECTOR_LENGTH) {
    throw new Error("Mismatched face vector length");
  }
  let dot = 0;
  for (let index = 0; index < FACE_VECTOR_LENGTH; index += 1) {
    dot += left[index] * right[index];
  }
  return dot;
}

export function mirrorFaceVector(input: number[]) {
  if (!Array.isArray(input) || input.length !== FACE_VECTOR_LENGTH) {
    throw new Error("Invalid face vector length");
  }

  const side = Math.sqrt(FACE_VECTOR_LENGTH);
  if (!Number.isInteger(side)) {
    throw new Error("Unable to infer face vector dimensions");
  }

  const mirrored = new Array<number>(FACE_VECTOR_LENGTH);
  for (let row = 0; row < side; row += 1) {
    for (let col = 0; col < side; col += 1) {
      const sourceIndex = row * side + (side - 1 - col);
      mirrored[row * side + col] = Number(input[sourceIndex] ?? 0);
    }
  }

  return normalizeFaceVector(mirrored);
}

export function bestFaceSimilarity(inputVector: number[], storedVectors: number[][]) {
  let best = -1;
  for (const vector of storedVectors) {
    const score = cosineSimilarity(inputVector, vector);
    if (score > best) best = score;
  }
  return best;
}

export function buildStoredFaceTemplate(samples: FaceSamplePayload[]): StoredFaceTemplate {
  if (!Array.isArray(samples) || samples.length < 2) {
    throw new Error("At least 2 face samples are required");
  }

  const vectors = samples.map((entry) => normalizeFaceVector(entry.vector));
  const qualityScore =
    samples.reduce((sum, entry) => sum + Math.max(0, Number(entry.quality ?? 0)), 0) / samples.length;

  return {
    version: "v1",
    vectors,
    enrolledAt: new Date().toISOString(),
    qualityScore: Number(qualityScore.toFixed(4)),
  };
}

export function parseStoredFaceTemplate(raw: string): StoredFaceTemplate {
  const parsed = JSON.parse(raw) as Partial<StoredFaceTemplate>;
  if (parsed.version !== "v1") {
    throw new Error("Unsupported face template version");
  }
  if (!Array.isArray(parsed.vectors) || parsed.vectors.length === 0) {
    throw new Error("Missing face vectors");
  }
  const normalizedVectors = parsed.vectors.map((vector) => normalizeFaceVector(vector));

  return {
    version: "v1",
    vectors: normalizedVectors,
    enrolledAt: String(parsed.enrolledAt ?? new Date().toISOString()),
    qualityScore: Number(parsed.qualityScore ?? 0),
  };
}

export function createFacePinSessionToken(input: {
  userId: string;
  activeSession: string;
  ttlSec?: number;
}) {
  const payload: FacePinSessionPayload = {
    userId: input.userId,
    activeSession: input.activeSession,
    exp: Date.now() + Math.max(1, input.ttlSec ?? FACE_PIN_SESSION_TTL_SEC) * 1000,
    version: 1,
  };
  const payloadEncoded = base64url(JSON.stringify(payload));
  const signature = sign(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

export function verifyFacePinSessionToken(
  token: string,
  input: { userId: string; activeSession: string },
) {
  if (!token || !input.activeSession) return false;

  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) {
    return false;
  }

  const expectedSignature = sign(payloadEncoded);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return false;
  }

  const payload = JSON.parse(fromBase64url(payloadEncoded)) as FacePinSessionPayload;
  if (payload.version !== 1) return false;
  if (payload.exp < Date.now()) return false;
  if (payload.userId !== input.userId) return false;
  if (payload.activeSession !== input.activeSession) return false;

  return true;
}
