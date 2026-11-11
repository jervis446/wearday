-- Friends and "Rate my fit": people share outfit photos with friends, and friends react.
-- Everything is friends-only. There are no public posts, no search, and no way to list users:
-- you can only find someone by their exact username. Only a post's author sees its ratings.

-- ---------- profiles ----------

create table public.wearday_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z0-9_.]{3,20}$' and username !~ '^\.|\.$|\.\.'),
  display_name text not null
    check (char_length(display_name) between 1 and 40 and display_name = btrim(display_name) and display_name !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now()
);

alter table public.wearday_profiles enable row level security;
revoke all on public.wearday_profiles from anon, authenticated;
grant select, delete on public.wearday_profiles to authenticated;
grant insert (username, display_name), update (username, display_name) on public.wearday_profiles to authenticated;

-- ---------- friendships and blocks ----------

-- One row per pair. A request is 'pending' until the other person accepts it.
create table public.friendships (
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);

create unique index friendships_one_per_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index friendships_addressee on public.friendships (addressee, requester);

alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;
-- All changes go through the functions below.

create table public.blocks (
  blocker uuid not null references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

create index blocks_blocked on public.blocks (blocked, blocker);

alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;
grant select on public.blocks to authenticated;

-- Whether the signed-in user and `other` are friends. Blocking removes the friendship, so a
-- block never needs checking here. Only answers about the caller's own friendships.
create function public.is_friend(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = auth.uid() and f.addressee = other) or (f.addressee = auth.uid() and f.requester = other))
  );
$$;

create policy "See own and friends' profiles" on public.wearday_profiles for select to authenticated
  using (user_id = (select auth.uid()) or public.is_friend(user_id));
create policy "Create own profile" on public.wearday_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Edit own profile" on public.wearday_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Delete own profile" on public.wearday_profiles for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "See own friendships" on public.friendships for select to authenticated
  using (requester = (select auth.uid()) or addressee = (select auth.uid()));
create policy "See own blocks" on public.blocks for select to authenticated
  using (blocker = (select auth.uid()));

-- Sends a request by exact username. If they already asked you, this accepts it.
-- Returns 'sent', 'accepted', 'pending' (already asked) or 'already_friends'.
create function public.send_friend_request(target_username text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  target uuid;
  existing public.friendships;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if not exists (select 1 from public.wearday_profiles where user_id = me) then
    raise exception 'Choose a username first';
  end if;

  select user_id into target from public.wearday_profiles where username = lower(btrim(target_username));
  -- Someone who blocked you looks exactly like a username that doesn't exist.
  if target is null or exists (select 1 from public.blocks where blocker = target and blocked = me) then
    raise exception 'No one has that username';
  end if;
  if target = me then
    raise exception 'That’s your own username';
  end if;
  if exists (select 1 from public.blocks where blocker = me and blocked = target) then
    raise exception 'You blocked this person. Unblock them first.';
  end if;

  select * into existing from public.friendships
  where (requester = me and addressee = target) or (requester = target and addressee = me)
  for update;
  if found then
    if existing.status = 'accepted' then
      return 'already_friends';
    end if;
    if existing.requester = me then
      return 'pending';
    end if;
    update public.friendships set status = 'accepted', responded_at = now()
    where requester = target and addressee = me;
    return 'accepted';
  end if;

  if (select count(*) from public.friendships where requester = me and created_at > now() - interval '1 day') >= 50 then
    raise exception 'You’ve sent a lot of friend requests today. Try again tomorrow.';
  end if;

  insert into public.friendships (requester, addressee) values (me, target);
  return 'sent';
exception
  -- Both people sent a request at the same moment: the other one won, so this is pending.
  when unique_violation then
    return 'pending';
end $$;

-- Accepts or declines a request someone sent you.
create function public.respond_friend_request(from_user uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if accept then
    update public.friendships set status = 'accepted', responded_at = now()
    where requester = from_user and addressee = me and status = 'pending';
  else
    delete from public.friendships where requester = from_user and addressee = me and status = 'pending';
  end if;
  if not found then
    raise exception 'That request is no longer there';
  end if;
end $$;

-- Unfriends, or cancels a request you sent.
create function public.remove_friend(other uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from public.friendships
  where (requester = auth.uid() and addressee = other) or (requester = other and addressee = auth.uid());
end $$;

-- Blocking removes any friendship or request, hides each other's posts, and stops new requests.
create function public.block_user(other uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if other = auth.uid() then
    raise exception 'You can’t block yourself';
  end if;
  insert into public.blocks (blocker, blocked) values (auth.uid(), other) on conflict do nothing;
  delete from public.friendships
  where (requester = auth.uid() and addressee = other) or (requester = other and addressee = auth.uid());
exception
  when foreign_key_violation then
    raise exception 'That account no longer exists';
end $$;

create function public.unblock_user(other uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from public.blocks where blocker = auth.uid() and blocked = other;
end $$;

-- Your friends and pending requests with their public names. Profiles of people you only have a
-- pending request with aren't readable directly, so this returns just the two name fields.
create function public.friend_list()
returns table (user_id uuid, username text, display_name text, relation text, since timestamptz)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.username, p.display_name,
         case when f.status = 'accepted' then 'friend' when f.requester = auth.uid() then 'outgoing' else 'incoming' end,
         coalesce(f.responded_at, f.created_at)
  from public.friendships f
  join public.wearday_profiles p on p.user_id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where f.requester = auth.uid() or f.addressee = auth.uid()
  order by 4, p.display_name;
$$;

create function public.blocked_list()
returns table (user_id uuid, username text, display_name text)
language sql stable security definer set search_path = public as $$
  select b.blocked, p.username, p.display_name
  from public.blocks b
  left join public.wearday_profiles p on p.user_id = b.blocked
  where b.blocker = auth.uid()
  order by b.created_at desc;
$$;

-- ---------- fit posts, ratings and reports ----------

create function public.valid_item_names(names text[]) returns boolean
language sql immutable set search_path = public as $$
  select cardinality(names) <= 8
     and coalesce((select bool_and(char_length(n) between 1 and 60 and n = btrim(n)) from unnest(names) as n), true);
$$;

create table public.fit_posts (
  id uuid primary key default gen_random_uuid(),
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- fits/<author>/<uuid>.jpg in Storage.
  photo_path text not null unique,
  caption text check (caption is null or (char_length(caption) between 1 and 200 and caption = btrim(caption))),
  item_names text[] not null default '{}' check (public.valid_item_names(item_names)),
  created_at timestamptz not null default now(),
  report_count integer not null default 0,
  -- Set automatically after enough reports; cleared by a moderator.
  hidden boolean not null default false,
  check (photo_path ~ ('^' || author::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'))
);

create index fit_posts_author_created on public.fit_posts (author, created_at desc);

alter table public.fit_posts enable row level security;
revoke all on public.fit_posts from anon, authenticated;
grant select, delete on public.fit_posts to authenticated;
grant insert (photo_path, caption, item_names) on public.fit_posts to authenticated;

create table public.fit_ratings (
  post_id uuid not null references public.fit_posts (id) on delete cascade,
  rater uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reaction text not null check (reaction in ('fire', 'nice', 'nope')),
  comment text check (comment is null or (char_length(comment) between 1 and 140 and comment = btrim(comment))),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, rater)
);

create index fit_ratings_rater on public.fit_ratings (rater);

alter table public.fit_ratings enable row level security;
revoke all on public.fit_ratings from anon, authenticated;
grant select, delete on public.fit_ratings to authenticated;
grant insert (post_id, reaction, comment), update (reaction, comment) on public.fit_ratings to authenticated;

create table public.fit_reports (
  post_id uuid not null references public.fit_posts (id) on delete cascade,
  reporter uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null check (reason in ('inappropriate', 'harassment', 'spam', 'other')),
  created_at timestamptz not null default now(),
  primary key (post_id, reporter)
);

create index fit_reports_reporter on public.fit_reports (reporter, created_at);

alter table public.fit_reports enable row level security;
revoke all on public.fit_reports from anon, authenticated;
grant select on public.fit_reports to authenticated;
grant insert (post_id, reason) on public.fit_reports to authenticated;

-- Daily limits, counted on the server.
create function public.fits_posted_today() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.fit_posts where author = auth.uid() and created_at > now() - interval '1 day';
$$;

create function public.reports_sent_today() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.fit_reports where reporter = auth.uid() and created_at > now() - interval '1 day';
$$;

-- Reads reports outside their own access rules, so the fit and report rules don't loop.
create function public.reported_by_me(post uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.fit_reports where post_id = post and reporter = auth.uid());
$$;

-- Friends see a post unless it was hidden after reports or they reported it themselves.
create policy "See own and friends' fits" on public.fit_posts for select to authenticated
  using (
    author = (select auth.uid())
    or (
      not hidden
      and public.is_friend(author)
      and not public.reported_by_me(id)
    )
  );
create policy "Post own fits" on public.fit_posts for insert to authenticated
  with check (author = (select auth.uid()) and public.fits_posted_today() < 20);
create policy "Delete own fits" on public.fit_posts for delete to authenticated
  using (author = (select auth.uid()));

-- The post lookups below run with the caller's access, so they only match fits the caller can see.
create policy "See own ratings and ratings on own fits" on public.fit_ratings for select to authenticated
  using (
    rater = (select auth.uid())
    or (
      exists (select 1 from public.fit_posts p where p.id = post_id and p.author = (select auth.uid()))
      and not exists (select 1 from public.blocks b where b.blocker = (select auth.uid()) and b.blocked = rater)
    )
  );
create policy "Rate friends' fits" on public.fit_ratings for insert to authenticated
  with check (
    rater = (select auth.uid())
    and exists (select 1 from public.fit_posts p where p.id = post_id and p.author <> (select auth.uid()))
  );
create policy "Change own rating" on public.fit_ratings for update to authenticated
  using (rater = (select auth.uid()))
  with check (
    rater = (select auth.uid())
    and exists (select 1 from public.fit_posts p where p.id = post_id and p.author <> (select auth.uid()))
  );
create policy "Remove own rating" on public.fit_ratings for delete to authenticated
  using (rater = (select auth.uid()));

create policy "See own reports" on public.fit_reports for select to authenticated
  using (reporter = (select auth.uid()));
create policy "Report friends' fits" on public.fit_reports for insert to authenticated
  with check (
    reporter = (select auth.uid())
    and public.reports_sent_today() < 20
    and exists (select 1 from public.fit_posts p where p.id = post_id and p.author <> (select auth.uid()))
  );

create function public.touch_fit_rating() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger fit_ratings_touch before update on public.fit_ratings
for each row execute function public.touch_fit_rating();

-- Three reports from different people hide a post until a moderator looks at it.
create function public.count_fit_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.fit_posts
  set report_count = report_count + 1,
      hidden = hidden or report_count + 1 >= 3
  where id = new.post_id;
  return new;
end $$;

create trigger fit_reports_count after insert on public.fit_reports
for each row execute function public.count_fit_report();

-- Adds or changes your reaction to a friend's fit. Only the reaction and comment can change.
create function public.rate_fit(post uuid, reaction text, comment text default null) returns void
language sql security invoker set search_path = public as $$
  insert into public.fit_ratings (post_id, reaction, comment)
  values (post, reaction, nullif(btrim(comment), ''))
  on conflict (post_id, rater) do update set reaction = excluded.reaction, comment = excluded.comment;
$$;

-- Friends' fits, newest first, with your own rating. Runs with the caller's access.
create function public.fit_feed(before timestamptz default null, max_rows integer default 20)
returns table (
  id uuid, author uuid, username text, display_name text, photo_path text, caption text,
  item_names text[], created_at timestamptz, my_reaction text, my_comment text
)
language sql stable security invoker set search_path = public as $$
  select p.id, p.author, pr.username, pr.display_name, p.photo_path, p.caption, p.item_names, p.created_at,
         r.reaction, r.comment
  from public.fit_posts p
  join public.wearday_profiles pr on pr.user_id = p.author
  left join public.fit_ratings r on r.post_id = p.id and r.rater = auth.uid()
  where p.author in (
      select case when f.requester = auth.uid() then f.addressee else f.requester end
      from public.friendships f
      where f.status = 'accepted' and (f.requester = auth.uid() or f.addressee = auth.uid())
    )
    and (before is null or p.created_at < before)
  order by p.created_at desc
  limit least(greatest(max_rows, 1), 50);
$$;

-- Your own fits with reaction totals.
create function public.my_fits(before timestamptz default null, max_rows integer default 20)
returns table (
  id uuid, photo_path text, caption text, item_names text[], created_at timestamptz, hidden boolean,
  fire integer, nice integer, nope integer, comments integer
)
language sql stable security invoker set search_path = public as $$
  select p.id, p.photo_path, p.caption, p.item_names, p.created_at, p.hidden,
         count(r.*) filter (where r.reaction = 'fire')::int,
         count(r.*) filter (where r.reaction = 'nice')::int,
         count(r.*) filter (where r.reaction = 'nope')::int,
         count(r.comment)::int
  from public.fit_posts p
  left join public.fit_ratings r on r.post_id = p.id
  where p.author = auth.uid() and (before is null or p.created_at < before)
  group by p.id
  order by p.created_at desc
  limit least(greatest(max_rows, 1), 50);
$$;

-- Who reacted to one of your fits. Names show only for current friends.
create function public.fit_ratings_for(post uuid)
returns table (rater uuid, username text, display_name text, reaction text, comment text, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select r.rater, pr.username, pr.display_name, r.reaction, r.comment, r.updated_at
  from public.fit_ratings r
  join public.fit_posts p on p.id = r.post_id and p.author = auth.uid()
  left join public.wearday_profiles pr on pr.user_id = r.rater
  where r.post_id = post
  order by r.updated_at desc;
$$;

-- For the badge on the Friends button: incoming requests, and reactions on your fits since `since`.
create function public.social_activity(since timestamptz)
returns table (requests integer, reactions integer)
language sql stable security invoker set search_path = public as $$
  select
    (select count(*)::int from public.friendships where addressee = auth.uid() and status = 'pending'),
    (select count(*)::int from public.fit_ratings r
       join public.fit_posts p on p.id = r.post_id and p.author = auth.uid()
       where r.updated_at > since and r.rater <> auth.uid());
$$;

-- Only signed-in users may call any of these.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'is_friend(uuid)', 'send_friend_request(text)', 'respond_friend_request(uuid, boolean)', 'remove_friend(uuid)',
    'block_user(uuid)', 'unblock_user(uuid)', 'friend_list()', 'blocked_list()', 'fits_posted_today()',
    'reports_sent_today()', 'reported_by_me(uuid)', 'rate_fit(uuid, text, text)', 'fit_feed(timestamptz, integer)', 'my_fits(timestamptz, integer)',
    'fit_ratings_for(uuid)', 'social_activity(timestamptz)'
  ] loop
    execute format('revoke execute on function public.%s from anon, public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

revoke execute on function public.count_fit_report() from anon, public, authenticated;
revoke execute on function public.touch_fit_rating() from anon, public, authenticated;

-- ---------- storage: fits/<user id>/<uuid>.jpg ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fits', 'fits', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy "Upload own fit photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'fits' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- A friend can read a photo only while a post they're allowed to see points to it.
create policy "Read own and friends' fit photos" on storage.objects for select to authenticated
  using (
    bucket_id = 'fits'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (select 1 from public.fit_posts p where p.photo_path = name)
    )
  );
create policy "Delete own fit photos" on storage.objects for delete to authenticated
  using (bucket_id = 'fits' and (storage.foldername(name))[1] = (select auth.uid())::text);
