-- Asanoha shop profile (addresses, profile details, recent orders) for the shared Asanoha account.
-- Replaces the Firestore users/<uid> document when asanoha.co.in signs in with Supabase.
create table public.asanoha_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.asanoha_profiles enable row level security;

create policy "Read own profile" on public.asanoha_profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Create own profile" on public.asanoha_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Update own profile" on public.asanoha_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
