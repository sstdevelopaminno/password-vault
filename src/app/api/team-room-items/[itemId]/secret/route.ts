import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptText } from "@/lib/crypto";
import { pinActionSchema } from "@/lib/validators";
import { requirePinAssertion } from "@/lib/pin-guard";
import { getTeamMemberContext } from "@/lib/team-room-access";
import { logAudit } from "@/lib/audit";
import { resolveAccessibleUserIds } from "@/lib/user-identity";

export async function GET(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const { searchParams } = new URL(req.url);
  const actionRaw = searchParams.get("action");
  const parsedAction = pinActionSchema.safeParse(actionRaw);

  if (parsedAction.success === false || !["view_secret", "copy_secret"].includes(parsedAction.data)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pinCheck = await requirePinAssertion({
    request: req,
    userId: auth.user.id,
    action: parsedAction.data,
    targetItemId: itemId,
  });
  if (pinCheck.ok === false) {
    return pinCheck.response;
  }

  const admin = createAdminClient();
  const memberUserIds = await resolveAccessibleUserIds({
    admin,
    authUserId: auth.user.id,
    authEmail: auth.user.email,
  });
  const { data: item, error } = await admin
    .from("team_room_items")
    .select("id,room_id,secret_value_encrypted")
    .eq("id", itemId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!item?.id) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const member = await getTeamMemberContext({
    admin,
    roomId: String(item.room_id),
    userId: auth.user.id,
    userIds: memberUserIds,
  });
  if (!member) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  await logAudit(parsedAction.data === "copy_secret" ? "team_room_secret_copied" : "team_room_secret_viewed", {
    team_item_id: itemId,
    room_id: item.room_id,
  });

  return NextResponse.json({ secret: decryptText(String(item.secret_value_encrypted ?? "")) });
}
