-- The live database was created from an earlier draft of 20261110090000_noha_money, in which payment
-- records were linked to the account with ON DELETE CASCADE: deleting an account also deleted its
-- Noha Money transactions and payment orders. They must be kept for 8 years after the transaction
-- (see the privacy policy), so the link goes. This makes any database match noha_money as it is now;
-- on one built from the current file it changes nothing.

alter table public.noha_transactions drop constraint if exists noha_transactions_user_id_fkey;
alter table public.noha_orders drop constraint if exists noha_orders_user_id_fkey;

-- A lot belongs to the transaction that created it; purging old transactions later removes their lots.
alter table public.noha_lots drop constraint if exists noha_lots_transaction_id_fkey;
alter table public.noha_lots
  add constraint noha_lots_transaction_id_fkey foreign key (transaction_id)
  references public.noha_transactions (id) on delete cascade;
