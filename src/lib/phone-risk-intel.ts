import { createAdminClient } from '@/lib/supabase/admin';
import { evaluatePhoneNumber, type PhoneRiskLevel } from '@/lib/phone-security';
import { fetchOfficialRiskSignals } from '@/lib/official-risk-sources';

type CommunityRow = {
  id: number;
  user_id: string;
  phone_number: string;
  normalized_number: string | null;
  action: 'block' | 'report';
  risk_level: PhoneRiskLevel;
  created_at: string;
};

export type PhoneRiskTelemetrySignals = {
  numberInContacts?: boolean;
  spamLikeCallPattern?: boolean;
  networkOrSimAnomaly?: boolean;
  frequentSimChanges?: boolean;
  abnormalSignalOrCellInfo?: boolean;
  riskyVoipOrRelayApps?: boolean;
  rootedOrTamperedOrSideloaded?: boolean;
  gatewayOrMassCallingBehavior?: boolean;
  suspiciousCallAttempts1h?: number;
  outboundCalls24h?: number;
  distinctCallees24h?: number;
};

export type RiskSource = {
  provider: 'supabase-community' | 'open-web' | 'police-web' | 'official-api';
  title: string;
  url?: string;
  snippet?: string;
  confidence: 'low' | 'medium' | 'high';
};

export type PhoneRiskIntelResult = {
  number: string;
  normalizedNumber: string;
  level: PhoneRiskLevel;
  score: number;
  verdict: string;
  reasons: string[];
  recommendedAction: 'allow' | 'verify' | 'block';
  checkedAt: string;
  riskSignals: PhoneRiskTelemetrySignals;
  intelligence: {
    communityReports: number;
    communityBlocks: number;
    uniqueReporters: number;
    webRiskMentions: number;
    policeMentions: number;
    officialSourceMatches: number;
    signalRiskScore: number;
    sources: RiskSource[];
  };
};

type EvaluateOptions = {
  includeWebSignals?: boolean;
  telemetrySignals?: PhoneRiskTelemetrySignals;
};

const RISK_WORDS = ['scam', 'fraud', 'spam', 'blacklist', 'robocall', 'phishing', 'มิจฉาชีพ', 'หลอกลวง', 'โกง', 'แบล็กลิสต์'];

const POLICE_HINTS = ['police.go.th', 'cyberpolice.go.th', 'interpol.int', 'europol.europa.eu'];

const SEARCH_QUERIES = (number: string) => [
  `"${number}" scam fraud spam`,
  `"${number}" มิจฉาชีพ หลอกลวง`,
  `site:police.go.th "${number}"`,
  `site:cyberpolice.go.th "${number}"`,
];

function normalizePhoneNumber(value: string) {
  return String(value ?? '').replace(/[^0-9]/g, '');
}

function clampScore(value: number) {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function clampInt(value: unknown, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toVerdict(level: PhoneRiskLevel) {
  if (level === 'high_risk') return 'เสี่ยงสูง';
  if (level === 'suspicious') return 'น่าสงสัย';
  return 'ปลอดภัย';
}

function toRecommendedAction(level: PhoneRiskLevel): 'allow' | 'verify' | 'block' {
  if (level === 'high_risk') return 'block';
  if (level === 'suspicious') return 'verify';
  return 'allow';
}

function scoreTelemetrySignals(
  input: PhoneRiskTelemetrySignals | undefined,
): { score: number; reasons: string[]; normalized: PhoneRiskTelemetrySignals } {
  const normalized: PhoneRiskTelemetrySignals = {
    numberInContacts: input?.numberInContacts,
    spamLikeCallPattern: Boolean(input?.spamLikeCallPattern),
    networkOrSimAnomaly: Boolean(input?.networkOrSimAnomaly),
    frequentSimChanges: Boolean(input?.frequentSimChanges),
    abnormalSignalOrCellInfo: Boolean(input?.abnormalSignalOrCellInfo),
    riskyVoipOrRelayApps: Boolean(input?.riskyVoipOrRelayApps),
    rootedOrTamperedOrSideloaded: Boolean(input?.rootedOrTamperedOrSideloaded),
    gatewayOrMassCallingBehavior: Boolean(input?.gatewayOrMassCallingBehavior),
    suspiciousCallAttempts1h: clampInt(input?.suspiciousCallAttempts1h ?? 0, 0, 500),
    outboundCalls24h: clampInt(input?.outboundCalls24h ?? 0, 0, 5000),
    distinctCallees24h: clampInt(input?.distinctCallees24h ?? 0, 0, 5000),
  };

  const reasons: string[] = [];
  let score = 0;

  if (normalized.numberInContacts === false) {
    score += 10;
    reasons.push('หมายเลขนี้ไม่อยู่ในรายชื่อผู้ติดต่อ');
  }
  if (normalized.spamLikeCallPattern) {
    score += 22;
    reasons.push('รูปแบบสายเข้าคล้ายสแปมหรือ robocall');
  }
  if (normalized.networkOrSimAnomaly) {
    score += 20;
    reasons.push('พบความผิดปกติจากเครือข่ายหรือข้อมูล SIM');
  }
  if (normalized.frequentSimChanges) {
    score += 24;
    reasons.push('พบการเปลี่ยน SIM บ่อยผิดปกติ');
  }
  if (normalized.abnormalSignalOrCellInfo) {
    score += 16;
    reasons.push('พบสัญญาณหรือ cell info ผิดปกติช่วงใช้งานเสี่ยง');
  }
  if (normalized.riskyVoipOrRelayApps) {
    score += 18;
    reasons.push('พบแอป VoIP/Call Relay ที่มีความเสี่ยง');
  }
  if (normalized.rootedOrTamperedOrSideloaded) {
    score += 28;
    reasons.push('ตรวจพบ root/tamper/sideload เพิ่มความเสี่ยงอุปกรณ์');
  }
  if (normalized.gatewayOrMassCallingBehavior) {
    score += 26;
    reasons.push('พฤติกรรมคล้ายอุปกรณ์ gateway หรือ mass-calling');
  }

  const suspiciousAttemptsScore = Math.min(16, Math.floor((normalized.suspiciousCallAttempts1h ?? 0) / 2));
  if (suspiciousAttemptsScore > 0) {
    score += suspiciousAttemptsScore;
    reasons.push(`มีความพยายามสายต้องสงสัยใน 1 ชั่วโมง (${normalized.suspiciousCallAttempts1h} ครั้ง)`);
  }

  const massCallVolume = Math.max(
    0,
    (normalized.outboundCalls24h ?? 0) - 25,
    (normalized.distinctCallees24h ?? 0) - 20,
  );
  const massCallScore = Math.min(14, Math.floor(massCallVolume / 5));
  if (massCallScore > 0) {
    score += massCallScore;
    reasons.push(
      `ปริมาณโทรออกสูงผิดปกติใน 24 ชั่วโมง (${normalized.outboundCalls24h} สาย, ปลายทาง ${normalized.distinctCallees24h} เบอร์)`,
    );
  }

  return {
    score: Math.min(55, score),
    reasons,
    normalized,
  };
}

async function searchOpenWeb(number: string) {
  const sources: RiskSource[] = [];
  let webRiskMentions = 0;
  let policeMentions = 0;

  for (const query of SEARCH_QUERIES(number)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; VaultShield/1.0; +https://password-vault-ivory.vercel.app)',
          'Accept-Language': 'th,en-US;q=0.9,en;q=0.8',
        },
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!response.ok) {
        continue;
      }

      const html = await response.text();
      const text = stripHtml(html).toLowerCase();
      const count = RISK_WORDS.reduce((total, keyword) => {
        const hit = text.split(keyword).length - 1;
        return total + Math.max(0, hit);
      }, 0);

      webRiskMentions += Math.min(8, count);

      const policeHits = POLICE_HINTS.reduce((total, domain) => {
        const hit = text.split(domain).length - 1;
        return total + Math.max(0, hit);
      }, 0);
      policeMentions += Math.min(4, policeHits);

      const topSnippets = stripHtml(html)
        .split('...')
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 20)
        .slice(0, 2);

      for (const snippet of topSnippets) {
        sources.push({
          provider: policeHits > 0 ? 'police-web' : 'open-web',
          title: `Web intelligence: ${query}`,
          snippet: snippet.slice(0, 220),
          confidence: policeHits > 0 ? 'high' : count > 0 ? 'medium' : 'low',
        });
      }
    } catch {
      // ignore source fetch failure and continue with remaining sources
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    webRiskMentions,
    policeMentions,
    sources,
  };
}

async function readCommunitySignals(normalizedNumber: string) {
  if (!normalizedNumber) {
    return {
      communityReports: 0,
      communityBlocks: 0,
      uniqueReporters: 0,
      sources: [] as RiskSource[],
      recentRows: [] as CommunityRow[],
    };
  }

  let rows: CommunityRow[] = [];
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin
      .from('phone_risk_actions')
      .select('id,user_id,phone_number,normalized_number,action,risk_level,created_at')
      .eq('normalized_number', normalizedNumber)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(400);

    if (!error) {
      rows = (data as CommunityRow[] | null) ?? [];
    } else if (String(error.message ?? '').toLowerCase().includes('normalized_number')) {
      const fallback = await admin
        .from('phone_risk_actions')
        .select('id,user_id,phone_number,action,risk_level,created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1200);

      rows = ((fallback.data ?? []) as Omit<CommunityRow, 'normalized_number'>[])
        .filter((row) => normalizePhoneNumber(row.phone_number) === normalizedNumber)
        .map((row) => ({ ...row, normalized_number: normalizedNumber }));
    }
  } catch {
    rows = [];
  }

  const reportRows = rows.filter((row) => row.action === 'report');
  const blockRows = rows.filter((row) => row.action === 'block');
  const uniqueUsers = new Set(rows.map((row) => String(row.user_id)));

  const sources: RiskSource[] = [];
  if (rows.length > 0) {
    sources.push({
      provider: 'supabase-community',
      title: 'Supabase community reports',
      snippet: `พบการรายงาน ${reportRows.length} ครั้ง และบล็อก ${blockRows.length} ครั้ง จากผู้ใช้ ${uniqueUsers.size} คน`,
      confidence: uniqueUsers.size >= 3 ? 'high' : 'medium',
    });
  }

  return {
    communityReports: reportRows.length,
    communityBlocks: blockRows.length,
    uniqueReporters: uniqueUsers.size,
    sources,
    recentRows: rows,
  };
}

export async function evaluatePhoneRiskWithIntel(
  rawNumber: string,
  options: EvaluateOptions = {},
): Promise<PhoneRiskIntelResult> {
  const base = evaluatePhoneNumber(rawNumber);
  const normalizedNumber = normalizePhoneNumber(rawNumber);

  const community = await readCommunitySignals(normalizedNumber);
  const web = options.includeWebSignals
    ? await searchOpenWeb(rawNumber)
    : { webRiskMentions: 0, policeMentions: 0, sources: [] as RiskSource[] };
  const officialSignals = options.includeWebSignals ? await fetchOfficialRiskSignals(rawNumber) : [];
  const officialMatches = officialSignals.filter((signal) => signal.matched).length;
  const officialRiskScore = officialSignals.reduce((score, signal) => {
    if (!signal.matched) return score;
    if (signal.severity === 'high') return score + 18;
    if (signal.severity === 'medium') return score + 12;
    return score + 8;
  }, 0);

  const communityRiskScore = Math.min(
    45,
    community.communityReports * 7 + community.communityBlocks * 9 + community.uniqueReporters * 6,
  );
  const webRiskScore = Math.min(25, web.webRiskMentions * 3);
  const policeRiskScore = Math.min(20, web.policeMentions * 7);
  const signalAssessment = scoreTelemetrySignals(options.telemetrySignals);

  const score = clampScore(
    base.score +
      communityRiskScore +
      webRiskScore +
      policeRiskScore +
      Math.min(30, officialRiskScore) +
      signalAssessment.score,
  );

  const level: PhoneRiskLevel = score >= 70 ? 'high_risk' : score >= 35 ? 'suspicious' : 'safe';
  const reasons = [...base.reasons];

  if (community.communityReports > 0 || community.communityBlocks > 0) {
    reasons.push(
      `ข้อมูลชุมชน Supabase: รายงาน ${community.communityReports} บล็อก ${community.communityBlocks} (ผู้รายงาน ${community.uniqueReporters})`,
    );
  }
  if (web.webRiskMentions > 0) {
    reasons.push(`พบคำเสี่ยงจากเว็บสาธารณะ ${web.webRiskMentions} สัญญาณ`);
  }
  if (web.policeMentions > 0) {
    reasons.push(`พบการอ้างอิงโดเมนหน่วยงานทางการ ${web.policeMentions} สัญญาณ`);
  }
  if (officialMatches > 0) {
    reasons.push(`พบการ match จากแหล่งข้อมูลทางการที่ตั้งค่าไว้ ${officialMatches} แหล่ง`);
  }
  if (signalAssessment.reasons.length > 0) {
    reasons.push(...signalAssessment.reasons);
  }

  const officialSources: RiskSource[] = officialSignals.map((signal) => ({
    provider: 'official-api',
    title: `Official source: ${signal.source}`,
    url: signal.url,
    snippet: signal.note,
    confidence: signal.severity === 'high' ? 'high' : signal.severity === 'medium' ? 'medium' : 'low',
  }));

  return {
    number: rawNumber,
    normalizedNumber,
    level,
    score,
    verdict: toVerdict(level),
    reasons,
    recommendedAction: toRecommendedAction(level),
    checkedAt: new Date().toISOString(),
    riskSignals: signalAssessment.normalized,
    intelligence: {
      communityReports: community.communityReports,
      communityBlocks: community.communityBlocks,
      uniqueReporters: community.uniqueReporters,
      webRiskMentions: web.webRiskMentions,
      policeMentions: web.policeMentions,
      officialSourceMatches: officialMatches,
      signalRiskScore: signalAssessment.score,
      sources: [...community.sources, ...web.sources, ...officialSources].slice(0, 8),
    },
  };
}

export async function listRiskAlertsWithIntel(limit = 30) {
  let rows: CommunityRow[] = [];
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin
      .from('phone_risk_actions')
      .select('id,user_id,phone_number,normalized_number,action,risk_level,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(600);

    if (!error) {
      rows = (data as CommunityRow[] | null) ?? [];
    } else if (String(error.message ?? '').toLowerCase().includes('normalized_number')) {
      const fallback = await admin
        .from('phone_risk_actions')
        .select('id,user_id,phone_number,action,risk_level,created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(600);
      rows = ((fallback.data ?? []) as Omit<CommunityRow, 'normalized_number'>[]).map((row) => ({
        ...row,
        normalized_number: normalizePhoneNumber(row.phone_number),
      }));
    }
  } catch {
    rows = [];
  }

  const grouped = new Map<
    string,
    {
      number: string;
      reports: number;
      blocks: number;
      latestAt: string;
      users: Set<string>;
    }
  >();

  for (const row of rows) {
    const normalized = row.normalized_number || normalizePhoneNumber(row.phone_number);
    if (!normalized) continue;
    const existing = grouped.get(normalized) ?? {
      number: row.phone_number || normalized,
      reports: 0,
      blocks: 0,
      latestAt: row.created_at,
      users: new Set<string>(),
    };
    if (row.action === 'report') existing.reports += 1;
    if (row.action === 'block') existing.blocks += 1;
    existing.users.add(String(row.user_id));
    if (new Date(row.created_at).getTime() > new Date(existing.latestAt).getTime()) {
      existing.latestAt = row.created_at;
      existing.number = row.phone_number || existing.number;
    }
    grouped.set(normalized, existing);
  }

  const alerts = Array.from(grouped.entries())
    .map(([normalized, value], index) => {
      const score = clampScore(value.reports * 8 + value.blocks * 10 + value.users.size * 6);
      const level: PhoneRiskLevel = score >= 70 ? 'high_risk' : score >= 35 ? 'suspicious' : 'safe';
      const message =
        level === 'high_risk'
          ? `ถูกรายงานหนัก (${value.reports} รายงาน / ${value.blocks} บล็อก)`
          : level === 'suspicious'
            ? `มีการรายงานในชุมชน (${value.reports} รายงาน)`
            : 'ยังไม่พบสัญญาณเสี่ยงใหม่';
      return {
        id: `ci-${index + 1}-${normalized}`,
        number: value.number || normalized,
        level,
        message,
        detectedAt: value.latestAt,
        reports: value.reports,
      };
    })
    .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
    .slice(0, limit);

  return alerts;
}

export function normalizePhoneForStorage(value: string) {
  return normalizePhoneNumber(value);
}
