const rawVersion = String(process.env.NEXT_PUBLIC_APP_VERSION ?? "").trim();

export const APP_VERSION = rawVersion || "12.5.8";

export function versionLabel(locale: string) {
  return locale === "th" ? `เวอร์ชัน ${APP_VERSION}` : `Version ${APP_VERSION}`;
}
