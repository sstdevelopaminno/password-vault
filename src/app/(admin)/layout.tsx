import { MobileShell } from "@/components/layout/mobile-shell";
import { BottomNav } from "@/components/layout/bottom-nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileShell>
      <main className="vault-user-theme flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-5 pt-6 pb-[calc(env(safe-area-inset-bottom)+122px)]">{children}</main>
      <BottomNav admin />
    </MobileShell>
  );
}
