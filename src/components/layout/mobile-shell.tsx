"use client";

import type { ReactNode } from "react";

export function MobileShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell relative flex h-[100svh] min-h-[100svh] flex-col overflow-hidden text-[var(--foreground)]">
      {children}
    </div>
  );
}
