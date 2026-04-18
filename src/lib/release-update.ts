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
    version: "V16.6.7",
    releasedOn: "2026-04-18",
    titleTh: "Android One-tap Update Installer และ Vault Shield Hardening",
    titleEn: "Android One-tap Update Installer and Vault Shield Hardening",
    highlightsTh: [
      "เพิ่ม flow อัปเดต Android แบบ one-tap: เริ่มดาวน์โหลดและเปิดตัวติดตั้งให้อัตโนมัติหลังดาวน์โหลดเสร็จ",
      "เพิ่มการตรวจสิทธิ์ Unknown apps และพาผู้ใช้ไปหน้าอนุญาตโดยตรงเมื่อยังไม่เปิดสิทธิ์",
      "ย้ำข้อจำกัดความปลอดภัยของ Android ว่ายังต้องกดยืนยันหน้าติดตั้งด้วยตัวผู้ใช้",
      "รักษาระบบ Vault Shield Risk Response และหน้าจอ Risk State ให้ทำงานร่วมกับการอัปเดตเวอร์ชันใหม่",
      "แก้ flow Supabase migration ให้รันจาก workdir ถูกต้องและยืนยันฐานข้อมูลล่าสุด",
    ],
    highlightsEn: [
      "Added one-tap Android update flow: start download and auto-open installer after completion.",
      "Added Unknown apps permission check with direct navigation to the required settings page.",
      "Clarified Android security constraint that user confirmation on installer screen is still required.",
      "Kept Vault Shield Risk Response and Risk State flow aligned with the new release process.",
      "Fixed Supabase migration workflow using the correct workdir and confirmed remote DB is up to date.",
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
    ? "รอบนี้อัปเดต: Android one-tap installer, ตรวจสิทธิ์ Unknown apps อัตโนมัติ, และเสริมความครบถ้วนของ Vault Shield + Risk State"
    : "This round includes: Android one-tap installer flow, automatic Unknown apps permission guidance, and hardened Vault Shield + Risk State.";
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
