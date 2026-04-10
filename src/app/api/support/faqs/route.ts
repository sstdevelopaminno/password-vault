import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type FaqRow = {
  id: string;
  category: string;
  question: string;
  question_th?: string | null;
  answer: string;
  answer_th?: string | null;
  sort_order: number;
  updated_at: string;
};

function toFallbackFaqs(locale: "th" | "en") {
  if (locale === "th") {
    return [
      {
        id: "fallback-account",
        category: "account",
        question: "กู้คืนบัญชีต้องทำอย่างไร?",
        answer: "กดลืมรหัสผ่านที่หน้าเข้าสู่ระบบ ยืนยัน OTP แล้วตั้งรหัสผ่านและ PIN ใหม่",
        sortOrder: 10,
        updatedAt: new Date(0).toISOString(),
      },
      {
        id: "fallback-security",
        category: "security",
        question: "ทำอย่างไรให้คลังรหัสปลอดภัย?",
        answer: "เปิดใช้ PIN Lock ตั้งรหัสผ่านที่คาดเดายาก และตรวจสอบอุปกรณ์ที่เชื่อมต่อเป็นประจำ",
        sortOrder: 20,
        updatedAt: new Date(0).toISOString(),
      },
      {
        id: "fallback-team",
        category: "team",
        question: "การแชร์รหัสแบบ Team Keys ทำงานอย่างไร?",
        answer: "สร้าง Team Room เชิญสมาชิก แล้วแชร์รายการรหัสที่ต้องการเข้าไปในห้องนั้น",
        sortOrder: 30,
        updatedAt: new Date(0).toISOString(),
      },
    ];
  }

  return [
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
}

function resolveLocale(req: Request): "th" | "en" {
  const { searchParams } = new URL(req.url);
  const viaQuery = String(searchParams.get("locale") ?? "").toLowerCase();
  if (viaQuery.startsWith("th")) return "th";
  if (viaQuery.startsWith("en")) return "en";

  const viaHeader = String(req.headers.get("accept-language") ?? "").toLowerCase();
  if (viaHeader.includes("th")) return "th";
  return "en";
}

function mapKnownEnglishToThai(text: string) {
  const normalized = String(text).trim().toLowerCase();
  if (normalized === "how can i recover my account?") return "กู้คืนบัญชีต้องทำอย่างไร?";
  if (normalized === "how do i keep my vault secure?") return "ทำอย่างไรให้คลังรหัสปลอดภัย?";
  if (normalized === "how does team keys sharing work?") return "การแชร์รหัสแบบ Team Keys ทำงานอย่างไร?";
  if (normalized.includes("forgot password")) return "กดลืมรหัสผ่านที่หน้าเข้าสู่ระบบ ยืนยัน OTP แล้วตั้งรหัสผ่านและ PIN ใหม่";
  if (normalized.includes("enable pin lock")) return "เปิดใช้ PIN Lock ตั้งรหัสผ่านที่คาดเดายาก และตรวจสอบอุปกรณ์ที่เชื่อมต่อเป็นประจำ";
  if (normalized.includes("create a team room")) return "สร้าง Team Room เชิญสมาชิก แล้วแชร์รายการรหัสที่ต้องการเข้าไปในห้องนั้น";
  return "";
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const locale = resolveLocale(req);
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
      .select("id,category,question,question_th,answer,answer_th,sort_order,updated_at")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as FaqRow[];

    return NextResponse.json(
      {
        faqs: rows.map((row) => {
          const question = locale === "th"
            ? (String(row.question_th ?? "").trim() || mapKnownEnglishToThai(row.question) || row.question)
            : row.question;
          const answer = locale === "th"
            ? (String(row.answer_th ?? "").trim() || mapKnownEnglishToThai(row.answer) || row.answer)
            : row.answer;
          return {
            id: row.id,
            category: row.category,
            question,
            answer,
            sortOrder: row.sort_order,
            updatedAt: row.updated_at,
          };
        }),
      },
      { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" } },
    );
  } catch {
    return NextResponse.json(
      { faqs: toFallbackFaqs(locale), fallback: true },
      { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" } },
    );
  }
}
