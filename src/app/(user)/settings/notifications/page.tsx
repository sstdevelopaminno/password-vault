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
        <span className="block text-app-body font-semibold text-slate-800">{props.label}</span>
        <span className="block text-app-caption text-slate-500">{props.description}</span>
      </span>
      <span
        className={
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition " +
          (props.enabled ? "bg-blue-600" : "bg-slate-300")
        }
      >
        <span
          className={
            "inline-block h-5 w-5 transform rounded-full bg-[#eef4ff] transition " +
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
        ? "เธญเธธเธเธเธฃเธ“เนเธเธตเนเนเธกเนเธฃเธญเธเธฃเธฑเธเธเธฒเธฃเนเธเนเธเน€เธ•เธทเธญเธ"
        : "Notifications are not supported on this device."
      : browserPermission === "granted"
        ? isThai
          ? "เธญเธเธธเธเธฒเธ•เนเธฅเนเธง"
          : "Granted"
        : browserPermission === "denied"
          ? isThai
            ? "เธ–เธนเธเธเธฅเนเธญเธ"
            : "Blocked"
          : isThai
            ? "เธขเธฑเธเนเธกเนเนเธ”เนเธญเธเธธเธเธฒเธ•"
            : "Not granted yet";

  const permissionActionLabel =
    browserPermission === "granted"
      ? isThai
        ? "เธญเธเธธเธเธฒเธ•เนเธฅเนเธง"
        : "Already granted"
      : browserPermission === "denied" && permissionSource === "native"
        ? isThai
          ? "เน€เธเธดเธ”เธซเธเนเธฒเธ•เธฑเนเธเธเนเธฒเธฃเธฐเธเธ"
          : "Open system settings"
        : isThai
          ? "เธเธญเธชเธดเธ—เธเธดเนเนเธเนเธเน€เธ•เธทเธญเธ"
          : "Request permission";

  async function handlePermissionAction() {
    if (browserPermission === "unsupported") return;

    if (browserPermission === "denied" && permissionSource === "native") {
      const opened = await openSystemNotificationSettings();
      showToast(
        opened
          ? isThai
            ? "เน€เธเธดเธ”เธซเธเนเธฒเธ•เธฑเนเธเธเนเธฒเธฃเธฐเธเธเนเธฅเนเธง เธเธฃเธธเธ“เธฒเธญเธเธธเธเธฒเธ•เธเธฒเธฃเนเธเนเธเน€เธ•เธทเธญเธ"
            : "System settings opened. Please allow notifications."
          : isThai
            ? "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เน€เธเธดเธ”เธซเธเนเธฒเธ•เธฑเนเธเธเนเธฒเธฃเธฐเธเธเนเธ”เน"
            : "Unable to open system settings.",
        opened ? "success" : "error",
      );
      return;
    }

    const result = await requestBrowserPermission();
    if (result === "granted") {
      showToast(isThai ? "เธญเธเธธเธเธฒเธ•เธเธฒเธฃเนเธเนเธเน€เธ•เธทเธญเธเนเธฅเนเธง" : "Notification permission granted.", "success");
      return;
    }
    if (result === "denied") {
      showToast(
        permissionSource === "browser"
          ? isThai
            ? "เธเธฃเธธเธ“เธฒเน€เธเธดเธ”เธชเธดเธ—เธเธดเนเนเธเนเธเน€เธ•เธทเธญเธเธเธฒเธเธเธฒเธฃเธ•เธฑเนเธเธเนเธฒเน€เธงเนเธเนเธเธ•เนเนเธเน€เธเธฃเธฒเธงเนเน€เธเธญเธฃเน"
            : "Please enable notifications from browser site settings."
          : isThai
            ? "เธเธฃเธธเธ“เธฒเธญเธเธธเธเธฒเธ•เธชเธดเธ—เธเธดเนเนเธเนเธเน€เธ•เธทเธญเธเนเธเธซเธเนเธฒเธ•เธฑเนเธเธเนเธฒเธฃเธฐเธเธ"
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
        <h1 className="text-app-h2 font-semibold text-slate-900">
          {isThai ? "เธเธฒเธฃเนเธเนเธเน€เธ•เธทเธญเธ" : "Notification Settings"}
        </h1>
      </div>

      <Link
        href={UPDATE_DETAILS_PATH}
        className="flex items-center justify-between rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-app-body font-semibold text-blue-800 transition hover:bg-blue-100"
      >
        <span>{isThai ? "เธ”เธนเธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เธญเธฑเธเน€เธ”เธ•เธฅเนเธฒเธชเธธเธ”" : "View latest update details"}</span>
        <ChevronLeft className="h-4 w-4 rotate-180" />
      </Link>

      <Card className="space-y-3">
        <ToggleRow
          label={isThai ? "เธญเธเธธเธเธฒเธ•เธเธฒเธฃเนเธเนเธเน€เธ•เธทเธญเธ" : "Allow notifications"}
          description={isThai ? "เธเธดเธ”เน€เธเธทเนเธญเธซเธขเธธเธ”เธ—เธธเธเธเธฒเธฃเนเธเนเธเน€เธ•เธทเธญเธเธเธญเธเนเธญเธ" : "Turn off to stop all app notifications."}
          enabled={settings.enabled}
          onToggle={() => updateSettings({ enabled: !settings.enabled })}
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-app-body font-semibold text-slate-800">
            {isThai ? "เธชเธดเธ—เธเธดเนเนเธเนเธเน€เธ•เธทเธญเธเธเธญเธเธฃเธฐเธเธ" : "System notification permission"}
          </p>
          <p className="mt-1 text-app-micro text-slate-400">
            {permissionSource === "native"
              ? isThai
                ? "เนเธซเธกเธ” Native (Android APK)"
                : "Native runtime (Android APK)"
              : isThai
                ? "เนเธซเธกเธ” Browser/Web Push"
                : "Browser/Web Push runtime"}
          </p>
          <p className="mt-1 text-app-caption text-slate-500">{permissionLabel}</p>
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
        <h2 className="text-app-body font-semibold text-slate-700">
          {isThai ? "เธฃเธนเธเนเธเธเธเธฒเธฃเนเธเนเธเน€เธ•เธทเธญเธ" : "Notification behavior"}
        </h2>

        <ToggleRow
          label={isThai ? "Heads-up Popup" : "Heads-up popup"}
          description={isThai ? "เธเธฅเนเธญเธเนเธเนเธเน€เธ•เธทเธญเธเธฅเธญเธขเธเธเธซเธเนเธฒเธเธญเธเธ“เธฐเนเธเนเธเธฒเธ" : "Floating popup over current screen."}
          enabled={settings.popup}
          onToggle={() => updateSettings({ popup: !settings.popup })}
        />

        <ToggleRow
          label={isThai ? "เน€เธชเธตเธขเธเนเธเนเธเน€เธ•เธทเธญเธ" : "Notification sound"}
          description={isThai ? "เน€เธฅเนเธเน€เธชเธตเธขเธเน€เธกเธทเนเธญเธกเธตเนเธเนเธเน€เธ•เธทเธญเธเนเธซเธกเน" : "Play sound for new notifications."}
          enabled={settings.sound}
          onToggle={() => updateSettings({ sound: !settings.sound })}
        />

        <ToggleRow
          label={isThai ? "เธเธฒเธฃเธชเธฑเนเธ" : "Vibration"}
          description={isThai ? "เธชเธฑเนเธเน€เธกเธทเนเธญเธกเธตเนเธเนเธเน€เธ•เธทเธญเธเธชเธณเธเธฑเธ" : "Vibrate on important alerts."}
          enabled={settings.vibrate}
          onToggle={() => updateSettings({ vibrate: !settings.vibrate })}
        />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-app-body font-semibold text-slate-700">
          {isThai ? "เธเนเธญเธเธ—เธฒเธเนเธชเธ”เธเธเธฅ" : "Display channels"}
        </h2>

        <ToggleRow
          label={isThai ? "Notification Tray" : "Notification tray"}
          description={isThai ? "เนเธชเธ”เธเนเธเนเธ–เธเนเธเนเธเน€เธ•เธทเธญเธเธเธญเธเธฃเธฐเธเธ" : "Show in OS notification tray."}
          enabled={settings.tray}
          onToggle={() => updateSettings({ tray: !settings.tray })}
        />

        <ToggleRow
          label={isThai ? "Lock Screen" : "Lock screen"}
          description={isThai ? "เนเธชเธ”เธเธเธเธซเธเนเธฒเธเธญเธฅเนเธญเธ (เธ–เนเธฒเธฃเธฐเธเธเธฃเธญเธเธฃเธฑเธ)" : "Show on lock screen when supported."}
          enabled={settings.lockScreen}
          onToggle={() => updateSettings({ lockScreen: !settings.lockScreen })}
        />

        <ToggleRow
          label={isThai ? "Notification Badge" : "Notification badge"}
          description={isThai ? "เนเธชเธ”เธเธเธธเธ”/เธ•เธฑเธงเน€เธฅเธเธเธเนเธญเธเธญเธเนเธญเธ" : "Show app icon dot/badge."}
          enabled={settings.badge}
          onToggle={() => updateSettings({ badge: !settings.badge })}
        />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-app-body font-semibold text-slate-700">
          {isThai ? "เธซเธกเธงเธ”เธซเธกเธนเนเธเธฒเธฃเนเธเนเธเน€เธ•เธทเธญเธ" : "Notification categories"}
        </h2>

        <ToggleRow
          label={isThai ? "เธฃเธฐเธเธเธญเธฑเธเน€เธ”เธ•" : "System update"}
          description={isThai ? "เน€เธงเธญเธฃเนเธเธฑเธเนเธซเธกเนเนเธฅเธฐเธญเธฑเธเน€เธ”เธ•เธฃเธฐเธเธ" : "Version and update alerts."}
          enabled={settings.allowSystem}
          onToggle={() => updateSettings({ allowSystem: !settings.allowSystem })}
        />

        <ToggleRow
          label={isThai ? "เธเธงเธฒเธกเธเธฅเธญเธ”เธ เธฑเธข" : "Security alerts"}
          description={isThai ? "เธเธฒเธฃเน€เธ•เธทเธญเธเธเธคเธ•เธดเธเธฃเธฃเธกเน€เธชเธตเนเธขเธเธซเธฃเธทเธญเธเธดเธ”เธเธเธ•เธด" : "Attack/suspicious activity alerts."}
          enabled={settings.allowSecurity}
          onToggle={() => updateSettings({ allowSecurity: !settings.allowSecurity })}
        />

        <ToggleRow
          label={isThai ? "เธเธฒเธฃเธขเธทเธเธขเธฑเธเธ•เธฑเธงเธ•เธ" : "Authentication"}
          description={isThai ? "เน€เธเนเธ เน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเธชเธณเน€เธฃเนเธ" : "For example login success."}
          enabled={settings.allowAuth}
          onToggle={() => updateSettings({ allowAuth: !settings.allowAuth })}
        />

        <ToggleRow
          label={isThai ? "เธเธดเธเธเธฃเธฃเธกเธเธฅเธฑเธเธฃเธซเธฑเธช" : "Vault activity"}
          description={isThai ? "เน€เธเนเธ เธเธฑเธ”เธฅเธญเธเธฃเธซเธฑเธชเธเนเธฒเธเธซเธฃเธทเธญเน€เธเนเธฒเธ–เธถเธเธเนเธญเธกเธนเธฅเธชเธณเธเธฑเธ" : "For copied secrets and sensitive actions."}
          enabled={settings.allowVault}
          onToggle={() => updateSettings({ allowVault: !settings.allowVault })}
        />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-app-body font-semibold text-slate-700">
          {isThai ? "เธ—เธ”เธชเธญเธเธเธฒเธฃเนเธเนเธเน€เธ•เธทเธญเธ" : "Test notifications"}
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
            {isThai ? "เธ—เธ”เธชเธญเธเธฃเธฐเธเธ" : "Test system"}
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              notify({
                kind: "security",
                title: isThai ? "เธ•เธฃเธงเธเธเธเธเธฒเธฃเธเธขเธฒเธขเธฒเธกเนเธเธกเธ•เธต" : "Attack attempt detected",
                message: isThai
                  ? "เธเธเธเธฒเธฃเธเธขเธฒเธขเธฒเธกเน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเธเธดเธ”เธเธเธ•เธด เธฃเธฐเธเธเธเธณเธเธฑเธ”เธเธฒเธฃเน€เธเนเธฒเธ–เธถเธเธเธฑเนเธงเธเธฃเธฒเธง"
                  : "Multiple rapid sign-in attempts detected. Access was rate-limited.",
                details: isThai
                  ? "เธซเธฒเธเนเธกเนเนเธเนเธเธธเธ“ เนเธเธฐเธเธณเนเธซเนเน€เธเธฅเธตเนเธขเธเธฃเธซเธฑเธชเธเนเธฒเธเธ—เธฑเธเธ—เธต"
                  : "Change password immediately if this wasn't you.",
                alsoSystem: true,
              })
            }
          >
            {isThai ? "เธ—เธ”เธชเธญเธเธเธงเธฒเธกเธเธฅเธญเธ”เธ เธฑเธข" : "Test security"}
          </Button>
        </div>
      </Card>
    </section>
  );
}


