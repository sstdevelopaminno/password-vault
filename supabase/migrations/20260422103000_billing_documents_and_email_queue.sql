-- Billing documents + scheduled email queue

create table if not exists public.billing_documents (
  id uuid primary key default gen_random_uuid(),
  share_token uuid not null default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  doc_kind text not null check (doc_kind in ('receipt', 'invoice')),
  template text not null default 'a4' check (template in ('a4', '80mm')),
  document_no text not null,
  reference_no text,
  issue_date date not null,
  due_date date,
  seller_name text not null,
  seller_address text,
  seller_tax_id text,
  buyer_name text not null,
  buyer_address text,
  buyer_tax_id text,
  contact_name text,
  contact_phone text,
  payment_method text,
  note_message text,
  discount_percent numeric(9, 4) not null default 0,
  vat_percent numeric(9, 4) not null default 7,
  currency text not null default 'THB',
  subtotal numeric(18, 4) not null default 0,
  discount_amount numeric(18, 4) not null default 0,
  vat_amount numeric(18, 4) not null default 0,
  grand_total numeric(18, 4) not null default 0,
  lines_json jsonb not null default '[]'::jsonb,
  email_to text,
  email_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_email_jobs (
  id bigserial primary key,
  billing_document_id uuid not null references public.billing_documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'cancelled', 'failed')),
  to_email text not null,
  subject text,
  message text,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  attempt_count integer not null default 0,
  max_attempts integer not null default 8 check (max_attempts >= 1),
  next_retry_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_documents_user_created
  on public.billing_documents (user_id, created_at desc, id desc);

create index if not exists idx_billing_documents_user_issue
  on public.billing_documents (user_id, issue_date desc, id desc);

create unique index if not exists idx_billing_documents_share_token_unique
  on public.billing_documents (share_token);

create index if not exists idx_billing_email_jobs_due
  on public.billing_email_jobs (status, next_retry_at asc, scheduled_at asc, id asc);

create index if not exists idx_billing_email_jobs_user_created
  on public.billing_email_jobs (user_id, created_at desc, id desc);

create unique index if not exists idx_billing_email_jobs_pending_unique
  on public.billing_email_jobs (billing_document_id, to_email, scheduled_at)
  where status in ('pending', 'processing');

alter table public.billing_documents enable row level security;
alter table public.billing_email_jobs enable row level security;

drop policy if exists "billing_documents_owner_all" on public.billing_documents;
create policy "billing_documents_owner_all"
on public.billing_documents for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "billing_email_jobs_owner_select" on public.billing_email_jobs;
create policy "billing_email_jobs_owner_select"
on public.billing_email_jobs for select
using (auth.uid() = user_id);
