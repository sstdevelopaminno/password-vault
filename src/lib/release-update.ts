import { APP_VERSION } from "@/lib/app-version";

export const UPDATE_DETAILS_PATH = "/settings/notifications/update-notes";
export const RELEASE_NOTES_READ_VERSION_KEY = "pv_release_notes_read_version";
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
    version: "V16.6.26",
    releasedOn: "2026-04-23",
    titleTh: "กู้คืนฟีเจอร์เอกสารใบเสร็จ/แจ้งหนี้ และเพิ่มการนำเข้าจากโน้ต/OCR",
    titleEn: "Restored Billing Document Features with Notes/OCR Import",
    highlightsTh: [
      "กู้คืนปุ่มสร้างเอกสารและฟอร์มใบเสร็จ/แจ้งหนี้ที่หายไปหลังอัปเดตเวอร์ชันก่อนหน้า",
      "เพิ่มการดึงข้อความจากเมนูโน้ตเพื่อแปลงเป็นรายการสินค้า/บริการได้ทันที",
      "เพิ่มการสแกนข้อความจากรูปภาพ (OCR) พร้อมพรีวิวก่อนนำเข้าเอกสาร",
      "รองรับการเปิดดูรายละเอียด แก้ไข ลบ และพรีวิวเอกสารที่บันทึกไว้ครบทุกรายการ",
      "ปล่อยรอบเว็บและ APK ให้เป็นเวอร์ชันเดียวกัน พร้อมคิวแจ้งเตือนอัปเดตผู้ใช้งาน",
    ],
    highlightsEn: [
      "Restored missing create-document flow and billing form behavior from the prior release.",
      "Added Notes-to-line-items import to convert note text into bill items quickly.",
      "Added OCR image scan with preview before inserting into billing documents.",
      "Kept saved-document actions complete: detail, edit, delete, and preview.",
      "Released synchronized web/APK versioning with system update notification readiness.",
    ],
  },
  {
    version: "V16.6.25",
    releasedOn: "2026-04-23",
    titleTh: "อัปเดต APK เวอร์ชันล่าสุด พร้อมเสริม i18n และเสถียรภาพระบบ",
    titleEn: "Latest APK Release with i18n and Stability Improvements",
    highlightsTh: [
      "อัปเดตแอปเป็นเวอร์ชัน 16.6.25 พร้อมแพ็กเกจ APK ใหม่สำหรับ Android",
      "ตรวจสอบความถูกต้องของข้อความไทยและความสอดคล้อง i18n ไทย/อังกฤษ",
      "ปรับปรุงหน้าแจ้งเตือนอัปเดตให้แสดงประวัติเวอร์ชันได้ถูกต้อง",
      "ซิงก์การปล่อยเวอร์ชันเว็บและ APK ให้รองรับการอัปเดตจากผู้ใช้ปลายทาง",
    ],
    highlightsEn: [
      "Published Android APK version 16.6.25 for the latest app update.",
      "Validated Thai text quality and TH/EN i18n consistency.",
      "Fixed update-notes version rendering for accurate release history.",
      "Aligned web and APK release flow for end-user update readiness.",
    ],
  },
  {
    version: "V16.6.20",
    releasedOn: "2026-04-21",
    titleTh: "อัปเดต Android แบบแตะครั้งเดียว และปรับปรุง Vault Shield",
    titleEn: "APK/PWA Stability Round and Twice-Daily Install Reminder",
    highlightsTh: [
      "ปรับ flow อัปเดต Android แบบ one-tap: ดาวน์โหลดและเปิดตัวติดตั้งอัตโนมัติหลังดาวน์โหลดเสร็จ",
      "เพิ่มการตรวจสิทธิ์ติดตั้งจาก Unknown apps พร้อมพาไปหน้าตั้งค่าที่ต้องใช้",
      "ปรับเสถียรภาพหน้า Risk State และการประเมินจาก Vault Shield + Play Integrity",
      "ปรับปรุงความเสถียรเมนูศูนย์ซิงก์ออฟไลน์และการกู้คืนคิว",
      "แก้ปัญหาข้อความภาษาไทยเพี้ยนในจุดสำคัญของระบบ",
    ],
    highlightsEn: [
      "Added PWA install reminder policy for non-installed devices: max 2 prompts per day.",
      "Added reminder spacing control to avoid noisy repeated prompts.",
      "Confirmed install reminder flow does not affect 6-digit security PIN logic.",
      "Bumped Android/APK release to 16.6.20 (versionCode 16620).",
      "Kept APK update popup flow active for Android runtime update/install guidance.",
    ],
  },
  {
    version: "V16.6.8",
    releasedOn: "2026-04-17",
    titleTh: "เพิ่มเสถียรภาพ Mobile/PWA และระบบอัปเดต",
    titleEn: "Mobile/PWA Stability and Update Reliability",
    highlightsTh: [
      "ปรับความเสถียรระบบอัปเดตเวอร์ชัน พร้อมเคลียร์ stale cache แบบปลอดภัย",
      "ลดอาการหน้า UI กระตุกจาก cache เก่าบนมือถือ",
      "ปรับปรุงความครบถ้วนของ i18n ไทย/อังกฤษบนเส้นทางใช้งานหลัก",
    ],
    highlightsEn: [
      "Improved runtime update stability with safe stale-cache invalidation.",
      "Reduced stale-cache UI glitches on mobile.",
      "Improved Thai/English i18n consistency on key user paths.",
    ],
  },
  {
    version: "V16.6.7",
    releasedOn: "2026-04-10",
    titleTh: "พื้นฐาน PWA และรอบทดสอบ Mobile QA",
    titleEn: "PWA Baseline and Mobile QA Round",
    highlightsTh: [
      "ขยาย checklist ตรวจ runtime บนมือถือและพฤติกรรม cache",
      "เพิ่มการตรวจความพร้อมโหมดติดตั้งแอปบน Android/iOS",
      "เพิ่มข้อมูลวิเคราะห์ runtime เพื่อแก้ปัญหาได้เร็วขึ้น",
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
    ? "รอบนี้ปรับปรุงเสถียรภาพการอัปเดต Android, สิทธิ์ติดตั้ง APK, และความน่าเชื่อถือของ Vault Shield/Risk State ให้ทำงานต่อเนื่องมากขึ้น"
    : "This release improves APK/PWA stability and adds install reminders (max twice per day) for non-installed devices.";
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

export function getReleaseNotesVersion(version: string = APP_VERSION) {
  const normalized = String(version ?? "").trim();
  return normalized || APP_VERSION;
}

export function markReleaseNotesAsRead(version: string = APP_VERSION) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RELEASE_NOTES_READ_VERSION_KEY, getReleaseNotesVersion(version));
  } catch {
    // ignore storage failures
  }
}

export function hasReadReleaseNotes(version: string = APP_VERSION) {
  if (typeof window === "undefined") return true;
  try {
    const seenVersion = window.localStorage.getItem(RELEASE_NOTES_READ_VERSION_KEY);
    return seenVersion === getReleaseNotesVersion(version);
  } catch {
    return false;
  }
}

export function shouldShowReleaseNotesBadge(version: string = APP_VERSION) {
  return !hasReadReleaseNotes(version);
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
