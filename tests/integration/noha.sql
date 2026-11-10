\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, aud, role) values
 ('aaaaaaaa-0000-4000-8000-000000000001','a@test.dev','authenticated','authenticated'),
 ('aaaaaaaa-0000-4000-8000-000000000002','b@test.dev','authenticated','authenticated');
-- credits: ₹100 cash, ₹100 cashback (bonus)
select public.noha_credit('aaaaaaaa-0000-4000-8000-000000000001','asanoha','topup',10000,'cash',now()+interval '365 days','Added via UPI','utr1','topup:1');
select public.noha_credit('aaaaaaaa-0000-4000-8000-000000000001','asanoha','topup',10000,'cash',now()+interval '365 days','Added via UPI','utr1','topup:1'); -- duplicate, ignored
select public.noha_credit('aaaaaaaa-0000-4000-8000-000000000001','asanoha','cashback',10000,'bonus',now()+interval '365 days','10% back','ORD1','cb:1');

select * from public.noha_balance_of('aaaaaaaa-0000-4000-8000-000000000001');

-- act as user A
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}',true);
select * from public.noha_balance();
select public.noha_buy('wearday_premium_monthly','key-123456');   -- ₹99: up to ₹14.85 cashback, rest cash
select public.noha_buy('wearday_premium_monthly','key-123456');   -- retry: same txn, no double charge
select * from public.noha_balance();
select public.my_premium();
select type, amount_paise, bonus_paise, balance_after_paise, app from public.noha_transactions order by created_at, amount_paise;
-- user can't credit themselves
do $$ begin
  perform public.noha_credit(auth.uid(),'wearday','topup',100000,'cash',null,'free','x','hack:1');
  raise exception 'SHOULD NOT REACH';
exception when insufficient_privilege then raise notice 'credit blocked for users: ok';
end $$;
-- can't buy beyond balance
do $$ begin
  perform public.noha_buy('wearday_premium_yearly','key-999999');
  raise exception 'SHOULD NOT REACH';
exception when sqlstate 'P0002' then raise notice 'insufficient funds blocked: ok';
end $$;
-- user B sees nothing of A
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-4000-8000-000000000002","role":"authenticated"}',true);
select count(*) as b_sees_txns from public.noha_transactions;
select count(*) as b_sees_lots from public.noha_lots;
reset role;
select public.noha_expire_lots() as expired_lots;
rollback;
