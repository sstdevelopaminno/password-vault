import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueuePushNotification, processPushQueue } from "@/lib/push-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SelfTestPayload = {
  title?: string;
  message?: string;
  href?: string;
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as SelfTestPayload;
  const title = String(body.title ?? "Vault Push Test").trim() || "Vault Push Test";
  const message = String(body.message ?? "Push notification is working.").trim() || "Push notification is working.";
  const href = String(body.href ?? "/settings/notifications").trim() || "/settings/notifications";

  const queued = await enqueuePushNotification({
    userId: user.id,
    kind: "system",
    title,
    message,
    href,
    tag: "pv-self-test-" + Date.now(),
    priority: 10,
  });

  if (!queued.ok) {
    return NextResponse.json({ error: queued.error || "Unable to enqueue push test" }, { status: 500 });
  }

  const processSummary = await processPushQueue({ batchSize: 20 });
  return NextResponse.json({ ok: true, queuedId: queued.id, processSummary });
}

