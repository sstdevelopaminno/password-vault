"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleHelp, LifeBuoy, Mail, Send, ShieldCheck, Ticket, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/provider";

type SupportFaq = {
  id: string;
  category: string;
  question: string;
  answer: string;
};

type SupportTicket = {
  id: string;
  category: string;
  priority: "low" | "normal" | "high";
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  adminResponse: string | null;
  createdAt: string;
};

type SupportContact = {
  id: string;
  fullName: string;
  email: string;
  roleLabel: string;
};

type TicketFormState = {
  category: "general" | "account" | "security" | "team";
  priority: "low" | "normal" | "high";
  subject: string;
  message: string;
};

const initialForm: TicketFormState = {
  category: "general",
  priority: "normal",
  subject: "",
  message: "",
};

function formatDate(value: string, locale: "th" | "en") {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  const language = locale === "th" ? "th-TH" : "en-US";
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function statusLabel(status: SupportTicket["status"], locale: "th" | "en") {
  if (locale === "th") {
    if (status === "open") return "เปิด";
    if (status === "in_progress") return "กำลังดำเนินการ";
    if (status === "resolved") return "แก้ไขแล้ว";
    return "ปิดงาน";
  }
  if (status === "open") return "Open";
  if (status === "in_progress") return "In progress";
  if (status === "resolved") return "Resolved";
  return "Closed";
}

export default function HelpCenterPage() {
  const { locale } = useI18n();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [faqs, setFaqs] = useState<SupportFaq[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [contacts, setContacts] = useState<SupportContact[]>([]);
  const [form, setForm] = useState<TicketFormState>(initialForm);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [faqRes, ticketRes, contactRes] = await Promise.all([
        fetch("/api/support/faqs", { cache: "no-store" }),
        fetch("/api/support/tickets?limit=6&page=1", { cache: "no-store" }),
        fetch("/api/support/contact", { cache: "no-store" }),
      ]);

      const faqBody = await faqRes.json().catch(() => ({}));
      const ticketBody = await ticketRes.json().catch(() => ({}));
      const contactBody = await contactRes.json().catch(() => ({}));

      if (!faqRes.ok || !ticketRes.ok || !contactRes.ok) {
        throw new Error("Failed to load support center");
      }

      setFaqs(Array.isArray(faqBody.faqs) ? (faqBody.faqs as SupportFaq[]) : []);
      setTickets(Array.isArray(ticketBody.tickets) ? (ticketBody.tickets as SupportTicket[]) : []);
      setContacts(Array.isArray(contactBody.contacts) ? (contactBody.contacts as SupportContact[]) : []);
    } catch {
      toast.showToast(locale === "th" ? "โหลดข้อมูลศูนย์ช่วยเหลือไม่สำเร็จ" : "Failed to load help center", "error");
    } finally {
      setLoading(false);
    }
  }, [locale, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const headline = locale === "th" ? "ศูนย์ช่วยเหลือ" : "Help Center";

  const cardStats = useMemo(
    () => [
      {
        icon: CircleHelp,
        label: locale === "th" ? "FAQ" : "FAQs",
        value: String(faqs.length),
      },
      {
        icon: Ticket,
        label: locale === "th" ? "Ticket ของคุณ" : "Your tickets",
        value: String(tickets.length),
      },
      {
        icon: UserRound,
        label: locale === "th" ? "ผู้ดูแลที่ติดต่อได้" : "Admin contacts",
        value: String(contacts.length),
      },
    ],
    [contacts.length, faqs.length, locale, tickets.length],
  );

  async function submitTicket() {
    const subject = form.subject.trim();
    const message = form.message.trim();
    if (subject.length < 3 || message.length < 10) {
      toast.showToast(locale === "th" ? "กรอกหัวข้อและรายละเอียดให้ครบก่อนส่ง Ticket" : "Please complete subject and message", "error");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: form.category,
          priority: form.priority,
          subject,
          message,
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok || !body.ticket) {
        throw new Error(String(body.error ?? "Create ticket failed"));
      }

      setForm(initialForm);
      setTickets((prev) => [body.ticket as SupportTicket, ...prev].slice(0, 6));
      toast.showToast(locale === "th" ? "ส่ง Ticket สำเร็จแล้ว" : "Ticket submitted");
    } catch {
      toast.showToast(locale === "th" ? "ส่ง Ticket ไม่สำเร็จ" : "Failed to submit ticket", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-4 pb-24 pt-1">
      <div className="rounded-3xl border border-slate-200 bg-white/95 px-4 py-4 shadow-[0_10px_32px_rgba(15,23,42,0.09)]">
        <div className="flex items-center gap-3">
          <span className="rounded-2xl bg-blue-100 p-2.5 text-blue-700">
            <LifeBuoy className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{headline}</h1>
            <p className="text-sm text-slate-500">
              {locale === "th"
                ? "FAQ, Ticket และช่องทางติดต่อแอดมิน เชื่อมต่อ API จริงแล้ว"
                : "FAQ, tickets, and admin contacts are connected to live APIs."}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {cardStats.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Icon className="h-3.5 w-3.5" />
                  <p className="text-[11px] font-semibold">{item.label}</p>
                </div>
                <p className="mt-1 text-2xl font-semibold leading-none text-slate-900">{item.value}</p>
              </div>
            );
          })}
        </div>
      </div>

      <Card className="space-y-3 rounded-[22px] border border-slate-200 bg-white/95 p-4">
        <h2 className="text-sm font-semibold text-slate-800">
          {locale === "th" ? "เปิด Ticket ใหม่" : "Create support ticket"}
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">{locale === "th" ? "หมวดหมู่" : "Category"}</span>
            <select
              value={form.category}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, category: event.target.value as TicketFormState["category"] }))
              }
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-300"
            >
              <option value="general">{locale === "th" ? "ทั่วไป" : "General"}</option>
              <option value="account">{locale === "th" ? "บัญชีผู้ใช้" : "Account"}</option>
              <option value="security">{locale === "th" ? "ความปลอดภัย" : "Security"}</option>
              <option value="team">{locale === "th" ? "ทีมและสิทธิ์" : "Team access"}</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">{locale === "th" ? "ความเร่งด่วน" : "Priority"}</span>
            <select
              value={form.priority}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, priority: event.target.value as TicketFormState["priority"] }))
              }
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-300"
            >
              <option value="low">{locale === "th" ? "ต่ำ" : "Low"}</option>
              <option value="normal">{locale === "th" ? "ปกติ" : "Normal"}</option>
              <option value="high">{locale === "th" ? "สูง" : "High"}</option>
            </select>
          </label>
        </div>

        <label className="space-y-1">
          <span className="text-xs font-semibold text-slate-500">{locale === "th" ? "หัวข้อ" : "Subject"}</span>
          <input
            value={form.subject}
            onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-300"
            placeholder={locale === "th" ? "เช่น ไม่สามารถเข้าระบบได้" : "e.g. Cannot sign in"}
            maxLength={140}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold text-slate-500">{locale === "th" ? "รายละเอียดปัญหา" : "Details"}</span>
          <textarea
            value={form.message}
            onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
            className="min-h-[110px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-300"
            placeholder={
              locale === "th"
                ? "อธิบายปัญหาให้ละเอียด เช่น เวลาเกิดปัญหาและหน้าที่ใช้งาน"
                : "Describe the issue, when it happens, and where it occurs."
            }
            maxLength={4000}
          />
        </label>

        <Button
          type="button"
          disabled={submitting}
          className="h-10 rounded-xl"
          onClick={() => void submitTicket()}
        >
          <Send className="mr-1.5 h-4 w-4" />
          {submitting
            ? locale === "th"
              ? "กำลังส่ง..."
              : "Submitting..."
            : locale === "th"
              ? "ส่ง Ticket"
              : "Submit ticket"}
        </Button>
      </Card>

      <Card className="space-y-3 rounded-[22px] border border-slate-200 bg-white/95 p-4">
        <h2 className="text-sm font-semibold text-slate-800">{locale === "th" ? "Ticket ล่าสุดของคุณ" : "Your recent tickets"}</h2>
        {loading ? (
          <p className="text-sm text-slate-500">{locale === "th" ? "กำลังโหลด..." : "Loading..."}</p>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-slate-500">{locale === "th" ? "ยังไม่มี Ticket" : "No tickets yet."}</p>
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">{ticket.subject}</p>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                    {statusLabel(ticket.status, locale)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-600">{ticket.message}</p>
                <p className="mt-1 text-[11px] text-slate-500">{formatDate(ticket.createdAt, locale)}</p>
                {ticket.adminResponse ? (
                  <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-800">
                    <span className="font-semibold">{locale === "th" ? "คำตอบจากแอดมิน: " : "Admin response: "}</span>
                    <span>{ticket.adminResponse}</span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-3 rounded-[22px] border border-slate-200 bg-white/95 p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-slate-600" />
          <h2 className="text-sm font-semibold text-slate-800">{locale === "th" ? "ติดต่อแอดมิน" : "Contact admin"}</h2>
        </div>
        {loading ? (
          <p className="text-sm text-slate-500">{locale === "th" ? "กำลังโหลด..." : "Loading..."}</p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-slate-500">{locale === "th" ? "ยังไม่มีรายชื่อผู้ดูแล" : "No admin contacts found."}</p>
        ) : (
          <div className="space-y-2">
            {contacts.map((contact) => (
              <a
                key={contact.id}
                href={"mailto:" + contact.email}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 transition hover:border-blue-200 hover:bg-blue-50/60"
              >
                <span>
                  <p className="text-sm font-semibold text-slate-800">{contact.fullName}</p>
                  <p className="text-xs text-slate-500">{contact.roleLabel}</p>
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                  <Mail className="h-3.5 w-3.5" />
                  {contact.email}
                </span>
              </a>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-3 rounded-[22px] border border-slate-200 bg-white/95 p-4">
        <h2 className="text-sm font-semibold text-slate-800">{locale === "th" ? "คำถามที่พบบ่อย (FAQ)" : "Frequently asked questions"}</h2>
        {loading ? (
          <p className="text-sm text-slate-500">{locale === "th" ? "กำลังโหลด..." : "Loading..."}</p>
        ) : faqs.length === 0 ? (
          <p className="text-sm text-slate-500">{locale === "th" ? "ยังไม่มี FAQ" : "No FAQs available."}</p>
        ) : (
          <div className="space-y-2">
            {faqs.map((faq) => (
              <div key={faq.id} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                <p className="text-sm font-semibold text-slate-800">{faq.question}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
