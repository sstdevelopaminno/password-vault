"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, type I18nKey, type Locale, messages } from "@/i18n/messages";

type I18nContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: I18nKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function getValue(locale: Locale, key: I18nKey): string {
  const segments = key.split(".");
  let current: unknown = messages[locale];
  for (const segment of segments) {
    if (typeof current !== "object" || current === null || !(segment in current)) {
      return key;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : key;
}

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const saved = window.localStorage.getItem("locale");
  return saved === "th" || saved === "en" ? saved : DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function setLocale(next: Locale) {
    setLocaleState(next);
    window.localStorage.setItem("locale", next);
  }

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => getValue(locale, key),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
