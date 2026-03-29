import { MobileShell } from "@/components/layout/mobile-shell";
import { BottomNav } from "@/components/layout/bottom-nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileShell>
      <main className="flex-1 px-4 py-6">{children}</main>
      <BottomNav admin />
    </MobileShell>
  );
}
