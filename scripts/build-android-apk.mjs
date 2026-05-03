import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
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
  const readMajorFromReleaseFile = () => {
    const javaHome = path.resolve(javaExecutable, "..", "..");
    const releasePath = path.join(javaHome, "release");
    if (!existsSync(releasePath)) return 0;
    const releaseContent = readFileSync(releasePath, "utf8");
    const releaseMatch = releaseContent.match(/JAVA_VERSION="(\d+)(?:\.\d+)?/i);
    if (!releaseMatch) return 0;
    return Number.parseInt(releaseMatch[1], 10) || 0;
  };

  const parseMajor = (stdout, stderr) => {
    const combined = `${stdout ?? ""}\n${stderr ?? ""}`;
    const match = combined.match(/version\s+"(\d+)(?:\.\d+)?/i);
    if (!match) return 0;
    return Number.parseInt(match[1], 10) || 0;
  };

  const directResult = spawnSync(javaExecutable, ["-version"], { encoding: "utf8" });
  const directMajor = parseMajor(directResult.stdout, directResult.stderr);
  if (directMajor >= 1) return directMajor;

  if (process.platform === "win32" && directResult.error?.code === "EPERM") {
    const cmdResult = spawnSync("cmd.exe", ["/d", "/s", "/c", `"${javaExecutable}" -version`], { encoding: "utf8" });
    const cmdMajor = parseMajor(cmdResult.stdout, cmdResult.stderr);
    if (cmdMajor >= 1) return cmdMajor;
  }

  return readMajorFromReleaseFile();
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

function resolveNpmCommand() {
  if (process.platform !== "win32") return "npm";
  const candidates = [
    process.env.NPM_CMD_PATH ? String(process.env.NPM_CMD_PATH) : "",
    "C:\\Progra~1\\nodejs\\npm.cmd",
    "C:\\Program Files\\nodejs\\npm.cmd",
    "C:\\Program Files (x86)\\nodejs\\npm.cmd",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalized = toFsPath(candidate);
    if (existsSync(normalized)) return normalized;
  }

  return "npm.cmd";
}

function runStep(command, args, options = {}) {
  const isWindowsCmdScript =
    process.platform === "win32" &&
    (String(command).toLowerCase().endsWith(".cmd") || String(command).toLowerCase().endsWith(".bat"));
  const result = isWindowsCmdScript
    ? spawnSync(
        "C:\\Windows\\System32\\cmd.exe",
        [
          "/d",
          "/c",
          ((command.includes(" ") ? `"${command}"` : command) + " " + args.map((arg) => String(arg)).join(" ")).trim(),
        ],
        {
          stdio: "inherit",
          shell: false,
          ...options,
        },
      )
    : spawnSync(command, args, {
        stdio: "inherit",
        shell: false,
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

function isPlaceholderWebShell() {
  const indexPath = path.join(projectRoot, "www", "index.html");
  if (!existsSync(indexPath)) return false;
  const content = readFileSync(indexPath, "utf8");
  return content.includes("Capacitor shell placeholder");
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

function readPackageVersion() {
  try {
    const packageJsonPath = path.join(projectRoot, "package.json");
    const raw = readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw);
    return String(parsed.version || "").trim();
  } catch {
    return "";
  }
}

function pruneHistoricalPublicApks(publicApkDir, keepFileName) {
  if (!publicApkDir || !existsSync(publicApkDir)) return;
  const apkFiles = readdirSync(publicApkDir).filter((name) => /^vault-v.+\.apk$/i.test(name));
  for (const apkFileName of apkFiles) {
    if (apkFileName === keepFileName) continue;
    const fullPath = path.join(publicApkDir, apkFileName);
    try {
      unlinkSync(fullPath);
      console.log(`Removed historical APK: ${fullPath}`);
    } catch (error) {
      console.warn(`Failed to remove historical APK ${fullPath}: ${error?.message ?? String(error)}`);
    }
  }
}

function getAndroidVersionFromPackage() {
  const packageVersion = readPackageVersion();
  const match = packageVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:[.-].*)?$/);
  if (!match) {
    return {
      versionName: packageVersion || "0.0.0",
      versionCode: 1,
    };
  }

  const major = Number.parseInt(match[1], 10) || 0;
  const minor = Number.parseInt(match[2], 10) || 0;
  const patch = Number.parseInt(match[3], 10) || 0;
  // Keep historical encoding used by this project (16.6.13 -> 16613).
  const versionCode = major * 1000 + minor * 100 + patch;

  return {
    versionName: packageVersion,
    versionCode: Math.max(versionCode, 1),
  };
}

loadLocalEnvFile();
const capacitorServerUrl = String(process.env.CAPACITOR_SERVER_URL ?? "").trim();
if (capacitorServerUrl) {
  console.log("CAPACITOR_SERVER_URL is set. APK will load runtime from remote URL:", capacitorServerUrl);
} else if (isPlaceholderWebShell()) {
  console.error("CAPACITOR_SERVER_URL is empty but www/index.html is still a placeholder shell.");
  console.error("Provide CAPACITOR_SERVER_URL or build/copy real web assets into ./www before building APK.");
  process.exit(1);
}

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
const npmCommand = resolveNpmCommand();
const gradleCommand = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const gradleUserHome = process.env.GRADLE_USER_HOME
  ? path.resolve(projectRoot, process.env.GRADLE_USER_HOME)
  : path.join(projectRoot, ".gradle-home");
const androidUserHome = process.env.ANDROID_USER_HOME
  ? path.resolve(projectRoot, process.env.ANDROID_USER_HOME)
  : path.join(projectRoot, ".android-home");
const androidVersion = getAndroidVersionFromPackage();
mkdirSync(gradleUserHome, { recursive: true });
mkdirSync(androidUserHome, { recursive: true });

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidSdkRoot,
  ANDROID_SDK_ROOT: androidSdkRoot,
  ANDROID_USER_HOME: androidUserHome,
  USERPROFILE: androidUserHome,
  HOME: androidUserHome,
  GRADLE_USER_HOME: gradleUserHome,
  PATH: `${javaBin}${path.delimiter}${path.dirname(npmCommand)}${path.delimiter}${process.env.PATH ?? ""}`,
};

console.log(`Using JAVA_HOME=${javaHome}`);
console.log(`Using ANDROID_HOME=${androidSdkRoot}`);
console.log(`Using ANDROID_USER_HOME=${androidUserHome}`);
console.log(`Using GRADLE_USER_HOME=${gradleUserHome}`);

runStep(npmCommand, ["run", "cap:sync:android"], { cwd: projectRoot, env });
runStep(
  gradleCommand,
  [
    `-PVERSION_NAME=${androidVersion.versionName}`,
    `-PVERSION_CODE=${androidVersion.versionCode}`,
    "assembleRelease",
  ],
  { cwd: path.join(projectRoot, "android"), env },
);

const releaseDir = path.join(projectRoot, "android", "app", "build", "outputs", "apk", "release");
const unsignedApk = path.join(releaseDir, "app-release-unsigned.apk");
const alignedApk = path.join(releaseDir, "app-release-aligned.apk");
const signedApk = path.join(releaseDir, "app-release.apk");
const packageVersion = androidVersion.versionName;
const publicApkDir = path.join(projectRoot, "public", "apk");
const publicApkFileName = packageVersion ? `vault-v${packageVersion}.apk` : "";
const publicApkPath = publicApkFileName ? path.join(publicApkDir, publicApkFileName) : "";

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
const allowUnsignedRelease = String(process.env.ANDROID_ALLOW_UNSIGNED_RELEASE ?? "false").toLowerCase() === "true";

if (keystorePath && keyAlias && storePassword && keyPassword) {
  const apksignerExecutable = findBuildToolsExecutable(androidSdkRoot, process.platform === "win32" ? "apksigner.bat" : "apksigner");
  const zipalignExecutable = findBuildToolsExecutable(androidSdkRoot, process.platform === "win32" ? "zipalign.exe" : "zipalign");
  if (!apksignerExecutable) {
    console.error("apksigner not found under Android SDK build-tools.");
    process.exit(1);
  }
  if (!zipalignExecutable) {
    console.error("zipalign not found under Android SDK build-tools.");
    process.exit(1);
  }
  if (!existsSync(keystorePath)) {
    console.error(`Keystore not found: ${keystorePath}`);
    process.exit(1);
  }

  runStep(
    zipalignExecutable,
    ["-f", "-p", "4", unsignedApk, alignedApk],
    { cwd: projectRoot, env },
  );

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
      "--v1-signing-enabled",
      "true",
      "--v2-signing-enabled",
      "true",
      "--v3-signing-enabled",
      "true",
      "--out",
      signedApk,
      alignedApk,
    ],
    { cwd: projectRoot, env },
  );

  runStep(apksignerExecutable, ["verify", "--verbose", "--print-certs", signedApk], { cwd: projectRoot, env });
  console.log(`Signed APK ready: ${signedApk}`);

  if (publicApkPath) {
    mkdirSync(publicApkDir, { recursive: true });
    copyFileSync(signedApk, publicApkPath);
    console.log(`Copied signed APK to public download path: ${publicApkPath}`);
    pruneHistoricalPublicApks(publicApkDir, publicApkFileName);
  }
} else {
  if (!allowUnsignedRelease) {
    console.error("Release signing secrets are missing. Refusing to produce unsigned release APK.");
    console.error("Set ANDROID_RELEASE_KEYSTORE, ANDROID_RELEASE_KEY_ALIAS, ANDROID_RELEASE_STORE_PASSWORD, ANDROID_RELEASE_KEY_PASSWORD");
    console.error("or set ANDROID_ALLOW_UNSIGNED_RELEASE=true only for local testing.");
    process.exit(1);
  }

  copyFileSync(unsignedApk, signedApk);
  console.log(`Signing secrets not set; copied unsigned build for local test only: ${signedApk}`);
}
