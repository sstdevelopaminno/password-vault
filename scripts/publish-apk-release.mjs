import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function versionToCode(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)(?:[.-].*)?$/);
  if (!match) return 1;
  const major = Number.parseInt(match[1], 10) || 0;
  const minor = Number.parseInt(match[2], 10) || 0;
  const patch = Number.parseInt(match[3], 10) || 0;
  return Math.max(1, major * 1000 + minor * 100 + patch);
}

function asIsoDateToday() {
  return new Date().toISOString().slice(0, 10);
}

function replaceEnvLine(content, key, nextValue) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}=.*$`, "m");
  const line = `${key}=${nextValue}`;
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }
  if (content.endsWith("\n")) return content + line + "\n";
  return content + "\n" + line + "\n";
}

function replaceLocalEnvLine(content, key, nextValue) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}=.*$`, "m");
  const line = `${key}="${nextValue}"`;
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }
  if (content.endsWith("\n")) return content + line + "\n";
  return content + "\n" + line + "\n";
}

function updateFile(filePath, updater) {
  if (!existsSync(filePath)) return false;
  const current = readFileSync(filePath, "utf8");
  const next = updater(current);
  if (next === current) return false;
  writeFileSync(filePath, next, "utf8");
  return true;
}

function main() {
  const root = process.cwd();
  const pkg = readJson(path.join(root, "package.json"));
  const version = String(pkg.version || "").trim();
  if (!version) {
    throw new Error("package.json version is missing");
  }

  const versionCode = versionToCode(version);
  const publishDate = asIsoDateToday();
  const baseUrl = "https://password-vault-ivory.vercel.app";
  const apkFile = `vault-v${version}.apk`;
  const apkUrl = `${baseUrl}/apk/${apkFile}`;

  updateFile(path.join(root, ".env.example"), (content) => {
    let next = content;
    next = replaceEnvLine(next, "NEXT_PUBLIC_ANDROID_APK_VERSION", version);
    next = replaceEnvLine(next, "NEXT_PUBLIC_ANDROID_APK_VERSION_CODE", String(versionCode));
    next = replaceEnvLine(next, "NEXT_PUBLIC_ANDROID_APK_URL", apkUrl);
    next = replaceEnvLine(next, "NEXT_PUBLIC_ANDROID_APK_PUBLISHED_AT", publishDate);
    return next;
  });

  updateFile(path.join(root, ".env.local"), (content) => {
    let next = content;
    next = replaceLocalEnvLine(next, "NEXT_PUBLIC_APP_VERSION", `V${version}`);
    next = replaceLocalEnvLine(next, "NEXT_PUBLIC_ANDROID_APK_VERSION", version);
    next = replaceLocalEnvLine(next, "NEXT_PUBLIC_ANDROID_APK_VERSION_CODE", String(versionCode));
    next = replaceLocalEnvLine(next, "NEXT_PUBLIC_ANDROID_APK_URL", apkUrl);
    next = replaceLocalEnvLine(next, "NEXT_PUBLIC_ANDROID_APK_PUBLISHED_AT", publishDate);
    return next;
  });

  process.stdout.write(
    JSON.stringify(
      {
        version,
        versionCode,
        publishDate,
        apkFile,
        apkUrl,
      },
      null,
      2,
    ),
  );
}

main();

