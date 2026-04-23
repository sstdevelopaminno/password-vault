"use client";

import { useI18n } from "@/i18n/provider";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="inline-flex h-10 items-center rounded-[14px] border border-[var(--border-soft)] bg-white/92 px-1.5 text-sm shadow-[0_8px_18px_rgba(30,41,59,0.12)]">
      <button
        type="button"
        onClick={() => setLocale("th")}
        className={`rounded-[10px] px-3 py-1.5 font-semibold transition ${locale === "th" ? "bg-gradient-to-r from-[#43d8ff] via-[#4f7bff] to-[#d946ef] text-white" : "text-slate-600"}`}
      >
        {t("common.th")}
      </button>
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={`rounded-[10px] px-3 py-1.5 font-medium transition ${locale === "en" ? "bg-gradient-to-r from-[#43d8ff] via-[#4f7bff] to-[#d946ef] text-white" : "text-slate-600"}`}
      >
        {t("common.en")}
      </button>
    </div>
  );
}
