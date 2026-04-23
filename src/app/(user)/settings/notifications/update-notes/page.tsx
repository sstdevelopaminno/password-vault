"use client";

import Link from "next/link";
import { ChevronLeft, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n/provider";
import { APP_VERSION } from "@/lib/app-version";
import { getReleaseHistory, getReleaseUpdateTitle } from "@/lib/release-update";

export default function UpdateNotesPage() {
  const { locale } = useI18n();
  const releases = getReleaseHistory(locale);

  return (
    <section className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Link
          href="/settings/notifications"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-app-h2 font-semibold text-slate-900">{getReleaseUpdateTitle(locale)}</h1>
      </div>

      <Card className="space-y-3">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3">
          <p className="text-app-body font-semibold text-blue-900">
            {locale === "th" ? "เน€เธงเธญเธฃเนเธเธฑเธเธเธฑเธเธเธธเธเธฑเธ" : "Current version"}: {APP_VERSION}
          </p>
          <p className="mt-1 text-app-caption text-blue-800">
            {locale === "th"
              ? "เธซเธเนเธฒเธเธญเธเธตเนเธชเธฃเธธเธเธชเธฒเน€เธซเธ•เธธเธเธฒเธฃเธญเธฑเธเน€เธ”เธ•เธขเนเธญเธเธซเธฅเธฑเธเธ—เธฑเนเธเธซเธกเธ” เน€เธเธทเนเธญเนเธซเนเธ•เธฃเธงเธเธชเธญเธเนเธ”เนเธเนเธฒเธขเธเธฒเธเน€เธกเธเธนเนเธเนเธเน€เธ•เธทเธญเธ"
              : "This page contains version history and update reasons, directly linked from notifications."}
          </p>
        </div>

        <div className="space-y-3">
          {releases.map((release) => (
            <article key={release.version} className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-app-body font-semibold text-slate-900">
                  {release.version} - {release.title}
                </p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-app-micro font-medium text-slate-600">
                  {release.releasedOnLabel}
                </span>
              </div>

              <div className="mt-2 space-y-1.5">
                {release.highlights.map((item) => (
                  <div key={`${release.version}-${item}`} className="flex items-start gap-2 rounded-xl bg-slate-50 px-2.5 py-2">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                    <p className="text-app-caption leading-5 text-slate-700">{item}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </Card>
    </section>
  );
}

