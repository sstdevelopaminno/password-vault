'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'pv_theme_mode_v1';

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  return saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'dark';
}

function getInitialSystemDark() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider(props: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => getInitialMode());
  const [systemDark, setSystemDark] = useState<boolean>(() => getInitialSystemDark());
  const resolvedTheme: ResolvedTheme = mode === 'auto' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = window.document.documentElement;
    root.setAttribute('data-theme', resolvedTheme);
    root.setAttribute('data-theme-mode', mode);
    root.style.colorScheme = resolvedTheme;

    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  }, [mode, resolvedTheme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemDark(event.matches);
    };
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    resolvedTheme,
    setMode: setModeState,
  }), [mode, resolvedTheme]);

  return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
