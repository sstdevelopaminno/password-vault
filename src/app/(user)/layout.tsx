import { createElement } from "react";
import { MobileShell } from "@/components/layout/mobile-shell";
import { BottomNav } from "@/components/layout/bottom-nav";
import { UserAccessGate } from "@/components/auth/user-access-gate";

export default function UserLayout(props: { children: React.ReactNode }) {
 const h = createElement;
 return h(
 MobileShell,
 null,
 h("main", { className: "flex-1 px-4 py-5" }, h(UserAccessGate, null, props.children)),
 h(BottomNav, null),
 );
}
