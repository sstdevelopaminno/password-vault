import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ContactRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: "approver" | "admin" | "super_admin";
};

function roleLabel(role: ContactRow["role"]) {
  if (role === "super_admin") return "Super Admin";
  if (role === "admin") return "Admin";
  return "Approver";
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id,full_name,email,role")
    .in("role", ["approver", "admin", "super_admin"])
    .eq("status", "active")
    .order("role", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(25);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const contacts = ((data as ContactRow[] | null) ?? []).map((row) => ({
    id: row.id,
    fullName: String(row.full_name ?? "Support Team").trim() || "Support Team",
    email: row.email,
    role: row.role,
    roleLabel: roleLabel(row.role),
  }));

  return NextResponse.json({ contacts });
}
