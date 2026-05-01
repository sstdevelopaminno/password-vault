do $$
begin
  create type public.workspace_folder_member_role as enum ('viewer', 'editor');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.workspace_folders (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_folders_name_len check (char_length(trim(name)) between 1 and 80)
);

create table if not exists public.workspace_folder_members (
  folder_id uuid not null references public.workspace_folders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role public.workspace_folder_member_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (folder_id, user_id)
);

create index if not exists workspace_folders_owner_updated_idx
  on public.workspace_folders (owner_user_id, updated_at desc, id desc);

create index if not exists workspace_folder_members_user_folder_idx
  on public.workspace_folder_members (user_id, folder_id);

alter table public.workspace_folders enable row level security;
alter table public.workspace_folder_members enable row level security;

create policy "workspace_folders_select_owner_or_member"
on public.workspace_folders for select
using (
  owner_user_id = auth.uid()
  or exists (
    select 1
    from public.workspace_folder_members m
    where m.folder_id = workspace_folders.id
      and m.user_id = auth.uid()
  )
);

create policy "workspace_folders_insert_owner"
on public.workspace_folders for insert
with check (owner_user_id = auth.uid());

create policy "workspace_folders_update_owner"
on public.workspace_folders for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy "workspace_folders_delete_owner"
on public.workspace_folders for delete
using (owner_user_id = auth.uid());

create policy "workspace_folder_members_select_owner_or_member"
on public.workspace_folder_members for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.workspace_folders f
    where f.id = workspace_folder_members.folder_id
      and f.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.workspace_folder_members me
    where me.folder_id = workspace_folder_members.folder_id
      and me.user_id = auth.uid()
  )
);

create policy "workspace_folder_members_insert_owner_only"
on public.workspace_folder_members for insert
with check (
  exists (
    select 1
    from public.workspace_folders f
    where f.id = workspace_folder_members.folder_id
      and f.owner_user_id = auth.uid()
  )
);

create policy "workspace_folder_members_update_owner_only"
on public.workspace_folder_members for update
using (
  exists (
    select 1
    from public.workspace_folders f
    where f.id = workspace_folder_members.folder_id
      and f.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workspace_folders f
    where f.id = workspace_folder_members.folder_id
      and f.owner_user_id = auth.uid()
  )
);

create policy "workspace_folder_members_delete_owner_or_self"
on public.workspace_folder_members for delete
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.workspace_folders f
    where f.id = workspace_folder_members.folder_id
      and f.owner_user_id = auth.uid()
  )
);

