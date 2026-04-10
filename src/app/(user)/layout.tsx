import { createElement } from "react";
import { MobileShell } from "@/components/layout/mobile-shell";
import { BottomNav } from "@/components/layout/bottom-nav";
import { OfflineBanner } from "@/components/layout/offline-banner";
import { QueueUnlockPrompt } from "@/components/layout/queue-unlock-prompt";
import { UserAccessGate } from "@/components/auth/user-access-gate";

export default function UserLayout(props: { children: React.ReactNode }) {
  const h = createElement;
  return h(
    MobileShell,
    null,
    h(OfflineBanner, null),
    h(QueueUnlockPrompt, null),
    h(
      "main",
      { className: "flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+98px)]" },
      h(UserAccessGate, null, props.children),
    ),
    h(BottomNav, null),
  );
}
