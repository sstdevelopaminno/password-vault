"use client";

import Link from "next/link";
import { Bell, ChevronLeft } from "lucide-react";
import { useHeadsUpNotifications } from "@/components/notifications/heads-up-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";
import {
  UPDATE_DETAILS_PATH,
  getReleaseUpdateDetail,
  getReleaseUpdateMessage,
  getReleaseUpdateTitle,
} from "@/lib/release-update";

function ToggleRow(props: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onToggle}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left"
      aria-pressed={props.enabled}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-800">{props.label}</span>
        <span className="block text-xs text-slate-500">{props.description}</span>
      </span>
      <span
        className={
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition " +
          (props.enabled ? "bg-blue-600" : "bg-slate-300")
        }
      >
        <span
          className={
            "inline-block h-5 w-5 transform rounded-full bg-white transition " +
            (props.enabled ? "translate-x-5" : "translate-x-1")
          }
        />
      </span>
    </button>
  );
}

export default function NotificationSettingsPage() {
  const { locale } = useI18n();
  const { showToast } = useToast();
  const {
    settings,
    updateSettings,
    notify,
    browserPermission,
    permissionSource,
    requestBrowserPermission,
    openSystemNotificationSettings,
  } = useHeadsUpNotifications();

  const isThai = locale === "th";

  const permissionLabel =
    browserPermission === "unsupported"
      ? isThai
        ? "อุปกรณ์นี้ไม่รองรับการแจ้งเตือน"
        : "Notifications are not supported on this device."
      : browserPermission === "granted"
        ? isThai
          ? "อนุญาตแล้ว"
          : "Granted"
        : browserPermission === "denied"
          ? isThai
            ? "ถูกบล็อก"
            : "Blocked"
          : isThai
            ? "ยังไม่ได้อนุญาต"
            : "Not granted yet";

  const permissionActionLabel =
    browserPermission === "granted"
      ? isThai
        ? "อนุญาตแล้ว"
        : "Already granted"
      : browserPermission === "denied" && permissionSource === "native"
        ? isThai
          ? "เปิดหน้าตั้งค่าระบบ"
          : "Open system settings"
        : isThai
          ? "ขอสิทธิ์แจ้งเตือน"
          : "Request permission";

  async function handlePermissionAction() {
    if (browserPermission === "unsupported") return;

    if (browserPermission === "denied" && permissionSource === "native") {
      const opened = await openSystemNotificationSettings();
      showToast(
        opened
          ? isThai
            ? "เปิดหน้าตั้งค่าระบบแล้ว กรุณาอนุญาตการแจ้งเตือน"
            : "System settings opened. Please allow notifications."
          : isThai
            ? "ไม่สามารถเปิดหน้าตั้งค่าระบบได้"
            : "Unable to open system settings.",
        opened ? "success" : "error",
      );
      return;
    }

    const result = await requestBrowserPermission();
    if (result === "granted") {
      showToast(isThai ? "อนุญาตการแจ้งเตือนแล้ว" : "Notification permission granted.", "success");
      return;
    }
    if (result === "denied") {
      showToast(
        permissionSource === "browser"
          ? isThai
            ? "กรุณาเปิดสิทธิ์แจ้งเตือนจากการตั้งค่าเว็บไซต์ในเบราว์เซอร์"
            : "Please enable notifications from browser site settings."
          : isThai
            ? "กรุณาอนุญาตสิทธิ์แจ้งเตือนในหน้าตั้งค่าระบบ"
            : "Please allow notifications in system settings.",
        "error",
      );
    }
  }

  return (
    <section className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">
          {isThai ? "การแจ้งเตือน" : "Notification Settings"}
        </h1>
      </div>

      <Link
        href={UPDATE_DETAILS_PATH}
        className="flex items-center justify-between rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 transition hover:bg-blue-100"
      >
        <span>{isThai ? "ดูรายละเอียดอัปเดตล่าสุด" : "View latest update details"}</span>
        <ChevronLeft className="h-4 w-4 rotate-180" />
      </Link>

      <Card className="space-y-3">
        <ToggleRow
          label={isThai ? "อนุญาตการแจ้งเตือน" : "Allow notifications"}
          description={isThai ? "ปิดเพื่อหยุดทุกการแจ้งเตือนของแอป" : "Turn off to stop all app notifications."}
          enabled={settings.enabled}
          onToggle={() => updateSettings({ enabled: !settings.enabled })}
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold text-slate-800">
            {isThai ? "สิทธิ์แจ้งเตือนของระบบ" : "System notification permission"}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {permissionSource === "native"
              ? isThai
                ? "โหมด Native (Android APK)"
                : "Native runtime (Android APK)"
              : isThai
                ? "โหมด Browser/Web Push"
                : "Browser/Web Push runtime"}
          </p>
          <p className="mt-1 text-xs text-slate-500">{permissionLabel}</p>
          <Button
            className="mt-3 w-full"
            variant="secondary"
            onClick={() => void handlePermissionAction()}
            disabled={browserPermission === "unsupported" || browserPermission === "granted"}
          >
            {permissionActionLabel}
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">
          {isThai ? "รูปแบบการแจ้งเตือน" : "Notification behavior"}
        </h2>

        <ToggleRow
          label={isThai ? "Heads-up Popup" : "Heads-up popup"}
          description={isThai ? "กล่องแจ้งเตือนลอยบนหน้าจอขณะใช้งาน" : "Floating popup over current screen."}
          enabled={settings.popup}
          onToggle={() => updateSettings({ popup: !settings.popup })}
        />

        <ToggleRow
          label={isThai ? "เสียงแจ้งเตือน" : "Notification sound"}
          description={isThai ? "เล่นเสียงเมื่อมีแจ้งเตือนใหม่" : "Play sound for new notifications."}
          enabled={settings.sound}
          onToggle={() => updateSettings({ sound: !settings.sound })}
        />

        <ToggleRow
          label={isThai ? "การสั่น" : "Vibration"}
          description={isThai ? "สั่นเมื่อมีแจ้งเตือนสำคัญ" : "Vibrate on important alerts."}
          enabled={settings.vibrate}
          onToggle={() => updateSettings({ vibrate: !settings.vibrate })}
        />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">
          {isThai ? "ช่องทางแสดงผล" : "Display channels"}
        </h2>

        <ToggleRow
          label={isThai ? "Notification Tray" : "Notification tray"}
          description={isThai ? "แสดงในแถบแจ้งเตือนของระบบ" : "Show in OS notification tray."}
          enabled={settings.tray}
          onToggle={() => updateSettings({ tray: !settings.tray })}
        />

        <ToggleRow
          label={isThai ? "Lock Screen" : "Lock screen"}
          description={isThai ? "แสดงบนหน้าจอล็อก (ถ้าระบบรองรับ)" : "Show on lock screen when supported."}
          enabled={settings.lockScreen}
          onToggle={() => updateSettings({ lockScreen: !settings.lockScreen })}
        />

        <ToggleRow
          label={isThai ? "Notification Badge" : "Notification badge"}
          description={isThai ? "แสดงจุด/ตัวเลขบนไอคอนแอป" : "Show app icon dot/badge."}
          enabled={settings.badge}
          onToggle={() => updateSettings({ badge: !settings.badge })}
        />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">
          {isThai ? "หมวดหมู่การแจ้งเตือน" : "Notification categories"}
        </h2>

        <ToggleRow
          label={isThai ? "ระบบอัปเดต" : "System update"}
          description={isThai ? "เวอร์ชันใหม่และอัปเดตระบบ" : "Version and update alerts."}
          enabled={settings.allowSystem}
          onToggle={() => updateSettings({ allowSystem: !settings.allowSystem })}
        />

        <ToggleRow
          label={isThai ? "ความปลอดภัย" : "Security alerts"}
          description={isThai ? "การเตือนพฤติกรรมเสี่ยงหรือผิดปกติ" : "Attack/suspicious activity alerts."}
          enabled={settings.allowSecurity}
          onToggle={() => updateSettings({ allowSecurity: !settings.allowSecurity })}
        />

        <ToggleRow
          label={isThai ? "การยืนยันตัวตน" : "Authentication"}
          description={isThai ? "เช่น เข้าสู่ระบบสำเร็จ" : "For example login success."}
          enabled={settings.allowAuth}
          onToggle={() => updateSettings({ allowAuth: !settings.allowAuth })}
        />

        <ToggleRow
          label={isThai ? "กิจกรรมคลังรหัส" : "Vault activity"}
          description={isThai ? "เช่น คัดลอกรหัสผ่านหรือเข้าถึงข้อมูลสำคัญ" : "For copied secrets and sensitive actions."}
          enabled={settings.allowVault}
          onToggle={() => updateSettings({ allowVault: !settings.allowVault })}
        />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">
          {isThai ? "ทดสอบการแจ้งเตือน" : "Test notifications"}
        </h2>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            onClick={() =>
              notify({
                kind: "system",
                title: getReleaseUpdateTitle(locale),
                message: getReleaseUpdateMessage(locale),
                details: getReleaseUpdateDetail(locale),
                href: UPDATE_DETAILS_PATH,
                alsoSystem: true,
              })
            }
          >
            <Bell className="mr-1.5 h-4 w-4" />
            {isThai ? "ทดสอบระบบ" : "Test system"}
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              notify({
                kind: "security",
                title: isThai ? "ตรวจพบการพยายามโจมตี" : "Attack attempt detected",
                message: isThai
                  ? "พบการพยายามเข้าสู่ระบบผิดปกติ ระบบจำกัดการเข้าถึงชั่วคราว"
                  : "Multiple rapid sign-in attempts detected. Access was rate-limited.",
                details: isThai
                  ? "หากไม่ใช่คุณ แนะนำให้เปลี่ยนรหัสผ่านทันที"
                  : "Change password immediately if this wasn't you.",
                alsoSystem: true,
              })
            }
          >
            {isThai ? "ทดสอบความปลอดภัย" : "Test security"}
          </Button>
        </div>
      </Card>
    </section>
  );
}
