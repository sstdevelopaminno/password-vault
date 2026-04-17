import { copyFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const javaExecutableName = process.platform === "win32" ? "java.exe" : "java";

function toFsPath(inputPath) {
  if (process.platform !== "win32") return inputPath;
  return inputPath.replace(/^\/([A-Za-z]):\//, "$1:/");
}

function ensurePath(inputPath) {
  const normalized = toFsPath(inputPath);
  if (!existsSync(normalized)) return "";
  return normalized;
}

function getJavaMajorVersion(javaExecutable) {
  const result = spawnSync(javaExecutable, ["-version"], { encoding: "utf8" });
  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const match = combined.match(/version\s+"(\d+)(?:\.\d+)?/i);
  if (!match) return 0;
  return Number.parseInt(match[1], 10) || 0;
}

function findJavaHome() {
  const localJdkRoot = path.join(projectRoot, "tools", "jdk21");
  if (existsSync(localJdkRoot)) {
    const entries = readdirSync(localJdkRoot)
      .map((name) => path.join(localJdkRoot, name))
      .filter((full) => statSync(full).isDirectory())
      .filter((full) => {
        const javaExe = path.join(full, "bin", javaExecutableName);
        return existsSync(javaExe) && getJavaMajorVersion(javaExe) >= 21;
      });
    if (entries.length) {
      entries.sort();
      return entries[entries.length - 1];
    }
  }

  const fromEnv = process.env.JAVA_HOME ? ensurePath(process.env.JAVA_HOME) : "";
  if (fromEnv) {
    const javaExe = path.join(fromEnv, "bin", javaExecutableName);
    if (existsSync(javaExe) && getJavaMajorVersion(javaExe) >= 21) {
      return fromEnv;
    }
  }

  return "";
}

function findAndroidSdkRoot() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk") : "",
  ]
    .filter(Boolean)
    .map((value) => ensurePath(String(value)));

  return candidates.find(Boolean) || "";
}

function runStep(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
}

function loadLocalEnvFile() {
  const envPath = path.join(projectRoot, ".env.local");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || process.env[key]) continue;
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function findBuildToolsExecutable(androidSdkRoot, executableName) {
  const buildToolsRoot = path.join(androidSdkRoot, "build-tools");
  if (!existsSync(buildToolsRoot)) return "";
  const versionDirs = readdirSync(buildToolsRoot)
    .map((name) => path.join(buildToolsRoot, name))
    .filter((full) => statSync(full).isDirectory())
    .sort()
    .reverse();
  for (const dir of versionDirs) {
    const candidate = path.join(dir, executableName);
    if (existsSync(candidate)) return candidate;
  }
  return "";
}

loadLocalEnvFile();
const javaHome = findJavaHome();
if (!javaHome) {
  console.error("JDK 21 not found. Install JDK 21 or place it under tools/jdk21.");
  process.exit(1);
}

const androidSdkRoot = findAndroidSdkRoot();
if (!androidSdkRoot) {
  console.error("Android SDK not found. Set ANDROID_HOME/ANDROID_SDK_ROOT first.");
  process.exit(1);
}

const javaBin = path.join(javaHome, "bin");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const gradleCommand = process.platform === "win32" ? "gradlew.bat" : "./gradlew";

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidSdkRoot,
  ANDROID_SDK_ROOT: androidSdkRoot,
  PATH: `${javaBin}${path.delimiter}${process.env.PATH ?? ""}`,
};

console.log(`Using JAVA_HOME=${javaHome}`);
console.log(`Using ANDROID_HOME=${androidSdkRoot}`);

runStep(npmCommand, ["run", "cap:sync:android"], { cwd: projectRoot, env });
runStep(gradleCommand, ["assembleRelease"], { cwd: path.join(projectRoot, "android"), env });

const releaseDir = path.join(projectRoot, "android", "app", "build", "outputs", "apk", "release");
const unsignedApk = path.join(releaseDir, "app-release-unsigned.apk");
const signedApk = path.join(releaseDir, "app-release.apk");

if (!existsSync(unsignedApk)) {
  console.error(`Unsigned APK not found: ${unsignedApk}`);
  process.exit(1);
}

const keystorePath = process.env.ANDROID_RELEASE_KEYSTORE
  ? path.resolve(projectRoot, process.env.ANDROID_RELEASE_KEYSTORE)
  : "";
const keyAlias = process.env.ANDROID_RELEASE_KEY_ALIAS ?? "";
const storePassword = process.env.ANDROID_RELEASE_STORE_PASSWORD ?? "";
const keyPassword = process.env.ANDROID_RELEASE_KEY_PASSWORD ?? "";

if (keystorePath && keyAlias && storePassword && keyPassword) {
  const apksignerExecutable = findBuildToolsExecutable(androidSdkRoot, process.platform === "win32" ? "apksigner.bat" : "apksigner");
  if (!apksignerExecutable) {
    console.error("apksigner not found under Android SDK build-tools.");
    process.exit(1);
  }
  if (!existsSync(keystorePath)) {
    console.error(`Keystore not found: ${keystorePath}`);
    process.exit(1);
  }

  runStep(
    apksignerExecutable,
    [
      "sign",
      "--ks",
      keystorePath,
      "--ks-key-alias",
      keyAlias,
      "--ks-pass",
      `pass:${storePassword}`,
      "--key-pass",
      `pass:${keyPassword}`,
      "--out",
      signedApk,
      unsignedApk,
    ],
    { cwd: projectRoot, env },
  );

  runStep(apksignerExecutable, ["verify", "--verbose", signedApk], { cwd: projectRoot, env });
  console.log(`Signed APK ready: ${signedApk}`);
} else {
  copyFileSync(unsignedApk, signedApk);
  console.log(`Signing secrets not set; copied unsigned build to: ${signedApk}`);
}
