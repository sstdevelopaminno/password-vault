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

export type PhoneAlert = {
  id: string;
  number: string;
  level: PhoneRiskLevel;
  message: string;
  detectedAt: string;
  reports: number;
};

const SAFE_NUMBERS = new Set(['021234567', '028881111', '0812229000']);
const HIGH_RISK_PATTERNS = [/^1900/, /^02?9{3,}/, /^09(?:0|7)0{2,}/];

export const PHONE_CONTACTS: PhoneContact[] = [
  { id: 'c1', name: 'แม่', number: '081-222-9000', label: 'family' },
  { id: 'c2', name: 'บริษัท A', number: '02-888-1111', label: 'work' },
  { id: 'c3', name: 'ร้านค้า', number: '093-441-7712', label: 'service' },
  { id: 'c4', name: 'ไม่ทราบชื่อ', number: '097-000-1111', label: 'unknown' },
];

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

export function listRiskAlerts() {
  const seedNumbers = ['097-000-1111', '091-998-7788', '02-123-4567'];
  return seedNumbers.map((number, index): PhoneAlert => {
    const risk = toRisk(number);
    return {
      id: `a${index + 1}`,
      number,
      level: risk.level,
      message:
        risk.level === 'high_risk'
          ? 'ตรวจพบพฤติกรรมหลอกลวงจากหลายผู้ใช้'
          : risk.level === 'suspicious'
          ? 'มีการรายงานต่อเนื่อง ควรตรวจสอบก่อนรับสาย'
          : 'ไม่พบความเสี่ยงใหม่ในช่วงล่าสุด',
      detectedAt: new Date(Date.now() - index * 900000).toISOString(),
      reports: risk.level === 'high_risk' ? 34 : risk.level === 'suspicious' ? 12 : 0,
    };
  });
}
