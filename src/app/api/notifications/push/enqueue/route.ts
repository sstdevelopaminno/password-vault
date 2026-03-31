import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/admin";
import { enqueuePushNotification, processPushQueue } from "@/lib/push-queue";

type EnqueueRequest = {
  userId?: string;
  kind?: "system" | "security" | "auth" | "vault" | "general";
  title?: string;
  message?: string;
  href?: string;
  imageUrl?: string;
  tag?: string;
  priority?: number;
  processNow?: boolean;
};

export async function POST(req: Request) {
  const ctx = await requireAdminContext();
  if ("error" in ctx) {
    return ctx.error;
  }

  const body = (await req.json().catch(() => ({}))) as EnqueueRequest;
  const userId = String(body.userId ?? "").trim();
  const title = String(body.title ?? "").trim();
  const message = String(body.message ?? "").trim();

  if (!userId || !title || !message) {
    return NextResponse.json(
      { error: "userId, title, and message are required" },
      { status: 400 },
    );
  }

  const queued = await enqueuePushNotification({
    userId,
    kind: body.kind ?? "general",
    title,
    message,
    href: body.href,
    imageUrl: body.imageUrl,
    tag: body.tag,
    priority: body.priority,
  });

  if (!queued.ok) {
    return NextResponse.json({ error: queued.error }, { status: 500 });
  }

  if (body.processNow === true) {
    const processSummary = await processPushQueue({ batchSize: 20 });
    return NextResponse.json({
      ok: true,
      queuedId: queued.id,
      processSummary,
    });
  }

  return NextResponse.json({
    ok: true,
    queuedId: queued.id,
  });
}
