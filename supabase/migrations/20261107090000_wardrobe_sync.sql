-- Wearday cloud sync.
-- Every wardrobe record (item, outfit, calendar entry, trip, collection) is one row, owned by
-- the signed-in user. Row Level Security makes sure people can only ever see their own rows.

create table public.wardrobe_docs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('item', 'outfit', 'log', 'trip', 'collection')),
  id text not null check (char_length(id) between 1 and 64),
  data jsonb check (data is null or octet_length(data::text) < 200000),
  deleted boolean not null default false,
  -- Client clock (ms) of the edit; the newer edit wins.
  client_updated_at bigint not null,
  -- Server-assigned, always increasing; clients pull "everything after the last seq I saw".
  seq bigint not null default 0,
  primary key (user_id, kind, id)
);

create index wardrobe_docs_user_seq on public.wardrobe_docs (user_id, seq);

create sequence public.wardrobe_docs_seq;

create function public.wardrobe_docs_bump_seq() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.seq := nextval('public.wardrobe_docs_seq');
  return new;
end $$;

create trigger wardrobe_docs_bump_seq before insert or update on public.wardrobe_docs
for each row execute function public.wardrobe_docs_bump_seq();

alter table public.wardrobe_docs enable row level security;

create policy "Read own docs" on public.wardrobe_docs for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Insert own docs" on public.wardrobe_docs for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Update own docs" on public.wardrobe_docs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Delete own docs" on public.wardrobe_docs for delete to authenticated
  using (user_id = (select auth.uid()));

-- Upload a batch of changes. A change only applies if it is newer than what the server has,
-- so an old offline edit can't overwrite a newer one. Returns how many rows changed.
create function public.push_docs(docs jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  changed integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if jsonb_array_length(docs) > 500 then
    raise exception 'too many docs in one batch (max 500)';
  end if;
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
  return changed;
end $$;

grant execute on function public.push_docs(jsonb) to authenticated;
revoke execute on function public.push_docs(jsonb) from anon, public;

-- Lets a signed-in user delete their own account and all their data (required by the app stores).
-- Photos are removed by the app through the Storage API first.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

grant execute on function public.delete_my_account() to authenticated;
revoke execute on function public.delete_my_account() from anon, public;

-- Private bucket for clothing photos and selfies: photos/<user id>/<file name>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "Read own photos" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Upload own photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Update own photos" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Delete own photos" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
