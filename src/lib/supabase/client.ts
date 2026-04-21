import { createBrowserClient } from "@supabase/ssr";
import { type SupabaseClient } from "@supabase/supabase-js";
import { getSharedCookieOptions } from "@/lib/session-security";

let browserClient: SupabaseClient | null = null;

function requireEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required Supabase env: ${name}`);
  }
  return value;
}

export function createClient() {
  if (browserClient) return browserClient;
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  browserClient = createBrowserClient(url, anonKey, {
    cookieOptions: getSharedCookieOptions(),
  });
  return browserClient;
}
