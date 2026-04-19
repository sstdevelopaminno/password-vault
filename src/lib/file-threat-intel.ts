type FileThreatSource = {
  provider: "heuristic" | "hash-blocklist" | "urlhaus" | "official-api";
  title: string;
  matched: boolean;
  severity: "low" | "medium" | "high";
  note?: string;
  url?: string;
};

export type FileThreatScanInput = {
  fileName: string;
  fileSize: number;
  sha256: string;
  isApk?: boolean;
};

export type FileThreatScanResult = {
  fileName: string;
  fileSize: number;
  sha256: string;
  checkedAt: string;
  score: number;
  level: "safe" | "suspicious" | "high_risk";
  verdict: string;
  recommendedAction: "allow" | "verify" | "block";
  indicators: string[];
  sources: FileThreatSource[];
  permissionInspection: "not_available" | "provided_by_native";
};

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function isValidSha256(value: string) {
  return /^[a-fA-F0-9]{64}$/.test(value);
}

function parseHashBlocklist() {
  const raw = String(process.env.APK_HASH_BLOCKLIST ?? "").trim();
  if (!raw) return new Map<string, string>();
  const map = new Map<string, string>();

  for (const entry of raw.split(",")) {
    const [hashPart, notePart] = entry.split(":");
    const hash = String(hashPart ?? "").trim().toLowerCase();
    const note = String(notePart ?? "matched_env_blocklist").trim();
    if (isValidSha256(hash)) {
      map.set(hash, note || "matched_env_blocklist");
    }
  }
  return map;
}

function parseConfiguredThreatSources() {
  const raw = String(process.env.FILE_THREAT_SOURCE_URLS ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("https://") || entry.startsWith("http://"));
}

async function queryUrlhausPayloadHash(sha256: string): Promise<FileThreatSource> {
  const body = new URLSearchParams();
  body.set("sha256_hash", sha256.toLowerCase());
  try {
    const response = await fetch("https://urlhaus-api.abuse.ch/v1/payload/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        provider: "urlhaus",
        title: "URLhaus payload hash feed",
        matched: false,
        severity: "low",
        note: `urlhaus_http_${response.status}`,
        url: "https://urlhaus.abuse.ch/",
      };
    }

    const payload = (await response.json().catch(() => ({}))) as {
      query_status?: string;
      signature?: string;
      file_type?: string;
    };
    const matched = String(payload.query_status ?? "").toLowerCase() === "ok";
    return {
      provider: "urlhaus",
      title: "URLhaus payload hash feed",
      matched,
      severity: matched ? "high" : "low",
      note: matched
        ? `signature=${String(payload.signature ?? "unknown")} file_type=${String(payload.file_type ?? "unknown")}`
        : "not_listed",
      url: "https://urlhaus.abuse.ch/",
    };
  } catch {
    return {
      provider: "urlhaus",
      title: "URLhaus payload hash feed",
      matched: false,
      severity: "low",
      note: "urlhaus_unreachable",
      url: "https://urlhaus.abuse.ch/",
    };
  }
}

async function queryOfficialFileSources(input: FileThreatScanInput): Promise<FileThreatSource[]> {
  const endpoints = parseConfiguredThreatSources();
  if (!endpoints.length) return [];
  const token = String(process.env.FILE_THREAT_SOURCE_TOKEN ?? "").trim();
  const outputs: FileThreatSource[] = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
        cache: "no-store",
      });

      if (!response.ok) {
        outputs.push({
          provider: "official-api",
          title: `Official file source: ${new URL(endpoint).hostname}`,
          matched: false,
          severity: "low",
          note: `source_http_${response.status}`,
          url: endpoint,
        });
        continue;
      }

      const payload = (await response.json().catch(() => ({}))) as {
        matched?: boolean;
        blacklisted?: boolean;
        severity?: string;
        note?: string;
        reason?: string;
      };
      const matched = Boolean(payload.matched ?? payload.blacklisted);
      const rawSeverity = String(payload.severity ?? "").toLowerCase();
      const severity = rawSeverity === "high" ? "high" : rawSeverity === "medium" ? "medium" : "low";
      outputs.push({
        provider: "official-api",
        title: `Official file source: ${new URL(endpoint).hostname}`,
        matched,
        severity,
        note: String(payload.note ?? payload.reason ?? "").trim() || (matched ? "matched" : "not_matched"),
        url: endpoint,
      });
    } catch {
      outputs.push({
        provider: "official-api",
        title: `Official file source: ${endpoint}`,
        matched: false,
        severity: "low",
        note: "source_unreachable",
        url: endpoint,
      });
    }
  }

  return outputs;
}

export async function evaluateFileThreat(input: FileThreatScanInput): Promise<FileThreatScanResult> {
  const fileName = String(input.fileName ?? "").trim();
  const fileSize = Number(input.fileSize ?? 0);
  const sha256 = String(input.sha256 ?? "").trim().toLowerCase();
  const isApk = Boolean(input.isApk ?? fileName.toLowerCase().endsWith(".apk"));

  const indicators: string[] = [];
  const sources: FileThreatSource[] = [];
  let score = 0;

  if (!isValidSha256(sha256)) {
    throw new Error("Invalid sha256");
  }

  if (fileSize <= 0) {
    throw new Error("Invalid file size");
  }

  const lowerName = fileName.toLowerCase();
  if (lowerName.includes("mod") || lowerName.includes("crack") || lowerName.includes("hack") || lowerName.includes("keygen")) {
    score += 25;
    indicators.push("ชื่อไฟล์มีคำเสี่ยง (mod/crack/hack/keygen)");
  }

  if (isApk && fileSize < 40_000) {
    score += 20;
    indicators.push("ไฟล์ APK มีขนาดเล็กผิดปกติ");
  } else if (isApk && fileSize > 300_000_000) {
    score += 10;
    indicators.push("ไฟล์ APK มีขนาดใหญ่มากผิดปกติ");
  }

  const blocklist = parseHashBlocklist();
  const blocklistReason = blocklist.get(sha256);
  sources.push({
    provider: "hash-blocklist",
    title: "Configured hash blacklist",
    matched: Boolean(blocklistReason),
    severity: blocklistReason ? "high" : "low",
    note: blocklistReason || "not_listed",
  });
  if (blocklistReason) {
    score += 65;
    indicators.push(`พบ hash ใน blacklist: ${blocklistReason}`);
  }

  const urlhaus = await queryUrlhausPayloadHash(sha256);
  sources.push(urlhaus);
  if (urlhaus.matched) {
    score += 60;
    indicators.push("พบ hash ใน URLhaus malware payload");
  }

  const officialSources = await queryOfficialFileSources({
    fileName,
    fileSize,
    sha256,
    isApk,
  });
  sources.push(...officialSources);
  for (const source of officialSources) {
    if (!source.matched) continue;
    score += source.severity === "high" ? 30 : source.severity === "medium" ? 18 : 10;
    indicators.push(`พบสัญญาณจาก ${source.title}`);
  }

  if (!indicators.length) {
    indicators.push("ไม่พบสัญญาณเสี่ยงหลักจากการสแกน hash และ heuristic");
  }

  const finalScore = clampScore(score);
  const level = finalScore >= 70 ? "high_risk" : finalScore >= 35 ? "suspicious" : "safe";
  const verdict = level === "high_risk" ? "เสี่ยงสูง" : level === "suspicious" ? "ควรตรวจเพิ่ม" : "ปลอดภัย";
  const recommendedAction = level === "high_risk" ? "block" : level === "suspicious" ? "verify" : "allow";

  return {
    fileName,
    fileSize,
    sha256,
    checkedAt: new Date().toISOString(),
    score: finalScore,
    level,
    verdict,
    recommendedAction,
    indicators,
    sources,
    permissionInspection: "not_available",
  };
}
