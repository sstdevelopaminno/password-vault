const TRUE_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off", "disabled"]);

function parseBooleanEnv(raw: string | undefined, fallback: boolean) {
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
}

export function isAdminFeaturesEnabledServer() {
  return parseBooleanEnv(
    process.env.ADMIN_FEATURES_ENABLED ?? process.env.NEXT_PUBLIC_ADMIN_FEATURES_ENABLED,
    false,
  );
}

export function isAdminFeaturesEnabledClient() {
  return parseBooleanEnv(process.env.NEXT_PUBLIC_ADMIN_FEATURES_ENABLED, false);
}

