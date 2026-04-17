import { NextResponse } from "next/server";
import { getDefaultAndroidReleasePayload } from "@/lib/android-apk-release";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getDefaultAndroidReleasePayload(), {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" },
  });
}
