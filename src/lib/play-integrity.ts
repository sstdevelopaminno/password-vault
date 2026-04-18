import crypto from "crypto";

export type PlayIntegrityDeviceVerdict = "strong" | "device" | "basic" | "failed" | "unknown";

export type PlayIntegrityVerificationResult = {
  status: "verified" | "skipped" | "error";
  verdict: PlayIntegrityDeviceVerdict;
  reasonCodes: string[];
  appRecognitionVerdict?: string;
  deviceRecognitionVerdicts?: string[];
  packageName?: string;
  requestPackageName?: string;
  tokenTimestampMillis?: number;
  nonceMatched?: boolean;
  packageMatched?: boolean;
  timestampFresh?: boolean;
  errorMessage?: string;
};

type GoogleAccessToken = {
  accessToken: string;
  expiresAtMs: number;
};

let cachedAccessToken: GoogleAccessToken | null = null;

const PLAY_INTEGRITY_SCOPE = "https://www.googleapis.com/auth/playintegrity";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const PLAY_INTEGRITY_BASE_URL = "https://playintegrity.googleapis.com/v1";

function base64url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function envValue(key: string) {
  return String(process.env[key] ?? "").trim();
}

function getPrivateKey() {
  const raw = envValue("PLAY_INTEGRITY_SERVICE_ACCOUNT_PRIVATE_KEY");
  if (!raw) return "";
  return raw.replace(/\\n/g, "\n");
}

export function getPlayIntegrityPackageName() {
  return envValue("PLAY_INTEGRITY_PACKAGE_NAME") || "com.passwordvault.app";
}

export function getPlayIntegrityCloudProjectNumber() {
  const raw = envValue("PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER");
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return Math.floor(numeric);
}

export function isPlayIntegrityConfigured() {
  return Boolean(
    envValue("PLAY_INTEGRITY_SERVICE_ACCOUNT_EMAIL") &&
    getPrivateKey() &&
    getPlayIntegrityPackageName(),
  );
}

function getAllowedTokenAgeMs() {
  const raw = Number(envValue("PLAY_INTEGRITY_ALLOWED_TOKEN_AGE_SEC") || "180");
  if (!Number.isFinite(raw)) return 180_000;
  const sec = Math.max(60, Math.min(600, Math.floor(raw)));
  return sec * 1000;
}

async function requestGoogleAccessToken() {
  if (!isPlayIntegrityConfigured()) {
    throw new Error("Play Integrity credentials are not configured");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAtMs - 60_000 > Date.now()) {
    return cachedAccessToken.accessToken;
  }

  const serviceAccountEmail = envValue("PLAY_INTEGRITY_SERVICE_ACCOUNT_EMAIL");
  const privateKey = getPrivateKey();

  const jwtHeader = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const jwtClaim = base64url(
    JSON.stringify({
      iss: serviceAccountEmail,
      scope: PLAY_INTEGRITY_SCOPE,
      aud: OAUTH_TOKEN_URL,
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );

  const signingInput = `${jwtHeader}.${jwtClaim}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey).toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const assertion = `${signingInput}.${signature}`;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const payload = (await response.json().catch(function () {
    return {};
  })) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "OAuth token request failed");
  }

  const expiresInSec = Number(payload.expires_in ?? 3600);
  cachedAccessToken = {
    accessToken: payload.access_token,
    expiresAtMs: Date.now() + Math.max(60, expiresInSec) * 1000,
  };
  return payload.access_token;
}

function mapVerdict(input: {
  appRecognitionVerdict?: string;
  deviceRecognitionVerdicts?: string[];
  nonceMatched: boolean;
  packageMatched: boolean;
  timestampFresh: boolean;
}): PlayIntegrityDeviceVerdict {
  const appRecognitionVerdict = String(input.appRecognitionVerdict ?? "");
  const deviceRecognition = input.deviceRecognitionVerdicts ?? [];

  if (!input.nonceMatched || !input.packageMatched || !input.timestampFresh) return "failed";
  if (appRecognitionVerdict !== "PLAY_RECOGNIZED") return "failed";
  if (deviceRecognition.includes("MEETS_STRONG_INTEGRITY")) return "strong";
  if (deviceRecognition.includes("MEETS_DEVICE_INTEGRITY")) return "device";
  if (deviceRecognition.includes("MEETS_BASIC_INTEGRITY")) return "basic";
  return "failed";
}

export async function verifyPlayIntegrityToken(input: {
  integrityToken: string;
  expectedNonce: string;
  expectedPackageName?: string;
}): Promise<PlayIntegrityVerificationResult> {
  const token = String(input.integrityToken ?? "").trim();
  const expectedNonce = String(input.expectedNonce ?? "").trim();
  const expectedPackageName = String(input.expectedPackageName ?? getPlayIntegrityPackageName()).trim();

  if (!token || !expectedNonce || !expectedPackageName) {
    return {
      status: "error",
      verdict: "unknown",
      reasonCodes: ["missing_integrity_token_or_nonce_or_package"],
      errorMessage: "Integrity token, nonce, or package name is missing.",
    };
  }

  if (!isPlayIntegrityConfigured()) {
    return {
      status: "skipped",
      verdict: "unknown",
      reasonCodes: ["play_integrity_not_configured"],
    };
  }

  try {
    const accessToken = await requestGoogleAccessToken();
    const endpoint = `${PLAY_INTEGRITY_BASE_URL}/${encodeURIComponent(expectedPackageName)}:decodeIntegrityToken`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ integrityToken: token }),
      cache: "no-store",
    });

    const body = (await response.json().catch(function () {
      return {};
    })) as {
      tokenPayloadExternal?: {
        requestDetails?: {
          requestPackageName?: string;
          nonce?: string;
          timestampMillis?: string | number;
        };
        appIntegrity?: {
          appRecognitionVerdict?: string;
          packageName?: string;
        };
        deviceIntegrity?: {
          deviceRecognitionVerdict?: string[];
        };
      };
      error?: { message?: string };
    };

    if (!response.ok || !body.tokenPayloadExternal) {
      return {
        status: "error",
        verdict: "unknown",
        reasonCodes: ["decode_integrity_token_failed"],
        errorMessage: body.error?.message || `HTTP ${response.status}`,
      };
    }

    const payload = body.tokenPayloadExternal;
    const requestDetails = payload.requestDetails ?? {};
    const appIntegrity = payload.appIntegrity ?? {};
    const deviceIntegrity = payload.deviceIntegrity ?? {};

    const requestPackageName = String(requestDetails.requestPackageName ?? "").trim();
    const packageName = String(appIntegrity.packageName ?? "").trim();
    const nonce = String(requestDetails.nonce ?? "").trim();
    const tokenTimestampMillis = Number(requestDetails.timestampMillis ?? 0);
    const timestampFresh =
      Number.isFinite(tokenTimestampMillis) &&
      tokenTimestampMillis > 0 &&
      Date.now() - tokenTimestampMillis <= getAllowedTokenAgeMs();
    const nonceMatched = nonce === expectedNonce;
    const packageMatched = Boolean(
      requestPackageName === expectedPackageName &&
      packageName === expectedPackageName,
    );
    const deviceRecognitionVerdicts = Array.isArray(deviceIntegrity.deviceRecognitionVerdict)
      ? deviceIntegrity.deviceRecognitionVerdict.map((value) => String(value))
      : [];
    const appRecognitionVerdict = String(appIntegrity.appRecognitionVerdict ?? "");

    const reasonCodes: string[] = [];
    if (!nonceMatched) reasonCodes.push("nonce_mismatch");
    if (!packageMatched) reasonCodes.push("package_mismatch");
    if (!timestampFresh) reasonCodes.push("token_timestamp_stale");
    if (appRecognitionVerdict !== "PLAY_RECOGNIZED") reasonCodes.push("app_not_play_recognized");
    if (!deviceRecognitionVerdicts.length) reasonCodes.push("device_integrity_missing");

    const verdict = mapVerdict({
      appRecognitionVerdict,
      deviceRecognitionVerdicts,
      nonceMatched,
      packageMatched,
      timestampFresh,
    });

    return {
      status: "verified",
      verdict,
      reasonCodes,
      appRecognitionVerdict,
      deviceRecognitionVerdicts,
      packageName,
      requestPackageName,
      tokenTimestampMillis: Number.isFinite(tokenTimestampMillis) ? tokenTimestampMillis : undefined,
      nonceMatched,
      packageMatched,
      timestampFresh,
    };
  } catch (error) {
    return {
      status: "error",
      verdict: "unknown",
      reasonCodes: ["play_integrity_verification_exception"],
      errorMessage: error instanceof Error ? error.message : "Unknown Play Integrity verification error",
    };
  }
}
