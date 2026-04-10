import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { supportTicketCreateSchema } from "@/lib/validators";

type TicketRow = {
  id: string;
  category: string;
  priority: "low" | "normal" | "high";
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  admin_response: string | null;
  created_at: string;
  updated_at: string;
};

function parseLimit(raw: string | null, fallback = 10, max = 30) {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

function parsePage(raw: string | null, fallback = 1) {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function mapTicket(row: TicketRow) {
  return {
    id: row.id,
    category: row.category,
    priority: row.priority,
    subject: row.subject,
    message: row.message,
    status: row.status,
    adminResponse: row.admin_response,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"));
  const page = parsePage(searchParams.get("page"));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const admin = createAdminClient();
  const { data, error, count } = await admin
    .from("support_tickets")
    .select(
      "id,category,priority,subject,message,status,admin_response,created_at,updated_at",
      { count: "exact" },
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data ?? []) as TicketRow[];
  const total = Number(count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return NextResponse.json({
    tickets: rows.map(mapTicket),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
    },
  });
}

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const parsed = supportTicketCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("support_tickets")
    .insert({
      user_id: user.id,
      category: parsed.data.category,
      priority: parsed.data.priority,
      subject: parsed.data.subject,
      message: parsed.data.message,
      status: "open",
    })
    .select("id,category,priority,subject,message,status,admin_response,created_at,updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Create ticket failed" }, { status: 400 });
  }

  await logAudit("support_ticket_created", {
    ticket_id: data.id,
    category: data.category,
    priority: data.priority,
  });

  return NextResponse.json({ ticket: mapTicket(data as TicketRow) }, { status: 201 });
}
