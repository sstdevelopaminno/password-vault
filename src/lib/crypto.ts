import crypto from "crypto";

function key() {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error("APP_ENCRYPTION_KEY must be at least 32 chars");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function encrypt(data: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decrypt(payload: string) {
  const [ivRaw, tagRaw, dataRaw] = payload.split(".");
  if (!ivRaw || !tagRaw || !dataRaw) {
    throw new Error("Invalid encrypted payload format");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(ivRaw, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataRaw, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

// Backward-compatible names already used in routes.
export const encryptText = encrypt;
export const decryptText = decrypt;
