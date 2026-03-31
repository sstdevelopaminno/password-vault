"use client";

import { useEffect } from "react";
import { HeadsUpNotificationProvider } from "@/components/notifications/heads-up-provider";
import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/i18n/provider";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // ignore register failure in dev
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return (
    <I18nProvider>
      <ToastProvider>
        <HeadsUpNotificationProvider>{children}</HeadsUpNotificationProvider>
      </ToastProvider>
    </I18nProvider>
  );
}
