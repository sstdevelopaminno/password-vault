"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type DisplayScaleMode = "standard" | "comfort" | "compact";

const DISPLAY_SCALE_STORAGE_KEY = "pv_display_scale_mode_v1";

type DisplayScaleContextValue = {
  mode: DisplayScaleMode;
  setMode: (mode: DisplayScaleMode) => void;
};

const DisplayScaleContext = createContext<DisplayScaleContextValue | null>(null);

function getInitialMode(): DisplayScaleMode {
  if (typeof window === "undefined") return "comfort";
  const saved = window.localStorage.getItem(DISPLAY_SCALE_STORAGE_KEY);
  if (saved === "standard" || saved === "comfort" || saved === "compact") {
    return saved;
  }
  return "comfort";
}

export function DisplayScaleProvider(props: { children: ReactNode }) {
  const [mode, setModeState] = useState<DisplayScaleMode>(() => getInitialMode());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = window.document.documentElement;
    root.setAttribute("data-ui-scale", mode);
    window.localStorage.setItem(DISPLAY_SCALE_STORAGE_KEY, mode);
  }, [mode]);

  const value = useMemo<DisplayScaleContextValue>(
    () => ({
      mode,
      setMode: setModeState,
    }),
    [mode],
  );

  return <DisplayScaleContext.Provider value={value}>{props.children}</DisplayScaleContext.Provider>;
}

export function useDisplayScale() {
  const context = useContext(DisplayScaleContext);
  if (!context) {
    throw new Error("useDisplayScale must be used within DisplayScaleProvider");
  }
  return context;
}

