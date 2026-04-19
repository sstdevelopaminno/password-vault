import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { evaluateFileThreat } from "@/lib/file-threat-intel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  fileName: z.string().trim().min(1).max(240),
  fileSize: z.number().int().min(1).max(2_000_000_000),
  sha256: z.string().trim().regex(/^[a-fA-F0-9]{64}$/),
  isApk: z.boolean().optional(),
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
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await evaluateFileThreat(parsed.data);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to scan file";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
