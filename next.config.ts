import type { NextConfig } from "next";

const packageVersion = String(process.env.npm_package_version ?? "0.1.0");
const versionOverride = String(process.env.APP_VERSION_OVERRIDE ?? "").trim();
const compactVersion = packageVersion.replace(/\.0$/, "");
const releaseVersion = versionOverride || `V${compactVersion}`;
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "phswnczojmrdfioyqsql.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: releaseVersion,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
