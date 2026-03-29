import { createClient } from "@/lib/supabase/server";

export async function logAudit(action_type: string, metadata_json: Record<string, unknown>) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const actorId = data.user?.id ?? null;
  await supabase.from("audit_logs").insert({
    actor_user_id: actorId,
    action_type,
    metadata_json,
  });
}
