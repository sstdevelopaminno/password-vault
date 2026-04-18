const DEFAULT_NATIVE_SCHEME = "com.passwordvault.app";
export const OAUTH_CALLBACK_PATH = "/auth/callback";

function normalizeScheme(value: string) {
  return value.trim().toLowerCase().replace(/:$/, "");
}

export function getNativeOAuthScheme() {
  const raw = String(process.env.NEXT_PUBLIC_CAPACITOR_APP_SCHEME ?? "").trim();
  const normalized = normalizeScheme(raw);
  return normalized || DEFAULT_NATIVE_SCHEME;
}

export function getNativeOAuthRedirectUrl() {
  return `${getNativeOAuthScheme()}://auth/callback`;
}

export function getWebOAuthRedirectUrl(origin: string) {
  const safeOrigin = String(origin ?? "").trim().replace(/\/+$/, "");
  return `${safeOrigin}${OAUTH_CALLBACK_PATH}`;
}

export function mapNativeCallbackToWebPath(inputUrl: string, origin: string) {
  try {
    const parsed = new URL(inputUrl);
    const expectedProtocol = `${getNativeOAuthScheme()}:`;
    if (parsed.protocol.toLowerCase() !== expectedProtocol) {
      return null;
    }

    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname || "/";
    if (host !== "auth" || path !== "/callback") {
      return null;
    }

    const target = new URL(OAUTH_CALLBACK_PATH, origin);
    target.search = parsed.search;
    target.hash = parsed.hash;
    return target.pathname + target.search + target.hash;
  } catch {
    return null;
  }
}
