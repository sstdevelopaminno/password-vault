import type { Role } from "@/types";

const roleLevel: Record<Role, number> = {
  pending: 0,
  user: 1,
  approver: 2,
  admin: 3,
  super_admin: 4,
};

export function hasRole(userRole: Role, required: Role) {
  return roleLevel[userRole] >= roleLevel[required];
}

export function canModerate(userRole: Role) {
  return hasRole(userRole, "approver");
}
