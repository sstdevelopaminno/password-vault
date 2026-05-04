import { messages, type I18nKey, type Locale } from "@/i18n/messages";

export type PackagePlanId = "free_starter" | "free_pro_trial" | "lite" | "pro" | "business";
export type PackageCycle = "monthly" | "yearly";

export type PackagePlanConfig = {
  id: PackagePlanId;
  order: number;
  recommended?: boolean;
  isFree: boolean;
  trialDays: number | null;
  maxMembers: number;
  storageGb: number;
  monthlyPriceThb: number;
  yearlyPriceThb: number;
  nameKey: I18nKey;
  summaryKey: I18nKey;
  suitabilityKey: I18nKey;
  featureKeys: I18nKey[];
  limitKeys: I18nKey[];
};

export const PACKAGE_PLANS: PackagePlanConfig[] = [
  {
    id: "free_starter",
    order: 1,
    isFree: true,
    trialDays: null,
    maxMembers: 1,
    storageGb: 1,
    monthlyPriceThb: 0,
    yearlyPriceThb: 0,
    nameKey: "packages.planNames.freeStarter",
    summaryKey: "packages.planSummaries.freeStarter",
    suitabilityKey: "packages.planSuitability.freeStarter",
    featureKeys: [
      "packages.planFeatures.coreVault",
      "packages.planFeatures.basicScanner",
      "packages.planFeatures.localBackup",
    ],
    limitKeys: [
      "packages.planLimits.freeStarter.itemLimit",
      "packages.planLimits.freeStarter.fileLimit",
      "packages.planLimits.freeStarter.fileUploadLimit",
    ],
  },
  {
    id: "free_pro_trial",
    order: 2,
    isFree: true,
    trialDays: 14,
    maxMembers: 3,
    storageGb: 3,
    monthlyPriceThb: 0,
    yearlyPriceThb: 0,
    nameKey: "packages.planNames.freeProTrial",
    summaryKey: "packages.planSummaries.freeProTrial",
    suitabilityKey: "packages.planSuitability.freeProTrial",
    featureKeys: [
      "packages.planFeatures.proSharing",
      "packages.planFeatures.proExport",
      "packages.planFeatures.auditLog",
    ],
    limitKeys: [
      "packages.planLimits.freeProTrial.durationLimit",
      "packages.planLimits.freeProTrial.itemLimit",
      "packages.planLimits.freeProTrial.fileLimit",
    ],
  },
  {
    id: "lite",
    order: 3,
    isFree: false,
    trialDays: null,
    maxMembers: 1,
    storageGb: 10,
    monthlyPriceThb: 79,
    yearlyPriceThb: 790,
    nameKey: "packages.planNames.lite",
    summaryKey: "packages.planSummaries.lite",
    suitabilityKey: "packages.planSuitability.lite",
    featureKeys: [
      "packages.planFeatures.coreVault",
      "packages.planFeatures.basicExport",
      "packages.planFeatures.emailSupport",
    ],
    limitKeys: [
      "packages.planLimits.lite.itemLimit",
      "packages.planLimits.lite.fileLimit",
      "packages.planLimits.lite.fileUploadLimit",
    ],
  },
  {
    id: "pro",
    order: 4,
    recommended: true,
    isFree: false,
    trialDays: null,
    maxMembers: 10,
    storageGb: 30,
    monthlyPriceThb: 149,
    yearlyPriceThb: 1490,
    nameKey: "packages.planNames.pro",
    summaryKey: "packages.planSummaries.pro",
    suitabilityKey: "packages.planSuitability.pro",
    featureKeys: [
      "packages.planFeatures.teamSharing",
      "packages.planFeatures.backupRestore",
      "packages.planFeatures.auditLog",
    ],
    limitKeys: [
      "packages.planLimits.pro.itemLimit",
      "packages.planLimits.pro.fileLimit",
      "packages.planLimits.pro.fileUploadLimit",
    ],
  },
  {
    id: "business",
    order: 5,
    isFree: false,
    trialDays: null,
    maxMembers: 30,
    storageGb: 120,
    monthlyPriceThb: 349,
    yearlyPriceThb: 3490,
    nameKey: "packages.planNames.business",
    summaryKey: "packages.planSummaries.business",
    suitabilityKey: "packages.planSuitability.business",
    featureKeys: [
      "packages.planFeatures.advancedSecurity",
      "packages.planFeatures.prioritySupport",
      "packages.planFeatures.sla",
    ],
    limitKeys: [
      "packages.planLimits.business.itemLimit",
      "packages.planLimits.business.fileLimit",
      "packages.planLimits.business.fileUploadLimit",
    ],
  },
];

const PLAN_MAP = new Map(PACKAGE_PLANS.map((plan) => [plan.id, plan]));

export function getPlanConfig(planId: string) {
  return PLAN_MAP.get(planId as PackagePlanId) ?? null;
}

function readMessage(locale: Locale, key: I18nKey) {
  const segments = key.split(".");
  let current: unknown = messages[locale];
  for (const segment of segments) {
    if (!current || typeof current !== "object" || !(segment in current)) return key;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : key;
}

export function resolvePlanForLocale(locale: Locale, plan: PackagePlanConfig) {
  return {
    id: plan.id,
    order: plan.order,
    recommended: plan.recommended === true,
    isFree: plan.isFree,
    trialDays: plan.trialDays,
    maxMembers: plan.maxMembers,
    storageGb: plan.storageGb,
    monthlyPriceThb: plan.monthlyPriceThb,
    yearlyPriceThb: plan.yearlyPriceThb,
    name: readMessage(locale, plan.nameKey),
    summary: readMessage(locale, plan.summaryKey),
    suitability: readMessage(locale, plan.suitabilityKey),
    features: plan.featureKeys.map((key) => readMessage(locale, key)),
    limits: plan.limitKeys.map((key) => readMessage(locale, key)),
  };
}

export function formatBaht(locale: Locale, amount: number) {
  const effectiveLocale = locale === "th" ? "th-TH" : "en-US";
  return amount.toLocaleString(effectiveLocale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function normalizePromptPayTarget(raw: string) {
  return String(raw ?? "").replace(/[^\d]/g, "");
}

export function buildPromptPayQrUrl(rawTarget: string, amount: number) {
  const target = normalizePromptPayTarget(rawTarget);
  if (!target) return "";
  return `https://promptpay.io/${target}/${amount.toFixed(2)}.png`;
}

export function calcSavingsPercent(monthlyPrice: number, yearlyPrice: number) {
  if (monthlyPrice <= 0 || yearlyPrice <= 0) return 0;
  const yearlyFromMonthly = monthlyPrice * 12;
  if (yearlyFromMonthly <= yearlyPrice) return 0;
  return Math.round(((yearlyFromMonthly - yearlyPrice) / yearlyFromMonthly) * 100);
}

export function getCycleAmount(plan: PackagePlanConfig, cycle: PackageCycle) {
  return cycle === "yearly" ? plan.yearlyPriceThb : plan.monthlyPriceThb;
}

