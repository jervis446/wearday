-- Payment records outlive the account (20261111100000_noha_keep_payment_records).
-- Recreates the live database's older links first, applies the fix, then deletes an account.
-- Run (it includes the migration by relative path, so copy both and run by file name):
--   docker exec supabase_db_fits-clone mkdir -p /work/tests/integration /work/supabase/migrations
--   docker cp tests/integration/noha_retention.sql supabase_db_fits-clone:/work/tests/integration/
--   docker cp supabase/migrations/20261111100000_noha_keep_payment_records.sql supabase_db_fits-clone:/work/supabase/migrations/
--   docker exec supabase_db_fits-clone psql -U postgres -q -f /work/tests/integration/noha_retention.sql
\set ON_ERROR_STOP on
begin;

-- The links the live database had before the fix
alter table public.noha_transactions drop constraint if exists noha_transactions_user_id_fkey;
alter table public.noha_transactions add constraint noha_transactions_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.noha_orders drop constraint if exists noha_orders_user_id_fkey;
alter table public.noha_orders add constraint noha_orders_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.noha_lots drop constraint noha_lots_transaction_id_fkey;
alter table public.noha_lots add constraint noha_lots_transaction_id_fkey foreign key (transaction_id) references public.noha_transactions (id);

\ir ../../supabase/migrations/20261111100000_noha_keep_payment_records.sql
-- Applying it twice is harmless
\ir ../../supabase/migrations/20261111100000_noha_keep_payment_records.sql

insert into auth.users (id, email, aud, role) values
  ('cccccccc-0000-4000-8000-000000000001', 'leaver@test.dev', 'authenticated', 'authenticated');
select public.noha_credit('cccccccc-0000-4000-8000-000000000001', 'wearday', 'topup', 5000, 'cash', now() + interval '365 days', 'Added via UPI', 'utr9', 'retention:1');
insert into public.noha_orders (user_id, app, amount_paise, status) values ('cccccccc-0000-4000-8000-000000000001', 'wearday', 5000, 'paid');

delete from auth.users where id = 'cccccccc-0000-4000-8000-000000000001';

do $$
begin
  if (select count(*) from public.noha_transactions where user_id = 'cccccccc-0000-4000-8000-000000000001') <> 1 then
    raise exception 'transactions must be kept after the account is deleted';
  end if;
  if (select count(*) from public.noha_orders where user_id = 'cccccccc-0000-4000-8000-000000000001') <> 1 then
    raise exception 'payment orders must be kept after the account is deleted';
  end if;
  if (select count(*) from public.noha_lots where user_id = 'cccccccc-0000-4000-8000-000000000001') <> 0 then
    raise exception 'the spendable balance (lots) goes with the account';
  end if;
end $$;

-- Purging an old transaction (after the retention period) also removes the lot it created
insert into auth.users (id, email, aud, role) values
  ('cccccccc-0000-4000-8000-000000000002', 'stayer@test.dev', 'authenticated', 'authenticated');
select public.noha_credit('cccccccc-0000-4000-8000-000000000002', 'wearday', 'topup', 700, 'cash', null, 'Added via UPI', 'utr10', 'retention:2');
delete from public.noha_transactions where idempotency_key = 'retention:2';
do $$
begin
  if exists (select 1 from public.noha_lots where user_id = 'cccccccc-0000-4000-8000-000000000002') then
    raise exception 'lots must go with their transaction';
  end if;
end $$;
select 'retention ok' as result;

rollback;
