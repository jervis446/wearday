-- Premium status, written only by the RevenueCat webhook (service role), and the free-plan sync limit.

create table public.user_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  premium boolean not null default false,
  -- null with premium = true means a non-expiring purchase.
  expires_at timestamptz,
  product_id text,
  -- Timestamp of the RevenueCat event that last changed this row (ignore older events).
  last_event_ms bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_entitlements enable row level security;

-- People can read their own status; only the server (service role, which bypasses RLS) can write.
create policy "Read own entitlement" on public.user_entitlements for select to authenticated
  using (user_id = (select auth.uid()));

create function public.is_premium(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select premium and (expires_at is null or expires_at > now())
     from public.user_entitlements where user_id = uid),
    false);
$$;

revoke execute on function public.is_premium(uuid) from anon, public;
grant execute on function public.is_premium(uuid) to authenticated;

-- Same as before, plus the free plan limit: a free account can't grow past 50 items.
-- Edits and deletes are always allowed, so people whose Premium lapsed never lose access to what they have.
create or replace function public.push_docs(docs jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  changed integer;
  items_before integer;
  items_after integer;
  free_limit constant integer := 50; -- keep in sync with FREE_LIMITS.syncItems in src/lib/plans.ts
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if jsonb_array_length(docs) > 500 then
    raise exception 'too many docs in one batch (max 500)';
  end if;

  select count(*) into items_before from public.wardrobe_docs
  where user_id = auth.uid() and kind = 'item' and not deleted;

  insert into public.wardrobe_docs as w (user_id, kind, id, data, deleted, client_updated_at)
  select auth.uid(), d ->> 'kind', d ->> 'id',
         case when coalesce((d ->> 'deleted')::boolean, false) then null else d -> 'data' end,
         coalesce((d ->> 'deleted')::boolean, false),
         (d ->> 'updated_at')::bigint
  from jsonb_array_elements(docs) as d
  on conflict (user_id, kind, id) do update
    set data = excluded.data,
        deleted = excluded.deleted,
        client_updated_at = excluded.client_updated_at
    where excluded.client_updated_at > w.client_updated_at;
  get diagnostics changed = row_count;

  select count(*) into items_after from public.wardrobe_docs
  where user_id = auth.uid() and kind = 'item' and not deleted;

  if items_after > free_limit and items_after > items_before and not public.is_premium(auth.uid()) then
    -- Raising rolls back this whole batch.
    raise exception 'free plan limit: % items (max %)', items_after, free_limit using errcode = 'P0001';
  end if;
  return changed;
end $$;
