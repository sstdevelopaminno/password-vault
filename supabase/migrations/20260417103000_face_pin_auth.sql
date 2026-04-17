-- Face + PIN login controls and biometric templates

alter table public.profiles
  add column if not exists face_auth_enabled boolean not null default false,
  add column if not exists face_enrolled_at timestamptz;

create table if not exists public.user_face_biometrics (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  template_encrypted text not null,
  template_version text not null default 'v1',
  enrollment_source text not null default 'settings_camera',
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_verified_at timestamptz,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  constraint user_face_biometrics_failed_attempts_check check (failed_attempts >= 0)
);

create index if not exists idx_user_face_biometrics_locked_until
  on public.user_face_biometrics (locked_until asc);

alter table public.user_face_biometrics enable row level security;

drop policy if exists "user_face_biometrics_owner_select" on public.user_face_biometrics;
create policy "user_face_biometrics_owner_select"
on public.user_face_biometrics for select
using (auth.uid() = user_id);

drop policy if exists "user_face_biometrics_owner_insert" on public.user_face_biometrics;
create policy "user_face_biometrics_owner_insert"
on public.user_face_biometrics for insert
with check (auth.uid() = user_id);

drop policy if exists "user_face_biometrics_owner_update" on public.user_face_biometrics;
create policy "user_face_biometrics_owner_update"
on public.user_face_biometrics for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_face_biometrics_owner_delete" on public.user_face_biometrics;
create policy "user_face_biometrics_owner_delete"
on public.user_face_biometrics for delete
using (auth.uid() = user_id);
