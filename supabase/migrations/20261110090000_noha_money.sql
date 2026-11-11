-- Noha Money: one wallet per person, shared by every Asanoha product (asanoha.co.in, Wearday, ...).
--
-- Money is tracked in paise (integers). Every change is a row in noha_transactions, which is never
-- updated or deleted, so it is the single record of what happened across all apps. The spendable
-- balance lives in noha_lots: each credit is a "lot" with its own expiry; spending uses lots up.
--
-- Only the server can add money (top-up webhook, cashback, refunds, admin). Signed-in people can
-- read their own wallet and spend it on products listed in noha_products.

create table public.noha_transactions (
  id uuid primary key default gen_random_uuid(),
  -- No foreign key: payment records are kept for 8 years even after the account is deleted.
  user_id uuid not null,
  app text not null check (app in ('asanoha', 'wearday')),
  type text not null check (type in ('topup', 'cashback', 'bonus', 'refund', 'purchase', 'adjustment', 'expiry')),
  -- Positive = money in, negative = money out.
  amount_paise integer not null check (amount_paise <> 0),
  -- How much of a debit came from cashback/bonus lots (the rest came from added money).
  bonus_paise integer not null default 0,
  balance_after_paise integer not null,
  description text not null,
  -- Order ID, product ID or payment ID this belongs to.
  reference text,
  -- Makes retries safe: the same key never creates a second transaction.
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index noha_transactions_user on public.noha_transactions (user_id, created_at desc);

create table public.noha_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 'cash' = money the person added; 'bonus' = cashback, referral and birthday credit.
  kind text not null check (kind in ('cash', 'bonus')),
  amount_paise integer not null check (amount_paise > 0),
  remaining_paise integer not null check (remaining_paise >= 0),
  expires_at timestamptz,
  transaction_id uuid not null references public.noha_transactions (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index noha_lots_user on public.noha_lots (user_id) where remaining_paise > 0;

-- Things that can be bought with Noha Money.
create table public.noha_products (
  id text primary key,
  app text not null check (app in ('asanoha', 'wearday')),
  name text not null,
  price_paise integer not null check (price_paise > 0),
  -- Share of the price that cashback/bonus credit may cover (Asanoha's rule is 15%).
  max_bonus_pct integer not null default 15 check (max_bonus_pct between 0 and 100),
  -- What buying it gives, e.g. {"premium_days": 30}.
  grants jsonb not null default '{}',
  active boolean not null default true
);

insert into public.noha_products (id, app, name, price_paise, max_bonus_pct, grants) values
  ('wearday_premium_monthly', 'wearday', 'Wearday Premium · 1 month', 9900, 15, '{"premium_days": 31}'),
  ('wearday_premium_yearly', 'wearday', 'Wearday Premium · 1 year', 59900, 15, '{"premium_days": 366}');

-- Top-ups paid through the UPI gateway (NohaPI). Written only by the server.
create table public.noha_orders (
  id uuid primary key default gen_random_uuid(),
  -- No foreign key, for the same reason as noha_transactions.
  user_id uuid not null,
  app text not null check (app in ('asanoha', 'wearday')),
  amount_paise integer not null check (amount_paise > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired', 'cancelled')),
  gateway_payment_id text unique,
  utr text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index noha_orders_user on public.noha_orders (user_id, created_at desc);

-- Premium bought with Noha Money (store purchases stay in user_entitlements, written by RevenueCat).
create table public.premium_grants (
  user_id uuid primary key references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  product_id text not null,
  updated_at timestamptz not null default now()
);

alter table public.noha_transactions enable row level security;
alter table public.noha_lots enable row level security;
alter table public.noha_products enable row level security;
alter table public.noha_orders enable row level security;
alter table public.premium_grants enable row level security;

create policy "Read own transactions" on public.noha_transactions for select to authenticated using (user_id = (select auth.uid()));
create policy "Read own lots" on public.noha_lots for select to authenticated using (user_id = (select auth.uid()));
create policy "Read own orders" on public.noha_orders for select to authenticated using (user_id = (select auth.uid()));
create policy "Read own premium grant" on public.premium_grants for select to authenticated using (user_id = (select auth.uid()));
create policy "Anyone can see products" on public.noha_products for select to anon, authenticated using (active);

-- ---------------------------------------------------------------------------------------------
-- Balance

create function public.noha_balance_of(uid uuid) returns table (cash_paise integer, bonus_paise integer, total_paise integer, next_expiry timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(remaining_paise) filter (where kind = 'cash'), 0)::integer,
         coalesce(sum(remaining_paise) filter (where kind = 'bonus'), 0)::integer,
         coalesce(sum(remaining_paise), 0)::integer,
         min(expires_at)
  from public.noha_lots
  where user_id = uid and remaining_paise > 0 and (expires_at is null or expires_at > now());
$$;

-- The signed-in person's balance.
create function public.noha_balance() returns table (cash_paise integer, bonus_paise integer, total_paise integer, next_expiry timestamptz)
language sql stable security definer set search_path = public as $$
  select * from public.noha_balance_of(auth.uid());
$$;

-- ---------------------------------------------------------------------------------------------
-- Credit (server only)

create function public.noha_credit(
  uid uuid, p_app text, p_type text, p_amount integer, p_kind text, p_expires_at timestamptz,
  p_description text, p_reference text, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  existing uuid;
  txn uuid;
  bal integer;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_type not in ('topup', 'cashback', 'bonus', 'refund', 'adjustment') then raise exception 'not a credit type: %', p_type; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'expiry must be in the future'; end if;
  -- One wallet change at a time per person.
  perform pg_advisory_xact_lock(hashtext('noha:' || uid::text));
  select id into existing from public.noha_transactions where idempotency_key = p_idempotency_key;
  if existing is not null then return existing; end if;

  select total_paise into bal from public.noha_balance_of(uid);
  insert into public.noha_transactions (user_id, app, type, amount_paise, balance_after_paise, description, reference, idempotency_key)
  values (uid, p_app, p_type, p_amount, bal + p_amount, p_description, p_reference, p_idempotency_key)
  returning id into txn;
  insert into public.noha_lots (user_id, kind, amount_paise, remaining_paise, expires_at, transaction_id)
  values (uid, p_kind, p_amount, p_amount, p_expires_at, txn);
  return txn;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Debit (server and noha_buy only). Uses bonus first (soonest expiry first, up to max_bonus),
-- then added money (soonest expiry first).

create function public.noha_debit(
  uid uuid, p_app text, p_amount integer, p_max_bonus integer,
  p_description text, p_reference text, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  existing uuid;
  txn uuid;
  bal record;
  bonus_take integer;
  need integer;
  lot record;
  take integer;
  bonus_used integer := 0;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  perform pg_advisory_xact_lock(hashtext('noha:' || uid::text));
  select id into existing from public.noha_transactions where idempotency_key = p_idempotency_key;
  if existing is not null then return existing; end if;

  select * into bal from public.noha_balance_of(uid);
  bonus_take := least(bal.bonus_paise, greatest(p_max_bonus, 0), p_amount);
  if bal.cash_paise + bonus_take < p_amount then
    raise exception 'not enough Noha Money' using errcode = 'P0002';
  end if;

  need := bonus_take;
  for lot in
    select id, remaining_paise from public.noha_lots
    where user_id = uid and kind = 'bonus' and remaining_paise > 0 and (expires_at is null or expires_at > now())
    order by expires_at nulls last, created_at
    for update
  loop
    exit when need = 0;
    take := least(need, lot.remaining_paise);
    update public.noha_lots set remaining_paise = remaining_paise - take where id = lot.id;
    need := need - take;
    bonus_used := bonus_used + take;
  end loop;

  need := p_amount - bonus_used;
  for lot in
    select id, remaining_paise from public.noha_lots
    where user_id = uid and kind = 'cash' and remaining_paise > 0 and (expires_at is null or expires_at > now())
    order by expires_at nulls last, created_at
    for update
  loop
    exit when need = 0;
    take := least(need, lot.remaining_paise);
    update public.noha_lots set remaining_paise = remaining_paise - take where id = lot.id;
    need := need - take;
  end loop;
  if need > 0 then raise exception 'not enough Noha Money' using errcode = 'P0002'; end if;

  insert into public.noha_transactions (user_id, app, type, amount_paise, bonus_paise, balance_after_paise, description, reference, idempotency_key)
  values (uid, p_app, 'purchase', -p_amount, bonus_used, bal.total_paise - p_amount, p_description, p_reference, p_idempotency_key)
  returning id into txn;
  return txn;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Buying a product with Noha Money (what the apps call).

create function public.noha_buy(p_product_id text, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prod public.noha_products;
  txn uuid;
  days integer;
  new_expiry timestamptz;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if length(coalesce(p_idempotency_key, '')) < 8 then raise exception 'idempotency key required'; end if;
  select * into prod from public.noha_products where id = p_product_id and active;
  if not found then raise exception 'unknown product'; end if;

  -- Keys are scoped to the person so one user can't block another's key.
  txn := public.noha_debit(uid, prod.app, prod.price_paise, prod.price_paise * prod.max_bonus_pct / 100,
                           prod.name, prod.id, uid::text || ':' || p_idempotency_key);

  days := (prod.grants ->> 'premium_days')::integer;
  if days is not null then
    -- Only extend once per transaction (a retried call returns the same transaction).
    if not exists (select 1 from public.premium_grants g where g.user_id = uid and g.product_id = prod.id || ':' || txn::text) then
      select greatest(now(), coalesce((select expires_at from public.premium_grants where user_id = uid), now())) + make_interval(days => days)
        into new_expiry;
      insert into public.premium_grants (user_id, expires_at, product_id, updated_at)
      values (uid, new_expiry, prod.id || ':' || txn::text, now())
      on conflict (user_id) do update set expires_at = excluded.expires_at, product_id = excluded.product_id, updated_at = now();
    end if;
  end if;

  return jsonb_build_object(
    'transaction_id', txn,
    'premium_until', (select expires_at from public.premium_grants where user_id = uid),
    'balance_paise', (select total_paise from public.noha_balance_of(uid)));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Expiry: turns expired, unspent credit into 'expiry' transactions so the ledger adds up.
-- Run daily (Supabase → Integrations → Cron): select public.noha_expire_lots();

create function public.noha_expire_lots() returns integer
language plpgsql security definer set search_path = public as $$
declare
  lot record;
  n integer := 0;
  bal integer;
begin
  for lot in
    select * from public.noha_lots where remaining_paise > 0 and expires_at is not null and expires_at <= now() for update
  loop
    perform pg_advisory_xact_lock(hashtext('noha:' || lot.user_id::text));
    update public.noha_lots set remaining_paise = 0 where id = lot.id;
    select total_paise into bal from public.noha_balance_of(lot.user_id);
    insert into public.noha_transactions (user_id, app, type, amount_paise, bonus_paise, balance_after_paise, description, reference, idempotency_key)
    values (lot.user_id, 'asanoha', 'expiry', -lot.remaining_paise, case when lot.kind = 'bonus' then lot.remaining_paise else 0 end,
            bal, 'Expired after 12 months', lot.id::text, 'expiry:' || lot.id::text);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Premium from any source (store via RevenueCat, or Noha Money).

create or replace function public.is_premium(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select premium and (expires_at is null or expires_at > now()) from public.user_entitlements where user_id = uid), false)
      or exists (select 1 from public.premium_grants where user_id = uid and expires_at > now());
$$;

-- What the app asks: am I Premium, until when, and from where?
create function public.my_premium() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'premium', public.is_premium(auth.uid()),
    'noha_until', (select expires_at from public.premium_grants where user_id = auth.uid() and expires_at > now()));
$$;

-- Permissions: crediting, debiting and expiry are server-only.
revoke execute on function public.noha_balance_of(uuid) from public, anon, authenticated;
revoke execute on function public.noha_credit(uuid, text, text, integer, text, timestamptz, text, text, text) from public, anon, authenticated;
revoke execute on function public.noha_debit(uuid, text, integer, integer, text, text, text) from public, anon, authenticated;
revoke execute on function public.noha_expire_lots() from public, anon, authenticated;
revoke execute on function public.noha_balance() from public, anon;
revoke execute on function public.noha_buy(text, text) from public, anon;
revoke execute on function public.my_premium() from public, anon;
grant execute on function public.noha_balance() to authenticated;
grant execute on function public.noha_buy(text, text) to authenticated;
grant execute on function public.my_premium() to authenticated;
grant execute on function public.noha_credit(uuid, text, text, integer, text, timestamptz, text, text, text) to service_role;
grant execute on function public.noha_debit(uuid, text, integer, integer, text, text, text) to service_role;
grant execute on function public.noha_balance_of(uuid) to service_role;
grant execute on function public.noha_expire_lots() to service_role;
