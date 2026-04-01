"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/i18n/provider";

type VaultItemForm = {
  title: string;
  username: string;
  secret?: string;
  url?: string;
  category?: string;
  notes?: string;
};

type VaultItemModalProps = {
  mode: "add" | "edit";
  initialValue?: VaultItemForm;
  onClose: () => void;
  onSubmit: (value: VaultItemForm) => Promise<void>;
};

export function VaultItemModal({ mode, initialValue, onClose, onSubmit }: VaultItemModalProps) {
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<VaultItemForm>({
    title: initialValue?.title ?? "",
    username: initialValue?.username ?? "",
    secret: initialValue?.secret ?? "",
    url: initialValue?.url ?? "",
    category: initialValue?.category ?? t("vault.categoryGeneral"),
    notes: initialValue?.notes ?? "",
  });

  const modalTitle =
    mode === "add"
      ? t("addItem.title")
      : locale === "th"
        ? "แก้ไขรายการคลังรหัส"
        : "Edit Vault Item";

  const submitText = mode === "add" ? t("addItem.save") : locale === "th" ? "อัปเดตรายการ" : "Update Item";
  const loadingText = mode === "add" ? t("addItem.saving") : locale === "th" ? "กำลังอัปเดต..." : "Updating...";

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/40 backdrop-blur-[2px]">
      <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+78px)] mx-auto w-[calc(100%-12px)] max-h-[calc(100dvh-120px)] max-w-[480px] overflow-y-auto animate-slide-up rounded-[28px] bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{modalTitle}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-500 hover:bg-slate-100" aria-label={t("addItem.closeAria")}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <Card>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              await onSubmit(form);
              setLoading(false);
            }}
          >
            <Input placeholder={t("addItem.fieldTitle")} value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} required />
            <Input placeholder={t("addItem.fieldUsername")} value={form.username} onChange={(e) => setForm((v) => ({ ...v, username: e.target.value }))} required />
            <Input type="password" placeholder={t("addItem.fieldSecret")} value={form.secret} onChange={(e) => setForm((v) => ({ ...v, secret: e.target.value }))} />
            <Input placeholder={t("addItem.fieldCategory")} value={form.category} onChange={(e) => setForm((v) => ({ ...v, category: e.target.value }))} />
            <Input placeholder={t("addItem.fieldUrl")} value={form.url} onChange={(e) => setForm((v) => ({ ...v, url: e.target.value }))} />
            <Input placeholder={t("addItem.fieldNotes")} value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} />

            <Button className="w-full" disabled={loading}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> {loadingText}
                </span>
              ) : (
                submitText
              )}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

