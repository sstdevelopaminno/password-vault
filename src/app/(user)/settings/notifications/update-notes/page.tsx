"use client";

import Link from "next/link";
import { useEffect } from "react";
import { BellRing, ChevronLeft, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n/provider";
import { APP_VERSION } from "@/lib/app-version";
import { getReleaseHistory, getReleaseUpdateTitle, markReleaseNotesAsRead } from "@/lib/release-update";

export default function UpdateNotesPage() {
  const { locale } = useI18n();
  const releases = getReleaseHistory(locale);

  useEffect(() => {
    markReleaseNotesAsRead(APP_VERSION);
  }, []);

  return (
    <section className="animate-screen-in space-y-4 pb-24 pt-[calc(env(safe-area-inset-top)+0.95rem)] sm:pt-4">
      <header className="flex items-start gap-3">
        <Link
          href="/settings/notifications"
          className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-2)] text-slate-100 shadow-[var(--glow-soft)]"
          aria-label={locale === "th" ? "กลับ" : "Back"}
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-[clamp(1.65rem,5.4vw,2.1rem)] font-semibold leading-tight text-slate-100">
            {getReleaseUpdateTitle(locale)}
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            {locale === "th" ? "รายละเอียดการปรับปรุงล่าสุดจากทีมระบบ" : "Latest release notes from the system team."}
          </p>
        </div>
      </header>

      <Card className="relative overflow-hidden rounded-[24px] border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(29,52,112,0.58)_0%,rgba(13,24,72,0.9)_100%)] p-4 sm:p-5">
        <div className="pointer-events-none absolute -right-16 -top-14 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(84,230,255,0.28),rgba(84,230,255,0))]" />
        <div className="pointer-events-none absolute -left-14 bottom-0 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(255,79,206,0.2),rgba(255,79,206,0))]" />

        <div className="relative space-y-4">
          <div className="neon-soft-panel rounded-[18px] p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-cyan-200">
                  {locale === "th" ? "เวอร์ชันปัจจุบัน" : "Current version"}
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-100">{APP_VERSION}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/50 bg-cyan-500/12 px-2.5 py-1 text-[11px] font-semibold text-cyan-100">
                <BellRing className="h-3.5 w-3.5" />
                {locale === "th" ? "อัปเดตแล้ว" : "Updated"}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-300">
              {locale === "th"
                ? "เมื่อเปิดหน้านี้แล้ว จุดแจ้งเตือนสีแดงบนไอคอนกระดิ่งจะหายอัตโนมัติ และสามารถตรวจสอบประวัติการอัปเดตย้อนหลังได้ที่นี่"
                : "Opening this page marks update notifications as read and keeps a readable history of recent releases."}
            </p>
          </div>

          <div className="space-y-3">
            {releases.map((release) => (
              <article
                key={release.version}
                className="rounded-[20px] border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(30,46,102,0.72),rgba(23,37,90,0.82))] p-3.5 shadow-[0_10px_28px_rgba(5,14,42,0.38)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2.5">
                  <div className="min-w-0">
                    <p className="text-[17px] font-semibold leading-6 text-slate-100">
                      {release.version} - {release.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {release.isCurrent ? (
                      <span className="rounded-full border border-emerald-300/45 bg-emerald-500/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-100">
                        {locale === "th" ? "ล่าสุด" : "Latest"}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-blue-300/45 bg-blue-500/12 px-2 py-0.5 text-[11px] font-semibold text-slate-100">
                      {release.releasedOnLabel}
                    </span>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {release.highlights.map((item) => (
                    <div
                      key={`${release.version}-${item}`}
                      className="flex items-start gap-2.5 rounded-[14px] border border-[var(--border-soft)] bg-[rgba(16,28,76,0.75)] px-3 py-2.5"
                    >
                      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
                      <p className="text-sm leading-6 text-slate-200">{item}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </Card>
    </section>
  );
}
