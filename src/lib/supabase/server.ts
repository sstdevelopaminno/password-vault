import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSharedCookieOptions } from "@/lib/session-security";

function requireEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required Supabase env: ${name}`);
  }
  return value;
}

export async function createClient() {
  const cookieStore = await cookies();
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createServerClient(
    url,
    anonKey,
    {
      cookieOptions: getSharedCookieOptions(),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(items) {
          items.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );
}
