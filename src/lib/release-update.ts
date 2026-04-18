import { APP_VERSION } from "@/lib/app-version";

export const UPDATE_DETAILS_PATH = "/settings/notifications/update-notes";
export const TWA_ASSETLINKS_ENV_PACKAGE_KEY = "ANDROID_TWA_PACKAGE_NAME";
export const TWA_ASSETLINKS_ENV_FINGERPRINTS_KEY = "ANDROID_TWA_SHA256_FINGERPRINTS";
export const DEFAULT_ANDROID_PACKAGE = "com.passwordvault.app";

type ReleaseLocale = "th" | "en";

type ReleaseEntry = {
  version: string;
  releasedOn: string;
  titleTh: string;
  titleEn: string;
  highlightsTh: string[];
  highlightsEn: string[];
};

const RELEASE_HISTORY: ReleaseEntry[] = [
  {
    version: "V16.6.6",
    releasedOn: "2026-04-18",
    titleTh: "Vault Shield Risk Response และ One-click Remediation",
    titleEn: "Vault Shield Risk Response and One-click Remediation",
    highlightsTh: [
      "ผูก Play Integrity จริงเข้ากับ risk engine และบันทึกผล verification ลง risk-state",
      "เพิ่มหน้า Settings > Risk State สำหรับตรวจ severity, policy actions และ Play Integrity",
      "เพิ่ม banner แจ้งเตือนบนหน้า Home เมื่อความเสี่ยงเป็น High/Critical",
      "เพิ่มปุ่ม remediation แบบ context-aware (Safe Mode, Re-auth, Review Sync) พร้อม One-click guidance",
      "ปรับข้อความแจ้งเตือนอัปเดตระบบให้สะท้อนฟีเจอร์ด้านความปลอดภัยรอบล่าสุด",
    ],
    highlightsEn: [
      "Integrated real Play Integrity verification into the risk engine and risk-state metadata.",
      "Added Settings > Risk State to inspect severity, policy actions, and Play Integrity details.",
      "Added Home risk banner for High/Critical risk conditions.",
      "Added context-aware remediation actions (Safe Mode, Re-auth, Review Sync) with one-click guidance.",
      "Updated system update messaging to reflect the latest security hardening release.",
    ],
  },
  {
    version: "21.14.18",
    releasedOn: "2026-04-17",
    titleTh: "เสถียรภาพ Mobile/PWA และระบบอัปเดต",
    titleEn: "Mobile/PWA Stability and Update Reliability",
    highlightsTh: [
      "ปรับความเสถียรระบบอัปเดตเวอร์ชันใหม่ พร้อมเคลียร์ runtime cache เก่าอย่างปลอดภัย",
      "แก้พฤติกรรมแถบล่างบนมือถือและลดอาการ UI กระตุกจาก cache เก่า",
      "เสริมเสถียรภาพการล็อกอินและการรีเช็ก runtime หลังอัปเดต",
      "ตรวจความถูกต้อง i18n ไทย-อังกฤษในจุดใช้งานหลัก",
      "เพิ่มหน้า release notes และลิงก์จากแจ้งเตือนเพื่อกดดูรายละเอียดอัปเดตได้ทันที",
    ],
    highlightsEn: [
      "Improved runtime update stability with safe stale-cache invalidation.",
      "Fixed mobile bottom-bar behavior and reduced stale-cache UI glitches.",
      "Hardened login flow and post-update runtime re-check reliability.",
      "Improved Thai/English i18n consistency on key user paths.",
      "Added a dedicated release-notes page linked directly from update notifications.",
    ],
  },
  {
    version: "20.13.17",
    releasedOn: "2026-04-10",
    titleTh: "รอบเสริมพื้นฐาน PWA และตรวจ QA มือถือ",
    titleEn: "PWA Baseline and Mobile QA Round",
    highlightsTh: [
      "ยกระดับ checklist ตรวจ runtime มือถือและพฤติกรรม cache",
      "เพิ่มการตรวจความพร้อมโหมดติดตั้งแอปบน Android/iOS",
      "ปรับการตรวจวัดและบันทึกสัญญาณ runtime เพื่อแก้ปัญหาได้เร็วขึ้น",
    ],
    highlightsEn: [
      "Expanded mobile runtime QA checklist and cache behavior checks.",
      "Improved install-readiness diagnostics for Android/iOS app modes.",
      "Enhanced runtime diagnostics collection for faster issue triage.",
    ],
  },
];

function asLocale(locale: string): ReleaseLocale {
  return locale === "th" ? "th" : "en";
}

function formatReleaseDate(releasedOn: string, locale: ReleaseLocale) {
  const date = new Date(`${releasedOn}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return releasedOn;
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function getReleaseUpdateTitle(locale: string) {
  return asLocale(locale) === "th" ? "อัปเดตระบบเวอร์ชันใหม่" : "New system update";
}

export function getReleaseUpdateMessage(locale: string) {
  return asLocale(locale) === "th"
    ? `อัปเดตระบบเป็นเวอร์ชัน ${APP_VERSION} เรียบร้อยแล้ว`
    : `System updated to version ${APP_VERSION}.`;
}

export function getReleaseUpdateDetail(locale: string) {
  return asLocale(locale) === "th"
    ? "รอบนี้อัปเดต: Vault Shield Risk Response, Play Integrity verification จริง, Home risk banner และ One-click remediation guidance"
    : "This round includes: Vault Shield Risk Response, real Play Integrity verification, Home risk banner, and one-click remediation guidance.";
}

export function getReleaseHighlights(locale: string) {
  const entry = RELEASE_HISTORY[0];
  return asLocale(locale) === "th" ? entry.highlightsTh : entry.highlightsEn;
}

export function getReleaseHistory(locale: string) {
  const lang = asLocale(locale);
  return RELEASE_HISTORY.map((entry) => ({
    version: entry.version,
    releasedOn: entry.releasedOn,
    releasedOnLabel: formatReleaseDate(entry.releasedOn, lang),
    title: lang === "th" ? entry.titleTh : entry.titleEn,
    highlights: lang === "th" ? entry.highlightsTh : entry.highlightsEn,
    isCurrent: entry.version === APP_VERSION,
  }));
}

export function getDefaultTwaAssetLinksPayload() {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: DEFAULT_ANDROID_PACKAGE,
        sha256_cert_fingerprints: [
          "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
        ],
      },
    },
  ];
}
