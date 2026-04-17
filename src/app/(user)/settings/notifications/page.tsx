"use client";

import Link from "next/link";
import { Bell, ChevronLeft, ShieldAlert, Smartphone, UserCheck, Vault, Volume2, VolumeX, Vibrate } from "lucide-react";
import { useHeadsUpNotifications } from "@/components/notifications/heads-up-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  const {
    settings,
    updateSettings,
    notify,
    browserPermission,
    requestBrowserPermission,
  } = useHeadsUpNotifications();

  const permissionLabel =
    browserPermission === "unsupported"
      ? locale === "th"
        ? "อุปกรณ์นี้ไม่รองรับ Browser Notification"
        : "Browser notifications are not supported on this device."
      : browserPermission === "granted"
        ? locale === "th"
          ? "อนุญาตแล้ว"
          : "Granted"
        : browserPermission === "denied"
          ? locale === "th"
            ? "ถูกบล็อก"
            : "Blocked"
          : locale === "th"
            ? "ยังไม่อนุญาต"
            : "Not granted yet";

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
          {locale === "th" ? "การแจ้งเตือน" : "Notification Settings"}
        </h1>
      </div>

      <Link
        href={UPDATE_DETAILS_PATH}
        className="flex items-center justify-between rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 transition hover:bg-blue-100"
      >
        <span>{locale === "th" ? "ดูรายละเอียดอัปเดตระบบล่าสุด" : "View latest update details"}</span>
        <ChevronLeft className="h-4 w-4 rotate-180" />
      </Link>

      <Card className="space-y-3">
        <ToggleRow
          label={locale === "th" ? "อนุญาตการแจ้งเตือน" : "Allow notifications"}
          description={
            locale === "th"
              ? "ปิดเพื่อหยุดทุกการแจ้งเตือนของแอป"
              : "Turn off to stop all app notifications."
          }
          enabled={settings.enabled}
          onToggle={() => updateSettings({ enabled: !settings.enabled })}
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold text-slate-800">
            {locale === "th" ? "สิทธิ์แจ้งเตือนระบบ" : "System notification permission"}
          </p>
          <p className="mt-1 text-xs text-slate-500">{permissionLabel}</p>
          <Button
            className="mt-3 w-full"
            variant="secondary"
            onClick={() => void requestBrowserPermission()}
            disabled={browserPermission === "granted" || browserPermission === "unsupported"}
          >
            {locale === "th" ? "ขอสิทธิ์แจ้งเตือน" : "Request permission"}
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">
          {locale === "th" ? "รูปแบบการแจ้งเตือน" : "Notification behavior"}
        </h2>

        <ToggleRow
          label={locale === "th" ? "Heads-up Popup" : "Heads-up popup"}
          description={
            locale === "th"
              ? "เด้งซ้อนบนหน้าจอขณะกำลังใช้งาน"
              : "Floating popup over current screen."
          }
          enabled={settings.popup}
          onToggle={() => updateSettings({ popup: !settings.popup })}
        />

        <ToggleRow
          label={locale === "th" ? "เสียงแจ้งเตือน" : "Notification sound"}
          description={
            locale === "th"
              ? "เล่นเสียงเมื่อมีแจ้งเตือนใหม่"
              : "Play sound for new notifications."
          }
          enabled={settings.sound}
          onToggle={() => updateSettings({ sound: !settings.sound })}
        />

        <ToggleRow
          label={locale === "th" ? "การสั่น" : "Vibration"}
          description={
            locale === "th"
              ? "สั่นเมื่อมีแจ้งเตือนสำคัญ"
              : "Vibrate on important alerts."
          }
          enabled={settings.vibrate}
          onToggle={() => updateSettings({ vibrate: !settings.vibrate })}
        />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">
          {locale === "th" ? "ช่องทางแสดงผล" : "Display channels"}
        </h2>

        <ToggleRow
          label={locale === "th" ? "Notification Tray" : "Notification tray"}
          description={
            locale === "th"
              ? "แสดงบนแถบแจ้งเตือนของเครื่อง"
              : "Show in OS notification tray."
          }
          enabled={settings.tray}
          onToggle={() => updateSettings({ tray: !settings.tray })}
        />

        <ToggleRow
          label={locale === "th" ? "Lock Screen" : "Lock screen"}
          description={
            locale === "th"
              ? "แสดงบนหน้าจอล็อก (หากระบบรองรับ)"
              : "Show on lock screen when supported."
          }
          enabled={settings.lockScreen}
          onToggle={() => updateSettings({ lockScreen: !settings.lockScreen })}
        />

        <ToggleRow
          label={locale === "th" ? "Notification Badge" : "Notification badge"}
          description={
            locale === "th"
              ? "แสดงจุด/ตัวเลขบนไอคอนแอป"
              : "Show app icon dot/badge."
          }
          enabled={settings.badge}
          onToggle={() => updateSettings({ badge: !settings.badge })}
        />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">
          {locale === "th" ? "หมวดหมู่การแจ้งเตือน" : "Notification categories"}
        </h2>

        <ToggleRow
          label={locale === "th" ? "ระบบอัปเดต" : "System update"}
          description={locale === "th" ? "เวอร์ชันใหม่ / ปรับปรุงระบบ" : "Version and update alerts."}
          enabled={settings.allowSystem}
          onToggle={() => updateSettings({ allowSystem: !settings.allowSystem })}
        />

        <ToggleRow
          label={locale === "th" ? "ความปลอดภัย" : "Security alerts"}
          description={
            locale === "th"
              ? "การโจมตี, ล็อกอินผิดปกติ, ความเสี่ยง"
              : "Attack/suspicious activity alerts."
          }
          enabled={settings.allowSecurity}
          onToggle={() => updateSettings({ allowSecurity: !settings.allowSecurity })}
        />

        <ToggleRow
          label={locale === "th" ? "ยืนยันตัวตน" : "Authentication"}
          description={
            locale === "th"
              ? "เช่น เข้าสู่ระบบสำเร็จ"
              : "For example login success."
          }
          enabled={settings.allowAuth}
          onToggle={() => updateSettings({ allowAuth: !settings.allowAuth })}
        />

        <ToggleRow
          label={locale === "th" ? "ข้อมูลคลังรหัส" : "Vault activity"}
          description={
            locale === "th"
              ? "เช่น คัดลอกรหัสผ่าน/ดูข้อมูลลับ"
              : "For copied secrets and sensitive actions."
          }
          enabled={settings.allowVault}
          onToggle={() => updateSettings({ allowVault: !settings.allowVault })}
        />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">
          {locale === "th" ? "ทดสอบแจ้งเตือน" : "Test notifications"}
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
            {locale === "th" ? "ทดสอบระบบ" : "Test system"}
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              notify({
                kind: "security",
                title: locale === "th" ? "ตรวจพบการพยายามโจมตี" : "Attack attempt detected",
                message: locale === "th" ? "พบการลองรหัสผ่านซ้ำหลายครั้ง ระบบจำกัดการเข้าชั่วคราว" : "Multiple rapid sign-in attempts detected. Access was rate-limited.",
                details: locale === "th" ? "ควรเปลี่ยนรหัสผ่านทันทีหากไม่ใช่คุณ" : "Change password immediately if this wasn't you.",
                href: "/forgot-password",
                persistent: true,
                alsoSystem: true,
              })
            }
          >
            <ShieldAlert className="mr-1.5 h-4 w-4" />
            {locale === "th" ? "ทดสอบความปลอดภัย" : "Test security"}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              notify({
                kind: "auth",
                title: locale === "th" ? "เข้าสู่ระบบสำเร็จ" : "Login successful",
                message: locale === "th" ? "ยินดีต้อนรับกลับ" : "Welcome back!",
                href: "/home",
                alsoSystem: true,
              })
            }
          >
            <UserCheck className="mr-1.5 h-4 w-4" />
            {locale === "th" ? "ทดสอบล็อกอิน" : "Test login"}
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              notify({
                kind: "vault",
                title: locale === "th" ? "มีการคัดลอกรหัสผ่าน" : "Password copied",
                message: locale === "th" ? "ตรวจพบการคัดลอกข้อมูลลับจากคลังรหัส" : "Sensitive data copied from vault.",
                href: "/vault",
                alsoSystem: true,
              })
            }
          >
            <Vault className="mr-1.5 h-4 w-4" />
            {locale === "th" ? "ทดสอบคลังรหัส" : "Test vault"}
          </Button>
        </div>
      </Card>

      <Card className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">
          {locale === "th" ? "สถานะการตั้งค่าปัจจุบัน" : "Current mode summary"}
        </h3>
        <div className="grid grid-cols-3 gap-2 text-xs text-slate-600">
          <div className="rounded-xl border border-slate-200 bg-white p-2 text-center">
            <Smartphone className="mx-auto mb-1 h-4 w-4" />
            {settings.popup ? (locale === "th" ? "Heads-up เปิด" : "Heads-up ON") : (locale === "th" ? "Heads-up ปิด" : "Heads-up OFF")}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2 text-center">
            {settings.sound ? <Volume2 className="mx-auto mb-1 h-4 w-4" /> : <VolumeX className="mx-auto mb-1 h-4 w-4" />}
            {settings.sound ? (locale === "th" ? "เสียงเปิด" : "Sound ON") : (locale === "th" ? "เสียงปิด" : "Sound OFF")}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2 text-center">
            <Vibrate className="mx-auto mb-1 h-4 w-4" />
            {settings.vibrate ? (locale === "th" ? "สั่นเปิด" : "Vibrate ON") : (locale === "th" ? "สั่นปิด" : "Vibrate OFF")}
          </div>
        </div>
      </Card>
    </section>
  );
}
