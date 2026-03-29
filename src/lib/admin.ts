import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function requireAdminContext() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id,role,status")
    .eq("id", auth.user.id)
    .single();

  if (error || !profile) {
    return { error: NextResponse.json({ error: "Profile not found" }, { status: 404 }) };
  }

  if (!["approver", "admin", "super_admin"].includes(profile.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    supabase,
    authUser: auth.user,
    profile,
  };
}
