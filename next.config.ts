import type { NextConfig } from "next";

const packageVersion = String(process.env.npm_package_version ?? "0.1.0");
const shortCommitSha = String(process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "").slice(0, 7);
const localBuildId = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);
const autoVersion = shortCommitSha
  ? `${packageVersion}+${shortCommitSha}`
  : `${packageVersion}+local.${localBuildId}`;
const releaseVersion = String(process.env.APP_VERSION_OVERRIDE ?? "").trim() || autoVersion;

const nextConfig: NextConfig = {
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: releaseVersion,
  },
};

export default nextConfig;
