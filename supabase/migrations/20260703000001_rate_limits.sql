-- Rate limiting for the vita-handler edge function.
-- One row per accepted request; the function counts rows per hashed IP in the
-- trailing hour and rejects requests over the limit.

create table if not exists public.rate_limits (
  id bigint generated always as identity primary key,
  ip_hash text not null,           -- SHA-256 of the visitor IP (never the raw IP)
  created_at timestamptz not null default now()
);

-- The function's hot query: "how many requests from this IP in the last hour?"
create index if not exists rate_limits_ip_time_idx
  on public.rate_limits (ip_hash, created_at desc);

-- Lock the table down: RLS on, no policies. Only the service-role key (used
-- by the edge function server-side) can read or write; the public anon key
-- gets nothing.
alter table public.rate_limits enable row level security;

-- Housekeeping: rows older than a day are useless. pg_cron runs this daily on
-- Supabase (extension is available on the free tier).
create extension if not exists pg_cron;
select cron.schedule(
  'purge-old-rate-limits',
  '17 3 * * *',  -- daily at 03:17 UTC
  $$delete from public.rate_limits where created_at < now() - interval '24 hours'$$
);
