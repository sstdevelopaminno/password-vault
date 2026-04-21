export type PhoneRiskLevel = 'safe' | 'suspicious' | 'high_risk';

export type PhoneContact = {
  id: string;
  name: string;
  number: string;
  label: 'family' | 'work' | 'service' | 'unknown';
};

export type RiskCheckResult = {
  number: string;
  normalizedNumber: string;
  level: PhoneRiskLevel;
  score: number;
  verdict: string;
  reasons: string[];
  recommendedAction: 'allow' | 'verify' | 'block';
  checkedAt: string;
};

const SAFE_NUMBERS = new Set(['021234567', '028881111', '0812229000']);
const HIGH_RISK_PATTERNS = [/^1900/, /^02?9{3,}/, /^09(?:0|7)0{2,}/];


function normalize(input: string) {
  return input.replace(/[^0-9]/g, '');
}

function hasSuspiciousRepeats(raw: string) {
  return /(\d)\1{4,}/.test(raw);
}

function toRisk(rawNumber: string): RiskCheckResult {
  const normalizedNumber = normalize(rawNumber);
  const reasons: string[] = [];
  let score = 5;

  if (!normalizedNumber) {
    return {
      number: rawNumber,
      normalizedNumber,
      level: 'suspicious',
      score: 50,
      verdict: 'หมายเลขไม่ถูกต้อง',
      reasons: ['รูปแบบหมายเลขไม่ถูกต้อง'],
      recommendedAction: 'verify',
      checkedAt: new Date().toISOString(),
    };
  }

  if (SAFE_NUMBERS.has(normalizedNumber)) {
    score = 8;
    reasons.push('อยู่ในรายชื่อปลอดภัย');
  }

  if (HIGH_RISK_PATTERNS.some((pattern) => pattern.test(normalizedNumber))) {
    score += 55;
    reasons.push('พบรูปแบบหมายเลขที่มักถูกรายงานหลอกลวง');
  }

  if (hasSuspiciousRepeats(normalizedNumber)) {
    score += 22;
    reasons.push('พบตัวเลขซ้ำผิดปกติ');
  }

  if (normalizedNumber.length < 9 || normalizedNumber.length > 11) {
    score += 18;
    reasons.push('ความยาวหมายเลขผิดปกติ');
  }

  if (!reasons.length) {
    reasons.push('ไม่พบสัญญาณผิดปกติจากกฎความเสี่ยง');
  }

  const cappedScore = Math.max(0, Math.min(100, score));
  if (cappedScore >= 70) {
    return {
      number: rawNumber,
      normalizedNumber,
      level: 'high_risk',
      score: cappedScore,
      verdict: 'เสี่ยงสูง',
      reasons,
      recommendedAction: 'block',
      checkedAt: new Date().toISOString(),
    };
  }

  if (cappedScore >= 35) {
    return {
      number: rawNumber,
      normalizedNumber,
      level: 'suspicious',
      score: cappedScore,
      verdict: 'น่าสงสัย',
      reasons,
      recommendedAction: 'verify',
      checkedAt: new Date().toISOString(),
    };
  }

  return {
    number: rawNumber,
    normalizedNumber,
    level: 'safe',
    score: cappedScore,
    verdict: 'ปลอดภัย',
    reasons,
    recommendedAction: 'allow',
    checkedAt: new Date().toISOString(),
  };
}

export function evaluatePhoneNumber(rawNumber: string) {
  return toRisk(rawNumber);
}

export function buildPhoneProfile(rawNumber: string) {
  const risk = toRisk(rawNumber);

  return {
    number: risk.number,
    normalizedNumber: risk.normalizedNumber,
    risk,
    trustScore: 100 - risk.score,
    reportCount: risk.level === 'high_risk' ? 19 : risk.level === 'suspicious' ? 7 : 1,
    callAttempts24h: risk.level === 'high_risk' ? 8 : risk.level === 'suspicious' ? 3 : 1,
    firstSeenAt: new Date(Date.now() - 86400000 * 11).toISOString(),
    lastSeenAt: new Date(Date.now() - 120000).toISOString(),
  };
}
