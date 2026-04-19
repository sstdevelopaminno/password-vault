import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { evaluateUrlThreat } from "@/lib/url-threat-intel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  url: z.string().trim().url().max(1500),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const result = await evaluateUrlThreat(parsed.data.url);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to scan url";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
