import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function readEnvFile(filePath) {
  const map = new Map();
  if (!existsSync(filePath)) return map;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

function envValue(envMap, key) {
  return String(process.env[key] || envMap.get(key) || "").trim();
}

async function main() {
  const root = process.cwd();
  const envMap = readEnvFile(path.join(root, ".env.local"));

  const supabaseUrl = envValue(envMap, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = envValue(envMap, "SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRole) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const stamp = Date.now();
  const email = `qa.e2e.${stamp}@example.com`;
  const password = `E2e#Vault2026!${Math.floor(Math.random() * 1000)}`;
  const fullName = "QA E2E";

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (created.error || !created.data.user) {
    throw new Error(created.error?.message || "Unable to create user");
  }
  const userId = created.data.user.id;

  const profileUpsert = await admin.from("profiles").upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      role: "user",
      status: "active",
      email_verified_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (profileUpsert.error) throw new Error(profileUpsert.error.message);

  const credit = await admin.rpc("wallet_apply_transaction", {
    p_user_id: userId,
    p_direction: "credit",
    p_amount_thb: 500,
    p_tx_type: "adjustment",
    p_ref_order_id: null,
    p_note: "e2e_seed_credit",
  });
  if (credit.error) throw new Error(credit.error.message);

  process.stdout.write(
    JSON.stringify(
      {
        userId,
        email,
        password,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
});
