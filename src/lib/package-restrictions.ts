import type { PackageEntitlements, PackageUsageSnapshot } from "@/lib/package-entitlements";

export type PackageRestrictionState = {
  interactiveLocked: boolean;
  overLimit: {
    vaultItems: number;
    notes: number;
    filesBytes: number;
  };
};

function toSafeNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildPackageRestrictionState(input: {
  entitlements: PackageEntitlements;
  usage: PackageUsageSnapshot;
}) {
  const overVaultItems = Math.max(0, toSafeNumber(input.usage.vaultItems) - toSafeNumber(input.entitlements.vaultItemsLimit));
  const overNotes = Math.max(0, toSafeNumber(input.usage.notes) - toSafeNumber(input.entitlements.notesLimit));
  const overFiles = Math.max(0, toSafeNumber(input.usage.fileBytes) - toSafeNumber(input.entitlements.storageLimitBytes));

  return {
    interactiveLocked: overVaultItems > 0 || overNotes > 0 || overFiles > 0,
    overLimit: {
      vaultItems: overVaultItems,
      notes: overNotes,
      filesBytes: overFiles,
    },
  } satisfies PackageRestrictionState;
}

