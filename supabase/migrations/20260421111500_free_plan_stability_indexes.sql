-- Free plan stability indexes (safe, non-destructive)
-- Focus: reduce CPU/IO on common read paths without touching user data.

create index if not exists idx_approval_requests_user_pending_created
  on public.approval_requests (user_id, created_at desc)
  where request_status = 'pending';

create index if not exists idx_team_room_members_room_joined
  on public.team_room_members (room_id, joined_at asc, user_id);

create index if not exists idx_profiles_active_email_trgm
  on public.profiles
  using gin (email gin_trgm_ops)
  where status = 'active';

