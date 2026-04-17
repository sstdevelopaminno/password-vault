import { APP_VERSION } from "@/lib/app-version";

export const UPDATE_DETAILS_PATH = "/settings/notifications/update-notes";

export function getReleaseUpdateTitle(locale: string) {
  return locale === "th" ? "อัปเดตระบบเวอร์ชันใหม่" : "New system update";
}

export function getReleaseUpdateMessage(locale: string) {
  return locale === "th"
    ? `อัปเดตเป็นเวอร์ชัน ${APP_VERSION} แล้ว เพื่อเพิ่มความเสถียรบนมือถือและ PWA`
    : `Updated to version ${APP_VERSION} for better mobile and PWA stability.`;
}

export function getReleaseUpdateDetail(locale: string) {
  return locale === "th"
    ? "ปรับระบบอัปเดต/แคช ลดปัญหา UI แถบล่างบนมือถือ เพิ่มความแม่นยำ i18n ไทย-อังกฤษ และยกระดับความเสถียรการล็อกอิน"
    : "Improved update/cache flow, fixed mobile bottom-bar UI issues, hardened Thai/English i18n, and stabilized login behavior.";
}

export function getReleaseHighlights(locale: string) {
  if (locale === "th") {
    return [
      "ยกระดับความเสถียรการอัปเดตเวอร์ชันใหม่ พร้อมเคลียร์ runtime cache เก่าอย่างปลอดภัย",
      "แก้พฤติกรรมแถบล่างบนมือถือให้ไม่จม/เลื่อนผิดจังหวะ และปรับการใช้งานจอมือถือให้คงที่",
      "เพิ่มความเสถียรของการล็อกอินและการรีเช็ก runtime หลังอัปเดต",
      "ตรวจความถูกต้องภาษาไทย/อังกฤษ และลดความเสี่ยงข้อความเพี้ยนในจุดสำคัญ",
      "เพิ่มหน้าอธิบายการอัปเดต พร้อมลิงก์จากการแจ้งเตือนให้กดเข้าดูรายละเอียดได้ทันที",
    ];
  }

  return [
    "Improved runtime update stability with safe stale-cache invalidation.",
    "Fixed mobile bottom-bar behavior and improved viewport consistency.",
    "Hardened login stability and runtime re-check flow after updates.",
    "Improved Thai/English i18n consistency in key user paths.",
    "Added a dedicated update-details page linked directly from notifications.",
  ];
}
