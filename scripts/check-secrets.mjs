import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const ROOT = process.cwd();
const execFileAsync = promisify(execFile);

const IGNORE_DIRS = new Set([
  ".git",
  ".next",
  ".vercel",
  "node_modules",
  "android/build",
  "android/app/build",
  "android/.gradle",
  ".gradle-home",
  "ios/build",
  "www",
  ".tmp",
  "supabase/.temp",
]);

const IGNORE_FILES = new Set([
  ".env.example",
  ".env.local",
  ".env.production.local",
  ".env.vercel.prod",
  "package-lock.json",
  "tsconfig.tsbuildinfo",
  "scripts/check-secrets.mjs",
  "check-secrets.mjs",
]);

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".sql",
  ".env",
  ".txt",
  ".sh",
  ".ps1",
  ".gradle",
  ".properties",
  ".xml",
]);

const PLACEHOLDER_HINTS = [
  "example",
  "placeholder",
  "replace_me",
  "your_",
  "your-",
  "yourpassword",
  "xxxxx",
  "aa:bb:cc",
];

const RULES = [
  { id: "private-key-block", regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g },
  { id: "github-token", regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { id: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: "slack-token", regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  {
    id: "high-risk-env-assignment",
    regex:
      /\b(?:VERCEL|SUPABASE|OPENAI|PUSH|OTP|RESEND|SECRET|TOKEN|PRIVATE_KEY|API_KEY)[A-Z0-9_]*\s*[:=]\s*["']?([A-Za-z0-9_./:+=-]{16,})["']?/g,
    valueGroup: 1,
  },
];

function normalizeSlashes(value) {
  return value.replace(/\\/g, "/");
}

function shouldIgnorePath(relPath) {
  if (IGNORE_FILES.has(path.basename(relPath))) return true;
  const normalized = normalizeSlashes(relPath);
  return Array.from(IGNORE_DIRS).some((prefix) => normalized === prefix || normalized.startsWith(prefix + "/"));
}

function looksLikeBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  let zeroCount = 0;
  for (const byte of sample) {
    if (byte === 0) zeroCount += 1;
  }
  return zeroCount > 0;
}

function shouldSkipByExtension(relPath) {
  const base = path.basename(relPath);
  if (base.startsWith(".env")) return false;
  const ext = path.extname(relPath).toLowerCase();
  if (!ext) return false;
  return !TEXT_EXTENSIONS.has(ext);
}

function isPlaceholderValue(value) {
  const lower = String(value || "").toLowerCase();
  if (!lower.trim()) return true;
  return PLACEHOLDER_HINTS.some((hint) => lower.includes(hint));
}

async function collectFiles(dir, result) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(ROOT, abs);
    if (shouldIgnorePath(rel)) continue;
    if (entry.isDirectory()) {
      await collectFiles(abs, result);
      continue;
    }
    if (entry.isFile()) {
      if (shouldSkipByExtension(rel)) continue;
      result.push({ abs, rel });
    }
  }
}

async function collectTrackedFilesFromGit() {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files"], { cwd: ROOT, maxBuffer: 20 * 1024 * 1024 });
    const files = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((rel) => !shouldIgnorePath(rel))
      .filter((rel) => !shouldSkipByExtension(rel))
      .map((rel) => ({ rel, abs: path.join(ROOT, rel) }));
    return files;
  } catch {
    return null;
  }
}

function toLineCol(text, index) {
  const prefix = text.slice(0, index);
  const lines = prefix.split("\n");
  const line = lines.length;
  const col = lines[lines.length - 1].length + 1;
  return { line, col };
}

function firstLine(text) {
  return text.split(/\r?\n/, 1)[0] || "";
}

function redactPreview(ruleId, token) {
  if (ruleId === "high-risk-env-assignment") {
    const key = String(token).split(/[=:]/, 1)[0]?.trim() || "ENV_KEY";
    return `${key}=<redacted>`;
  }
  if (ruleId === "private-key-block") return "-----BEGIN PRIVATE KEY-----";
  return "<redacted>";
}

async function main() {
  let files = await collectTrackedFilesFromGit();
  if (!files) {
    files = [];
    await collectFiles(ROOT, files);
  }

  const findings = [];

  for (const file of files) {
    const raw = await fs.readFile(file.abs);
    if (looksLikeBinary(raw)) continue;
    const content = raw.toString("utf8");

    for (const rule of RULES) {
      const regex = new RegExp(rule.regex.source, rule.regex.flags);
      let match = regex.exec(content);
      while (match) {
        const token = match[0];
        const captured = typeof rule.valueGroup === "number" ? match[rule.valueGroup] : token;
        if (rule.id === "high-risk-env-assignment" && isPlaceholderValue(captured)) {
          match = regex.exec(content);
          continue;
        }
        const pos = toLineCol(content, match.index);
        findings.push({
          file: file.rel,
          line: pos.line,
          col: pos.col,
          rule: rule.id,
          preview: redactPreview(rule.id, firstLine(token).slice(0, 160)),
        });
        match = regex.exec(content);
      }
    }
  }

  if (!findings.length) {
    console.log("Secret scan passed: no high-confidence credential patterns found.");
    return;
  }

  console.error("Secret scan failed. Potential credentials found:");
  for (const finding of findings) {
    console.error(
      `- ${normalizeSlashes(finding.file)}:${finding.line}:${finding.col} [${finding.rule}] ${finding.preview}`,
    );
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("Secret scan failed unexpectedly:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
