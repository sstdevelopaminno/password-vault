import crypto from "crypto";
import bcrypt from "bcryptjs";

const DEFAULT_ASSERTION_TTL_MS = 2 * 60 * 1000;
const DELETE_ACCOUNT_ASSERTION_TTL_MS = 10 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

export type PinAction =
  | "view_secret"
  | "copy_secret"
  | "edit_secret"
  | "delete_secret"
  | "open_workspace_folder"
  | "delete_workspace_file"
  | "delete_calculator_history"
  | "delete_account"
  | "admin_view_vault"
  | "approve_signup_request"
  | "delete_signup_request"
  | "unlock_app"
  | "delete_workspace_folder";

type AssertionPayload = {
  userId: string;
  action: PinAction;
  targetItemId?: string;
  exp: number;
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

export function isValidPinFormat(pin: string) {
  return /^\d{6}$/.test(pin);
}

export async function hashPin(pin: string) {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

export async function verifyPin(pin: string, pinHash: string) {
  if (!pinHash) {
    return false;
  }
  return bcrypt.compare(pin, pinHash);
}

export function createPinAssertionToken(input: {
  userId: string;
  action: PinAction;
  targetItemId?: string;
}) {
  const ttlMs = input.action === "delete_account" ? DELETE_ACCOUNT_ASSERTION_TTL_MS : DEFAULT_ASSERTION_TTL_MS;
  const payload: AssertionPayload = {
    userId: input.userId,
    action: input.action,
    targetItemId: input.targetItemId,
    exp: Date.now() + ttlMs,
  };
  const payloadEncoded = base64url(JSON.stringify(payload));
  const signature = sign(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

export function verifyPinAssertionToken(
  token: string,
  input: { userId: string; action: PinAction; targetItemId?: string },
) {
  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) {
    return false;
  }

  const expectedSignature = sign(payloadEncoded);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return false;
  }

  const payload = JSON.parse(fromBase64url(payloadEncoded)) as AssertionPayload;
  if (payload.exp < Date.now()) {
    return false;
  }
  if (payload.userId !== input.userId) {
    return false;
  }
  if (payload.action !== input.action) {
    return false;
  }
  if ((payload.targetItemId ?? "") !== (input.targetItemId ?? "")) {
    return false;
  }
  return true;
}
