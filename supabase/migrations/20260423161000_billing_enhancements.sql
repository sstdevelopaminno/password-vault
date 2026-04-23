-- Billing enhancements: payment status, reminders, recurring monthly, and job type

alter table public.billing_documents
  add column if not exists payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  add column if not exists paid_at timestamptz,
  add column if not exists auto_reminder_enabled boolean not null default true,
  add column if not exists reminder_before_days integer not null default 1 check (reminder_before_days between 0 and 30),
  add column if not exists reminder_after_days integer not null default 3 check (reminder_after_days between 0 and 30),
  add column if not exists recurring_email_enabled boolean not null default false,
  add column if not exists recurring_day_of_month integer check (recurring_day_of_month between 1 and 31),
  add column if not exists last_recurring_queued_on date;

alter table public.billing_email_jobs
  add column if not exists job_type text not null default 'manual' check (job_type in ('manual', 'due_before', 'due_after', 'monthly'));

create index if not exists idx_billing_documents_recurring
  on public.billing_documents (recurring_email_enabled, user_id, recurring_day_of_month)
  where recurring_email_enabled = true;

create index if not exists idx_billing_documents_due_unpaid
  on public.billing_documents (user_id, due_date)
  where payment_status = 'unpaid';

create index if not exists idx_billing_email_jobs_doc_job_type
  on public.billing_email_jobs (billing_document_id, job_type, status, scheduled_at);
