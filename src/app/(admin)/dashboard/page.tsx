"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

type Stats = {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  pendingApprovals: number;
  reviewedApprovals24h: number;
  recentSensitiveActions24h: number;
};

const cards: Array<{ key: keyof Stats; label: string }> = [
  { key: "totalUsers", label: "Total users" },
  { key: "activeUsers", label: "Active users" },
  { key: "adminUsers", label: "Admin/Approver users" },
  { key: "pendingApprovals", label: "Pending approvals" },
  { key: "reviewedApprovals24h", label: "Approvals reviewed (24h)" },
  { key: "recentSensitiveActions24h", label: "Sensitive actions (24h)" },
];

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      setStats(body);
    }
    void load();
  }, []);

  return (
    <section className="grid gap-3 pb-20">
      <h1 className="text-app-h2 font-semibold">Admin Dashboard</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((item) => (
          <Card key={item.key} className="space-y-1">
            <p className="text-app-caption font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
            <p className="text-app-h1 font-semibold text-slate-900">{stats?.[item.key] ?? 0}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

