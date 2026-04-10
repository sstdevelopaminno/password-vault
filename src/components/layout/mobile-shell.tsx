"use client";

import type { ReactNode } from "react";

export function MobileShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden">
      {children}
    </div>
  );
}
