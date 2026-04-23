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
    if (status === "open") return "เน€เธเธดเธ”";
    if (status === "in_progress") return "เธเธณเธฅเธฑเธเธ”เธณเน€เธเธดเธเธเธฒเธฃ";
    if (status === "resolved") return "เนเธเนเนเธเนเธฅเนเธง";
    return "เธเธดเธ”เธเธฒเธ";
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
        fetch("/api/support/faqs?locale=" + locale),
        fetch("/api/support/tickets?limit=6&page=1", { cache: "no-store" }),
        fetch("/api/support/contact"),
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
      toast.showToast(locale === "th" ? "เนเธซเธฅเธ”เธเนเธญเธกเธนเธฅเธจเธนเธเธขเนเธเนเธงเธขเน€เธซเธฅเธทเธญเนเธกเนเธชเธณเน€เธฃเนเธ" : "Failed to load help center", "error");
    } finally {
      setLoading(false);
    }
  }, [locale, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const headline = locale === "th" ? "เธจเธนเธเธขเนเธเนเธงเธขเน€เธซเธฅเธทเธญ" : "Help Center";

  const cardStats = useMemo(
    () => [
      {
        icon: CircleHelp,
        label: locale === "th" ? "FAQ" : "FAQs",
        value: String(faqs.length),
      },
      {
        icon: Ticket,
        label: locale === "th" ? "Ticket เธเธญเธเธเธธเธ“" : "Your tickets",
        value: String(tickets.length),
      },
      {
        icon: UserRound,
        label: locale === "th" ? "เธเธนเนเธ”เธนเนเธฅเธ—เธตเนเธ•เธดเธ”เธ•เนเธญเนเธ”เน" : "Admin contacts",
        value: String(contacts.length),
      },
    ],
    [contacts.length, faqs.length, locale, tickets.length],
  );

  async function submitTicket() {
    const subject = form.subject.trim();
    const message = form.message.trim();
    if (subject.length < 3 || message.length < 10) {
      toast.showToast(locale === "th" ? "เธเธฃเธญเธเธซเธฑเธงเธเนเธญเนเธฅเธฐเธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เนเธซเนเธเธฃเธเธเนเธญเธเธชเนเธ Ticket" : "Please complete subject and message", "error");
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
      toast.showToast(locale === "th" ? "เธชเนเธ Ticket เธชเธณเน€เธฃเนเธเนเธฅเนเธง" : "Ticket submitted");
    } catch {
      toast.showToast(locale === "th" ? "เธชเนเธ Ticket เนเธกเนเธชเธณเน€เธฃเนเธ" : "Failed to submit ticket", "error");
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
            <h1 className="text-app-h1 font-semibold text-slate-900">{headline}</h1>
            <p className="text-app-body text-slate-500">
              {locale === "th"
                ? "FAQ, Ticket เนเธฅเธฐเธเนเธญเธเธ—เธฒเธเธ•เธดเธ”เธ•เนเธญเนเธญเธ”เธกเธดเธ เน€เธเธทเนเธญเธกเธ•เนเธญ API เธเธฃเธดเธเนเธฅเนเธง"
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
                  <p className="text-app-micro font-semibold">{item.label}</p>
                </div>
                <p className="mt-1 text-app-h1 font-semibold leading-none text-slate-900">{item.value}</p>
              </div>
            );
          })}
        </div>
      </div>

      <Card className="space-y-3 rounded-[22px] border border-slate-200 bg-white/95 p-4">
        <h2 className="text-app-body font-semibold text-slate-800">
          {locale === "th" ? "เน€เธเธดเธ” Ticket เนเธซเธกเน" : "Create support ticket"}
        </h2>
        <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
          <p className="text-app-micro font-semibold uppercase tracking-[0.08em] text-slate-500">
            {locale === "th" ? "เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ” Ticket" : "Ticket details"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-app-caption font-semibold text-slate-500">{locale === "th" ? "เธซเธกเธงเธ”เธซเธกเธนเน" : "Category"}</span>
              <select
                value={form.category}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, category: event.target.value as TicketFormState["category"] }))
                }
                className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-app-body text-slate-800 outline-none focus:border-blue-300"
              >
                <option value="general">{locale === "th" ? "เธ—เธฑเนเธงเนเธ" : "General"}</option>
                <option value="account">{locale === "th" ? "เธเธฑเธเธเธตเธเธนเนเนเธเน" : "Account"}</option>
                <option value="security">{locale === "th" ? "เธเธงเธฒเธกเธเธฅเธญเธ”เธ เธฑเธข" : "Security"}</option>
                <option value="team">{locale === "th" ? "เธ—เธตเธกเนเธฅเธฐเธชเธดเธ—เธเธดเน" : "Team access"}</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-app-caption font-semibold text-slate-500">{locale === "th" ? "เธเธงเธฒเธกเน€เธฃเนเธเธ”เนเธงเธ" : "Priority"}</span>
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, priority: event.target.value as TicketFormState["priority"] }))
                }
                className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-app-body text-slate-800 outline-none focus:border-blue-300"
              >
                <option value="low">{locale === "th" ? "เธ•เนเธณ" : "Low"}</option>
                <option value="normal">{locale === "th" ? "เธเธเธ•เธด" : "Normal"}</option>
                <option value="high">{locale === "th" ? "เธชเธนเธ" : "High"}</option>
              </select>
            </label>
          </div>

          <label className="space-y-1">
            <span className="text-app-caption font-semibold text-slate-500">{locale === "th" ? "เธซเธฑเธงเธเนเธญ" : "Subject"}</span>
            <input
              value={form.subject}
              onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
              className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-app-body text-slate-800 outline-none focus:border-blue-300"
              placeholder={locale === "th" ? "เน€เธเนเธ เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เน€เธเนเธฒเธฃเธฐเธเธเนเธ”เน" : "e.g. Cannot sign in"}
              maxLength={140}
            />
          </label>

          <label className="space-y-1">
            <span className="text-app-caption font-semibold text-slate-500">{locale === "th" ? "เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เธเธฑเธเธซเธฒ" : "Details"}</span>
            <textarea
              value={form.message}
              onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
              className="min-h-[110px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-app-body text-slate-800 outline-none focus:border-blue-300"
              placeholder={
                locale === "th"
                  ? "เธญเธเธดเธเธฒเธขเธเธฑเธเธซเธฒเนเธซเนเธฅเธฐเน€เธญเธตเธขเธ” เน€เธเนเธ เน€เธงเธฅเธฒเน€เธเธดเธ”เธเธฑเธเธซเธฒเนเธฅเธฐเธซเธเนเธฒเธ—เธตเนเนเธเนเธเธฒเธ"
                  : "Describe the issue, when it happens, and where it occurs."
              }
              maxLength={4000}
            />
          </label>
        </div>

        <Button
          type="button"
          disabled={submitting}
          className="h-9 rounded-xl"
          onClick={() => void submitTicket()}
        >
          <Send className="mr-1.5 h-4 w-4" />
          {submitting
            ? locale === "th"
              ? "เธเธณเธฅเธฑเธเธชเนเธ..."
              : "Submitting..."
            : locale === "th"
              ? "เธชเนเธ Ticket"
              : "Submit ticket"}
        </Button>
      </Card>

      <Card className="space-y-3 rounded-[22px] border border-slate-200 bg-white/95 p-4">
        <h2 className="text-app-body font-semibold text-slate-800">{locale === "th" ? "Ticket เธฅเนเธฒเธชเธธเธ”เธเธญเธเธเธธเธ“" : "Your recent tickets"}</h2>
        {loading ? (
          <p className="text-app-body text-slate-500">{locale === "th" ? "เธเธณเธฅเธฑเธเนเธซเธฅเธ”..." : "Loading..."}</p>
        ) : tickets.length === 0 ? (
          <p className="text-app-body text-slate-500">{locale === "th" ? "เธขเธฑเธเนเธกเนเธกเธต Ticket" : "No tickets yet."}</p>
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-app-body font-semibold text-slate-800">{ticket.subject}</p>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-app-micro font-semibold text-blue-700">
                    {statusLabel(ticket.status, locale)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-app-caption text-slate-600">{ticket.message}</p>
                <p className="mt-1 text-app-micro text-slate-500">{formatDate(ticket.createdAt, locale)}</p>
                {ticket.adminResponse ? (
                  <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-app-caption text-emerald-800">
                    <span className="font-semibold">{locale === "th" ? "เธเธณเธ•เธญเธเธเธฒเธเนเธญเธ”เธกเธดเธ: " : "Admin response: "}</span>
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
          <h2 className="text-app-body font-semibold text-slate-800">{locale === "th" ? "เธ•เธดเธ”เธ•เนเธญเนเธญเธ”เธกเธดเธ" : "Contact admin"}</h2>
        </div>
        {loading ? (
          <p className="text-app-body text-slate-500">{locale === "th" ? "เธเธณเธฅเธฑเธเนเธซเธฅเธ”..." : "Loading..."}</p>
        ) : contacts.length === 0 ? (
          <p className="text-app-body text-slate-500">{locale === "th" ? "เธขเธฑเธเนเธกเนเธกเธตเธฃเธฒเธขเธเธทเนเธญเธเธนเนเธ”เธนเนเธฅ" : "No admin contacts found."}</p>
        ) : (
          <div className="space-y-2">
            {contacts.map((contact) => (
              <a
                key={contact.id}
                href={"mailto:" + contact.email}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 transition hover:border-blue-200 hover:bg-blue-50/60"
              >
                <span>
                  <p className="text-app-body font-semibold text-slate-800">{contact.fullName}</p>
                  <p className="text-app-caption text-slate-500">{contact.roleLabel}</p>
                </span>
                <span className="inline-flex items-center gap-1 text-app-caption font-semibold text-blue-700">
                  <Mail className="h-3.5 w-3.5" />
                  {contact.email}
                </span>
              </a>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-3 rounded-[22px] border border-slate-200 bg-white/95 p-4">
        <h2 className="text-app-body font-semibold text-slate-800">{locale === "th" ? "เธเธณเธ–เธฒเธกเธ—เธตเนเธเธเธเนเธญเธข (FAQ)" : "Frequently asked questions"}</h2>
        {loading ? (
          <p className="text-app-body text-slate-500">{locale === "th" ? "เธเธณเธฅเธฑเธเนเธซเธฅเธ”..." : "Loading..."}</p>
        ) : faqs.length === 0 ? (
          <p className="text-app-body text-slate-500">{locale === "th" ? "เธขเธฑเธเนเธกเนเธกเธต FAQ" : "No FAQs available."}</p>
        ) : (
          <div className="space-y-2">
            {faqs.map((faq) => (
              <div key={faq.id} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                <p className="text-app-body font-semibold text-slate-800">{faq.question}</p>
                <p className="mt-1 text-app-caption leading-5 text-slate-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}


