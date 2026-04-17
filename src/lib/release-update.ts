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
    version: "V16.6.3",
    releasedOn: "2026-04-18",
    titleTh: "อัปเดตเวอร์ชันใหม่และปล่อยระบบล่าสุด",
    titleEn: "New Version Rollout and Production Refresh",
    highlightsTh: [
      "ปรับเวอร์ชันแอปเป็น V16.6 พร้อมอัปเดต marker สำหรับ runtime ใหม่",
      "อัปเดตข้อความแจ้งเตือนให้ระบุชัดว่าในรอบนี้ปรับอะไรบ้าง",
      "อัปโค้ดขึ้น GitHub และปล่อยขึ้น Vercel Production",
      "รัน Supabase sync เพื่อตรวจให้ฐานข้อมูลอยู่สถานะล่าสุด",
      "คงหน้ารายละเอียด release notes เพื่อให้กดดูย้อนหลังได้จากเมนูแจ้งเตือน",
    ],
    highlightsEn: [
      "Updated app version to V16.6 with refreshed runtime marker flow.",
      "Expanded update notification text to clearly summarize this release scope.",
      "Published code to GitHub and deployed to Vercel production.",
      "Ran Supabase sync to confirm the database is up to date.",
      "Kept release-notes history accessible directly from notifications.",
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
    ? "รอบนี้อัปเดต: ปรับเวอร์ชันใหม่, อัปโค้ดขึ้น GitHub, ปล่อย Vercel, ตรวจ Supabase และปรับข้อความแจ้งเตือนให้อ่านง่ายขึ้น"
    : "This round includes: PIN + Face login toggle rollout, enroll/verify API + DB migration, GitHub publish, Vercel deploy, Supabase sync, and clearer update notification text.";
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
