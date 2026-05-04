'use client';

import { useEffect, useState } from "react";
import type { PackageRestrictionState } from "@/lib/package-restrictions";
import type { PackageEntitlements } from "@/lib/package-entitlements";

type PackageCurrentRestrictionPayload = {
  restrictions?: PackageRestrictionState;
  entitlements?: PackageEntitlements;
  usage?: {
    vaultItems?: number;
    notes?: number;
    fileBytes?: number;
  };
};

const DEFAULT_RESTRICTIONS: PackageRestrictionState = {
  interactiveLocked: false,
  overLimit: {
    vaultItems: 0,
    notes: 0,
    filesBytes: 0,
  },
};

export function usePackageRestrictions() {
  const [loading, setLoading] = useState(true);
  const [restrictions, setRestrictions] = useState<PackageRestrictionState>(DEFAULT_RESTRICTIONS);
  const [entitlements, setEntitlements] = useState<PackageEntitlements | null>(null);
  const [usage, setUsage] = useState<{ vaultItems: number; notes: number; fileBytes: number } | null>(null);

  useEffect(() => {
    let mounted = true;

    async function run() {
      setLoading(true);
      try {
        const response = await fetch("/api/packages/current", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as PackageCurrentRestrictionPayload;
        if (!mounted) return;
        if (!response.ok || !payload.restrictions) {
          setRestrictions(DEFAULT_RESTRICTIONS);
          setEntitlements(null);
          setUsage(null);
          return;
        }
        setRestrictions(payload.restrictions);
        setEntitlements(payload.entitlements ?? null);
        setUsage(
          payload.usage
            ? {
                vaultItems: Number(payload.usage.vaultItems ?? 0),
                notes: Number(payload.usage.notes ?? 0),
                fileBytes: Number(payload.usage.fileBytes ?? 0),
              }
            : null,
        );
      } catch {
        if (!mounted) return;
        setRestrictions(DEFAULT_RESTRICTIONS);
        setEntitlements(null);
        setUsage(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void run();
    return () => {
      mounted = false;
    };
  }, []);

  return {
    loading,
    restrictions,
    entitlements,
    usage,
  };
}
