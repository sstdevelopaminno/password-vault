import type { ReactNode } from "react";
import { TopQuickActions } from "@/components/layout/top-quick-actions";

export function MobileShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden">
      <div className="flex items-center justify-end gap-2 px-4 pt-3 pb-1">
        <TopQuickActions />
      </div>
      {children}
    </div>
  );
}
