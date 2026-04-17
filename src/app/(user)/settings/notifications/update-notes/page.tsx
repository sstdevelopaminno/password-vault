"use client";

import Link from "next/link";
import { ChevronLeft, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n/provider";
import { APP_VERSION } from "@/lib/app-version";
import { getReleaseHighlights, getReleaseUpdateTitle } from "@/lib/release-update";

export default function UpdateNotesPage() {
  const { locale } = useI18n();
  const highlights = getReleaseHighlights(locale);

  return (
    <section className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Link
          href="/settings/notifications"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">{getReleaseUpdateTitle(locale)}</h1>
      </div>

      <Card className="space-y-3">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3">
          <p className="text-sm font-semibold text-blue-900">
            {locale === "th" ? "เวอร์ชันปัจจุบัน" : "Current version"}: {APP_VERSION}
          </p>
          <p className="mt-1 text-xs text-blue-800">
            {locale === "th"
              ? "รอบนี้เน้นความเสถียร Mobile/PWA, ระบบแคช, i18n ไทย-อังกฤษ และการล็อกอิน"
              : "This release focuses on Mobile/PWA stability, cache reliability, Thai/English i18n, and login flow stability."}
          </p>
        </div>

        <div className="space-y-2">
          {highlights.map((item) => (
            <div key={item} className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <p className="text-sm leading-6 text-slate-700">{item}</p>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
