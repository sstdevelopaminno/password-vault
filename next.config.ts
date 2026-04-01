import type { NextConfig } from "next";

const packageVersion = String(process.env.npm_package_version ?? "0.1.0");
const releaseVersion = String(process.env.APP_VERSION_OVERRIDE ?? "").trim() || packageVersion;

const nextConfig: NextConfig = {
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: releaseVersion,
  },
};

export default nextConfig;
