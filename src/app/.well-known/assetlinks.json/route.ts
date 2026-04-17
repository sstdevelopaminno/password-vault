import { NextResponse } from "next/server";
import { DEFAULT_ANDROID_PACKAGE } from "@/lib/release-update";

export const dynamic = "force-dynamic";

function parseFingerprints(raw: string) {
  return raw
    .split(/[\n,;]/g)
    .map((item) => item.trim().toUpperCase())
    .filter((item) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(item));
}

export async function GET() {
  const packageName = String(process.env.ANDROID_TWA_PACKAGE_NAME ?? DEFAULT_ANDROID_PACKAGE).trim() || DEFAULT_ANDROID_PACKAGE;
  const fingerprints = parseFingerprints(String(process.env.ANDROID_TWA_SHA256_FINGERPRINTS ?? ""));

  const payload = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: packageName,
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]
    : [];

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, max-age=300, must-revalidate",
      "X-AssetLinks-Ready": fingerprints.length ? "true" : "false",
    },
  });
}
