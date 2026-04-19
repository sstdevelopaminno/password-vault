type UrlThreatSource = {
  provider: "heuristic" | "urlhaus" | "rdap" | "official-api";
  title: string;
  matched: boolean;
  severity: "low" | "medium" | "high";
  note?: string;
  url?: string;
};

export type UrlThreatScanResult = {
  inputUrl: string;
  normalizedUrl: string;
  hostname: string;
  checkedAt: string;
  score: number;
  level: "safe" | "suspicious" | "high_risk";
  verdict: string;
  recommendedAction: "open" | "verify" | "block";
  domainAgeDays: number | null;
  indicators: string[];
  sources: UrlThreatSource[];
};

const RISKY_HOST_KEYWORDS = [
  "secure",
  "verify",
  "wallet",
  "gift",
  "airdrop",
  "bonus",
  "signin",
  "login",
  "account",
  "bank",
  "update",
  "otp",
  "recover",
];

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function isIpHostname(hostname: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function parseConfiguredThreatSources() {
  const raw = String(process.env.URL_THREAT_SOURCE_URLS ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("https://") || entry.startsWith("http://"));
}

async function queryUrlhaus(url: string): Promise<UrlThreatSource> {
  const body = new URLSearchParams();
  body.set("url", url);

  try {
    const response = await fetch("https://urlhaus-api.abuse.ch/v1/url/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        provider: "urlhaus",
        title: "URLhaus malware URL feed",
        matched: false,
        severity: "low",
        note: `urlhaus_http_${response.status}`,
        url: "https://urlhaus.abuse.ch/",
      };
    }

    const payload = (await response.json().catch(() => ({}))) as {
      query_status?: string;
      url_status?: string;
      threat?: string;
      tags?: string[];
    };

    const matched = String(payload.query_status ?? "").toLowerCase() === "ok";
    const severity = matched ? "high" : "low";

    return {
      provider: "urlhaus",
      title: "URLhaus malware URL feed",
      matched,
      severity,
      note: matched
        ? `url_status=${String(payload.url_status ?? "unknown")}${payload.threat ? ` threat=${String(payload.threat)}` : ""}`
        : "not_listed",
      url: "https://urlhaus.abuse.ch/",
    };
  } catch {
    return {
      provider: "urlhaus",
      title: "URLhaus malware URL feed",
      matched: false,
      severity: "low",
      note: "urlhaus_unreachable",
      url: "https://urlhaus.abuse.ch/",
    };
  }
}

async function queryDomainAge(hostname: string): Promise<{ ageDays: number | null; source: UrlThreatSource }> {
  try {
    const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(hostname)}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        ageDays: null,
        source: {
          provider: "rdap",
          title: "RDAP domain registration",
          matched: false,
          severity: "low",
          note: `rdap_http_${response.status}`,
          url: "https://rdap.org/",
        },
      };
    }

    const payload = (await response.json().catch(() => ({}))) as {
      events?: Array<{ eventAction?: string; eventDate?: string }>;
    };

    const eventDate = (payload.events ?? [])
      .find((event) => String(event.eventAction ?? "").toLowerCase().includes("registration"))
      ?.eventDate;

    if (!eventDate) {
      return {
        ageDays: null,
        source: {
          provider: "rdap",
          title: "RDAP domain registration",
          matched: false,
          severity: "low",
          note: "registration_date_not_found",
          url: "https://rdap.org/",
        },
      };
    }

    const createdAt = new Date(eventDate).getTime();
    if (!Number.isFinite(createdAt) || createdAt <= 0) {
      return {
        ageDays: null,
        source: {
          provider: "rdap",
          title: "RDAP domain registration",
          matched: false,
          severity: "low",
          note: "registration_date_invalid",
          url: "https://rdap.org/",
        },
      };
    }

    const ageDays = Math.floor((Date.now() - createdAt) / (24 * 60 * 60 * 1000));
    const veryNew = ageDays >= 0 && ageDays < 30;
    const newish = ageDays >= 30 && ageDays < 180;

    return {
      ageDays,
      source: {
        provider: "rdap",
        title: "RDAP domain registration",
        matched: veryNew || newish,
        severity: veryNew ? "high" : newish ? "medium" : "low",
        note: `domain_age_days=${ageDays}`,
        url: "https://rdap.org/",
      },
    };
  } catch {
    return {
      ageDays: null,
      source: {
        provider: "rdap",
        title: "RDAP domain registration",
        matched: false,
        severity: "low",
        note: "rdap_unreachable",
        url: "https://rdap.org/",
      },
    };
  }
}

async function queryOfficialThreatSources(inputUrl: string, hostname: string): Promise<UrlThreatSource[]> {
  const endpoints = parseConfiguredThreatSources();
  if (!endpoints.length) return [];

  const token = String(process.env.URL_THREAT_SOURCE_TOKEN ?? "").trim();
  const outputs: UrlThreatSource[] = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url: inputUrl, domain: hostname }),
        cache: "no-store",
      });

      if (!response.ok) {
        outputs.push({
          provider: "official-api",
          title: `Official URL source: ${new URL(endpoint).hostname}`,
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
      const severityRaw = String(payload.severity ?? "").toLowerCase();
      const severity = severityRaw === "high" ? "high" : severityRaw === "medium" ? "medium" : "low";
      outputs.push({
        provider: "official-api",
        title: `Official URL source: ${new URL(endpoint).hostname}`,
        matched,
        severity,
        note: String(payload.note ?? payload.reason ?? "").trim() || (matched ? "matched" : "not_matched"),
        url: endpoint,
      });
    } catch {
      outputs.push({
        provider: "official-api",
        title: `Official URL source: ${endpoint}`,
        matched: false,
        severity: "low",
        note: "source_unreachable",
        url: endpoint,
      });
    }
  }

  return outputs;
}

export async function evaluateUrlThreat(inputUrl: string): Promise<UrlThreatScanResult> {
  const parsed = new URL(inputUrl);
  const hostname = parsed.hostname.toLowerCase();
  const indicators: string[] = [];
  const sources: UrlThreatSource[] = [];
  let score = 0;

  if (parsed.protocol !== "https:") {
    score += 16;
    indicators.push("ลิงก์ไม่ใช่ HTTPS");
  }

  if (isIpHostname(hostname)) {
    score += 24;
    indicators.push("ใช้ IP address แทนโดเมน");
  }

  if (hostname.includes("xn--")) {
    score += 18;
    indicators.push("โดเมนมี punycode (เสี่ยง homograph)");
  }

  const keywordHits = RISKY_HOST_KEYWORDS.filter((keyword) => hostname.includes(keyword) || parsed.pathname.toLowerCase().includes(keyword)).length;
  if (keywordHits > 0) {
    score += Math.min(22, keywordHits * 6);
    indicators.push(`พบคำเสี่ยงในโดเมน/พาธ ${keywordHits} รายการ`);
  }

  const dotCount = hostname.split(".").filter(Boolean).length;
  if (dotCount >= 4) {
    score += 10;
    indicators.push("โดเมนมี subdomain ซ้อนหลายชั้น");
  }

  if (inputUrl.length > 140) {
    score += 8;
    indicators.push("URL ยาวผิดปกติ");
  }

  const rdap = await queryDomainAge(hostname);
  sources.push(rdap.source);
  if (rdap.ageDays !== null && rdap.ageDays < 30) {
    score += 20;
    indicators.push(`โดเมนอายุใหม่มาก (${rdap.ageDays} วัน)`);
  } else if (rdap.ageDays !== null && rdap.ageDays < 180) {
    score += 10;
    indicators.push(`โดเมนอายุยังใหม่ (${rdap.ageDays} วัน)`);
  }

  const urlhaus = await queryUrlhaus(inputUrl);
  sources.push(urlhaus);
  if (urlhaus.matched) {
    score += 60;
    indicators.push("URL ติดฐานข้อมูลภัยคุกคาม URLhaus");
  }

  const officialSources = await queryOfficialThreatSources(inputUrl, hostname);
  sources.push(...officialSources);
  for (const source of officialSources) {
    if (!source.matched) continue;
    score += source.severity === "high" ? 30 : source.severity === "medium" ? 18 : 10;
    indicators.push(`พบสัญญาณจาก ${source.title}`);
  }

  const finalScore = clampScore(score);
  const level = finalScore >= 70 ? "high_risk" : finalScore >= 35 ? "suspicious" : "safe";
  const recommendedAction = level === "high_risk" ? "block" : level === "suspicious" ? "verify" : "open";
  const verdict = level === "high_risk" ? "เสี่ยงสูง" : level === "suspicious" ? "ควรตรวจเพิ่ม" : "ปลอดภัย";

  if (!indicators.length) {
    indicators.push("ไม่พบสัญญาณเสี่ยงหลักจากการสแกนเบื้องต้น");
  }

  return {
    inputUrl,
    normalizedUrl: parsed.toString(),
    hostname,
    checkedAt: new Date().toISOString(),
    score: finalScore,
    level,
    verdict,
    recommendedAction,
    domainAgeDays: rdap.ageDays,
    indicators,
    sources,
  };
}
