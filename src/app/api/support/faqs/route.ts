import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type FaqRow = {
  id: string;
  category: string;
  question: string;
  answer: string;
  sort_order: number;
  updated_at: string;
};

const fallbackFaqs = [
  {
    id: "fallback-account",
    category: "account",
    question: "How can I recover my account?",
    answer: "Use Forgot Password on the login page, verify OTP, then reset password and PIN.",
    sortOrder: 10,
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "fallback-security",
    category: "security",
    question: "How do I keep my vault secure?",
    answer: "Enable PIN lock, use a strong unique password, and review trusted sessions regularly.",
    sortOrder: 20,
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "fallback-team",
    category: "team",
    question: "How does Team Keys sharing work?",
    answer: "Create a Team Room, invite members, then share selected vault items into that room.",
    sortOrder: 30,
    updatedAt: new Date(0).toISOString(),
  },
];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("support_faqs")
      .select("id,category,question,answer,sort_order,updated_at")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as FaqRow[];

    return NextResponse.json({
      faqs: rows.map((row) => ({
        id: row.id,
        category: row.category,
        question: row.question,
        answer: row.answer,
        sortOrder: row.sort_order,
        updatedAt: row.updated_at,
      })),
    });
  } catch {
    return NextResponse.json({ faqs: fallbackFaqs, fallback: true });
  }
}
