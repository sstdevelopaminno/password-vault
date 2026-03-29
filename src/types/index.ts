export type Role = "pending" | "user" | "approver" | "admin" | "super_admin";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: "pending_approval" | "active" | "disabled";
  created_at: string;
};

export type VaultItem = {
  id: string;
  owner_user_id: string;
  title: string;
  username_value_encrypted: string;
  secret_value_encrypted: string;
  url?: string | null;
  category?: string | null;
  notes_encrypted?: string | null;
  updated_at: string;
};
