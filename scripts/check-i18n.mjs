import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();
const messagesPath = path.join(projectRoot, "src", "i18n", "messages.ts");
const scanRoot = path.join(projectRoot, "src");
const scanExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md"]);
const packageUiFiles = [
  "src/app/(user)/our-packages/page.tsx",
  "src/app/(user)/package-check/page.tsx",
  "src/app/(user)/wallet/page.tsx",
];

function flattenKeys(value, prefix = "") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const keys = [];
  for (const [key, child] of Object.entries(value)) {
    const current = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === "object" && !Array.isArray(child)) {
      keys.push(...flattenKeys(child, current));
    } else {
      keys.push(current);
    }
  }
  return keys;
}

function loadMessages() {
  const source = fs.readFileSync(messagesPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: "messages.ts",
  }).outputText;

  const sandbox = {
    module: { exports: {} },
    exports: {},
    __dirname: path.dirname(messagesPath),
    __filename: messagesPath,
    process,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(transpiled, sandbox, { filename: "messages.js" });

  return sandbox.module.exports.messages ?? sandbox.exports.messages;
}

function listFiles(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listFiles(fullPath, output);
      continue;
    }
    if (!scanExtensions.has(path.extname(entry.name))) continue;
    output.push(fullPath);
  }
  return output;
}

function hasInvalidTextChars(text) {
  return /[\uFFFD\u0080-\u009F]/u.test(text);
}

function run() {
  const failures = [];

  const messages = loadMessages();
  if (!messages?.th || !messages?.en) {
    failures.push("messages.ts must export both `th` and `en` message trees.");
  } else {
    const thKeys = new Set(flattenKeys(messages.th));
    const enKeys = new Set(flattenKeys(messages.en));

    const onlyTh = [...thKeys].filter((key) => !enKeys.has(key));
    const onlyEn = [...enKeys].filter((key) => !thKeys.has(key));

    if (onlyTh.length > 0) {
      failures.push(`Missing EN translations for ${onlyTh.length} key(s): ${onlyTh.join(", ")}`);
    }
    if (onlyEn.length > 0) {
      failures.push(`Missing TH translations for ${onlyEn.length} key(s): ${onlyEn.join(", ")}`);
    }
  }

  const invalidTextFiles = [];
  for (const filePath of listFiles(scanRoot)) {
    const text = fs.readFileSync(filePath, "utf8");
    if (hasInvalidTextChars(text)) {
      invalidTextFiles.push(path.relative(projectRoot, filePath).replaceAll("\\", "/"));
    }
  }
  if (invalidTextFiles.length > 0) {
    failures.push(
      `Found possible encoding corruption in ${invalidTextFiles.length} file(s): ${invalidTextFiles.join(", ")}`,
    );
  }

  for (const relPath of packageUiFiles) {
    const fullPath = path.join(projectRoot, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const text = fs.readFileSync(fullPath, "utf8");

    if (/[\u0E00-\u0E7F]/u.test(text)) {
      failures.push(`Package UI file contains hardcoded Thai text. Use i18n keys instead: ${relPath}`);
    }
    if (!text.includes("t('packages.") && !text.includes('t("packages.')) {
      failures.push(`Package UI file does not appear to use package i18n keys: ${relPath}`);
    }
  }

  if (failures.length > 0) {
    console.error("i18n check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("i18n check passed:");
  console.log("- TH/EN key sets are aligned");
  console.log("- No invalid encoding characters found in source files");
}

run();
