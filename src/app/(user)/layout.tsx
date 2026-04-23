import { createElement } from "react";
import { MobileShell } from "@/components/layout/mobile-shell";
import { BottomNav } from "@/components/layout/bottom-nav";
import { UserAccessGate } from "@/components/auth/user-access-gate";

export default function UserLayout(props: { children: React.ReactNode }) {
  const h = createElement;
  return h(
    MobileShell,
    null,
    h(
      "main",
      { className: "vault-user-theme flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+110px)]" },
      h(UserAccessGate, null, props.children),
    ),
    h(BottomNav, null),
  );
}
