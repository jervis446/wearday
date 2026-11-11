// Friends and "Rate my fit" access rules, against the local Supabase (npx supabase start).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);

type Person = { c: SupabaseClient; id: string; username: string };

let n = 0;
async function person(name: string, withProfile = true): Promise<Person> {
  const tag = `${name}${Date.now().toString(36)}${n++}`;
  const email = `${tag}@test.local`;
  assert.ifError((await admin.auth.admin.createUser({ email, password: 'pw-123456', email_confirm: true })).error);
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'pw-123456' });
  assert.ifError(error);
  const username = tag.toLowerCase().slice(0, 20);
  if (withProfile) assert.ifError((await c.from('wearday_profiles').insert({ username, display_name: name }).select().single()).error);
  return { c, id: data.user!.id, username };
}

async function befriend(a: Person, b: Person) {
  assert.equal((await a.c.rpc('send_friend_request', { target_username: b.username })).data, 'sent');
  assert.ifError((await b.c.rpc('respond_friend_request', { from_user: a.id, accept: true })).error);
}

async function postFit(p: Person, caption = 'Monday fit') {
  const path = `${p.id}/${randomUUID()}.jpg`;
  assert.ifError((await p.c.storage.from('fits').upload(path, JPEG, { contentType: 'image/jpeg' })).error);
  const { data, error } = await p.c.from('fit_posts').insert({ photo_path: path, caption, item_names: ['White tee', 'Jeans'] }).select('id').single();
  assert.ifError(error);
  return { id: data!.id as string, path };
}

const canSeePost = async (p: Person, id: string) => ((await p.c.from('fit_posts').select('id').eq('id', id)).data ?? []).length === 1;
const canReadPhoto = async (p: Person, path: string) => !(await p.c.storage.from('fits').download(path)).error;

test('profiles: valid unique usernames, own row only, strangers are invisible', async () => {
  const a = await person('ana');
  const b = await person('ben');
  const c = await person('cy', false);

  for (const bad of ['ab', 'Has Space', 'UPPER', 'a..b', '.dot', 'dot.', 'x'.repeat(21), 'emoji😀'])
    assert.ok((await c.c.from('wearday_profiles').insert({ username: bad, display_name: 'Cy' })).error, `rejects ${bad}`);
  assert.ok((await c.c.from('wearday_profiles').insert({ username: a.username, display_name: 'Cy' })).error, 'username taken');
  assert.ok((await c.c.from('wearday_profiles').insert({ username: 'cy_ok', display_name: '  padded ' })).error, 'untrimmed name');
  // Can't create or edit a profile for someone else
  assert.ok((await c.c.from('wearday_profiles').insert({ user_id: a.id, username: 'cy_fake', display_name: 'x' })).error);
  await c.c.from('wearday_profiles').update({ display_name: 'hacked' }).eq('user_id', a.id);
  assert.equal((await admin.from('wearday_profiles').select('display_name').eq('user_id', a.id).single()).data!.display_name, 'ana');

  // Strangers can't read each other's profiles
  assert.equal(((await a.c.from('wearday_profiles').select('username').eq('user_id', b.id)).data ?? []).length, 0);
  await befriend(a, b);
  assert.equal(((await a.c.from('wearday_profiles').select('username').eq('user_id', b.id)).data ?? []).length, 1);
});

test('friend requests: by exact username, mutual requests accept, no direct writes', async () => {
  const a = await person('amy');
  const b = await person('bo');
  const c = await person('cal');

  assert.match((await a.c.rpc('send_friend_request', { target_username: 'nobody_here_xyz' })).error!.message, /No one has that username/);
  assert.match((await a.c.rpc('send_friend_request', { target_username: a.username })).error!.message, /your own username/);
  assert.equal((await a.c.rpc('send_friend_request', { target_username: `  ${b.username.toUpperCase()} ` })).data, 'sent');
  assert.equal((await a.c.rpc('send_friend_request', { target_username: b.username })).data, 'pending');

  const incoming = (await b.c.rpc('friend_list')).data!;
  assert.deepEqual(incoming.map((r: { relation: string; username: string }) => [r.relation, r.username]), [['incoming', a.username]]);
  assert.equal((await c.c.rpc('friend_list')).data!.length, 0, 'others see nothing');
  assert.equal(((await c.c.from('friendships').select('*')).data ?? []).length, 0);

  // B asking A back accepts the pending request
  assert.equal((await b.c.rpc('send_friend_request', { target_username: a.username })).data, 'accepted');
  assert.equal((await a.c.rpc('send_friend_request', { target_username: b.username })).data, 'already_friends');

  // No forging friendships directly
  assert.ok((await c.c.from('friendships').insert({ requester: c.id, addressee: a.id, status: 'accepted' })).error);
  assert.ok((await c.c.rpc('respond_friend_request', { from_user: a.id, accept: true })).error);

  // Declining removes the request
  assert.equal((await c.c.rpc('send_friend_request', { target_username: a.username })).data, 'sent');
  assert.ifError((await a.c.rpc('respond_friend_request', { from_user: c.id, accept: false })).error);
  assert.equal((await c.c.rpc('friend_list')).data!.length, 0);

  // A user without a profile can't send requests
  const d = await person('dee', false);
  assert.match((await d.c.rpc('send_friend_request', { target_username: a.username })).error!.message, /username first/);
});

test('fits are visible to friends only, with photos; posting is locked down', async () => {
  const a = await person('ari');
  const b = await person('bea');
  const stranger = await person('sam');
  await befriend(a, b);
  const fit = await postFit(a);

  assert.ok(await canSeePost(b, fit.id));
  assert.ok(await canReadPhoto(b, fit.path));
  const feed = (await b.c.rpc('fit_feed')).data!;
  assert.equal(feed.length, 1);
  assert.equal(feed[0].username, a.username);
  assert.equal(feed[0].caption, 'Monday fit');
  assert.ok(!('hidden' in feed[0]) && !('report_count' in feed[0]), 'no moderation fields in the feed');

  assert.equal(await canSeePost(stranger, fit.id), false);
  assert.equal(await canReadPhoto(stranger, fit.path), false);
  assert.equal((await stranger.c.rpc('fit_feed')).data!.length, 0);
  // Random files in someone's folder aren't readable even by friends unless a post points to them
  const loose = `${a.id}/${randomUUID()}.jpg`;
  await a.c.storage.from('fits').upload(loose, JPEG, { contentType: 'image/jpeg' });
  assert.equal(await canReadPhoto(b, loose), false);

  // Can't upload into someone else's folder, or post a photo path from it
  assert.ok((await stranger.c.storage.from('fits').upload(`${a.id}/${randomUUID()}.jpg`, JPEG, { contentType: 'image/jpeg' })).error);
  assert.ok((await stranger.c.from('fit_posts').insert({ photo_path: fit.path })).error);
  assert.ok((await stranger.c.from('fit_posts').insert({ photo_path: `${stranger.id}/../${a.id}/x.jpg` })).error);
  // Only JPEGs, and moderation fields can't be set by users
  assert.ok((await a.c.storage.from('fits').upload(`${a.id}/${randomUUID()}.png`, JPEG, { contentType: 'image/png' })).error);
  assert.ok((await a.c.from('fit_posts').insert({ photo_path: `${a.id}/${randomUUID()}.jpg`, hidden: false, report_count: -5 })).error);
  await a.c.from('fit_posts').update({ hidden: false, caption: 'edited' }).eq('id', fit.id);
  assert.equal((await admin.from('fit_posts').select('caption').eq('id', fit.id).single()).data!.caption, 'Monday fit');
  // Bad captions and item lists are refused
  assert.ok((await a.c.from('fit_posts').insert({ photo_path: `${a.id}/${randomUUID()}.jpg`, caption: 'x'.repeat(201) })).error);
  assert.ok((await a.c.from('fit_posts').insert({ photo_path: `${a.id}/${randomUUID()}.jpg`, item_names: Array(9).fill('Tee') })).error);

  // Friends can't delete someone else's fit or photo
  await b.c.from('fit_posts').delete().eq('id', fit.id);
  await b.c.storage.from('fits').remove([fit.path]);
  assert.ok(await canSeePost(a, fit.id));
  assert.ok(await canReadPhoto(a, fit.path));

  // Unfriending removes access straight away
  assert.ifError((await b.c.rpc('remove_friend', { other: a.id })).error);
  assert.equal(await canSeePost(b, fit.id), false);
  assert.equal(await canReadPhoto(b, fit.path), false);
});

test('ratings: friends rate, only the author sees everyone’s, nobody rates their own', async () => {
  const a = await person('alex');
  const b = await person('bree');
  const d = await person('dan');
  const stranger = await person('stan');
  await befriend(a, b);
  await befriend(a, d);
  const fit = await postFit(a);

  assert.ifError((await b.c.rpc('rate_fit', { post: fit.id, reaction: 'fire', comment: 'Love it' })).error);
  assert.ifError((await d.c.rpc('rate_fit', { post: fit.id, reaction: 'nope' })).error);
  assert.ifError((await b.c.rpc('rate_fit', { post: fit.id, reaction: 'nice', comment: 'Changed my mind' })).error);

  assert.ok((await a.c.rpc('rate_fit', { post: fit.id, reaction: 'fire' })).error, 'no rating own fit');
  assert.ok((await stranger.c.rpc('rate_fit', { post: fit.id, reaction: 'fire' })).error, 'strangers can’t rate');
  // Direct upserts can't move a rating to another post (post_id isn't updatable)
  assert.ok((await b.c.from('fit_ratings').upsert({ post_id: fit.id, reaction: 'fire' })).error);
  assert.ok((await stranger.c.from('fit_ratings').insert({ post_id: fit.id, reaction: 'fire' })).error, 'strangers can’t rate');
  assert.ok((await b.c.rpc('rate_fit', { post: fit.id, reaction: 'meh' })).error, 'unknown reaction');
  assert.ok((await b.c.rpc('rate_fit', { post: fit.id, reaction: 'fire', comment: 'x'.repeat(141) })).error);
  assert.ok((await b.c.from('fit_ratings').insert({ post_id: fit.id, rater: d.id, reaction: 'fire' })).error, 'can’t rate as someone else');

  // Friends only see their own rating
  const seenByB = (await b.c.from('fit_ratings').select('rater, reaction')).data!;
  assert.deepEqual(seenByB, [{ rater: b.id, reaction: 'nice' }]);
  assert.equal((await b.c.rpc('fit_feed')).data![0].my_reaction, 'nice');

  // The author sees all of them, with names
  const all = (await a.c.rpc('fit_ratings_for', { post: fit.id })).data!;
  assert.deepEqual(all.map((r: { username: string; reaction: string }) => [r.username, r.reaction]).sort(), [[b.username, 'nice'], [d.username, 'nope']].sort());
  const mine = (await a.c.rpc('my_fits')).data![0];
  assert.deepEqual([mine.fire, mine.nice, mine.nope, mine.comments], [0, 1, 1, 1]);
  assert.equal((await b.c.rpc('fit_ratings_for', { post: fit.id })).data!.length, 0, 'friends can’t list ratings');

  const activity = (await a.c.rpc('social_activity', { since: new Date(Date.now() - 60_000).toISOString() })).data![0];
  assert.deepEqual(activity, { requests: 0, reactions: 2 });

  // Removing a rating
  assert.ifError((await d.c.from('fit_ratings').delete().eq('post_id', fit.id)).error);
  assert.equal((await a.c.rpc('fit_ratings_for', { post: fit.id })).data!.length, 1);
});

test('three reports hide a fit; a reporter stops seeing it at once', async () => {
  const a = await person('ash');
  const friends = await Promise.all(['f1', 'f2', 'f3', 'f4'].map((t) => person(t)));
  for (const f of friends) await befriend(a, f);
  const fit = await postFit(a);

  assert.ifError((await friends[0].c.from('fit_reports').insert({ post_id: fit.id, reason: 'spam' })).error);
  assert.equal(await canSeePost(friends[0], fit.id), false, 'hidden for the reporter');
  assert.ok(await canSeePost(friends[3], fit.id), 'still visible to others after one report');
  assert.ok((await friends[0].c.from('fit_reports').insert({ post_id: fit.id, reason: 'spam' })).error, 'one report each');
  assert.ok((await a.c.from('fit_reports').insert({ post_id: fit.id, reason: 'spam' })).error, 'can’t report your own');
  assert.ok((await friends[1].c.from('fit_reports').insert({ post_id: fit.id, reason: 'rude' })).error, 'unknown reason');

  await friends[1].c.from('fit_reports').insert({ post_id: fit.id, reason: 'inappropriate' });
  await friends[2].c.from('fit_reports').insert({ post_id: fit.id, reason: 'harassment' });
  assert.equal(await canSeePost(friends[3], fit.id), false, 'hidden for everyone after three');
  assert.equal(await canReadPhoto(friends[3], fit.path), false);
  assert.ok((await friends[3].c.from('fit_ratings').insert({ post_id: fit.id, reaction: 'fire' })).error);
  const own = (await a.c.rpc('my_fits')).data![0];
  assert.equal(own.hidden, true, 'the author sees it was hidden');
  // Reports are private to the reporter
  assert.equal(((await friends[3].c.from('fit_reports').select('*')).data ?? []).length, 0);
});

test('blocking: removes the friendship, hides everything, and looks like a missing user', async () => {
  const a = await person('abe');
  const b = await person('bix');
  await befriend(a, b);
  const fit = await postFit(a);
  await b.c.rpc('rate_fit', { post: fit.id, reaction: 'nope', comment: 'mean comment' });

  assert.ifError((await a.c.rpc('block_user', { other: b.id })).error);
  assert.equal(await canSeePost(b, fit.id), false);
  assert.equal((await a.c.rpc('friend_list')).data!.length, 0);
  assert.equal((await a.c.rpc('fit_ratings_for', { post: fit.id })).data!.length, 0, 'blocked person’s rating is hidden');
  assert.match((await b.c.rpc('send_friend_request', { target_username: a.username })).error!.message, /No one has that username/);
  assert.match((await a.c.rpc('send_friend_request', { target_username: b.username })).error!.message, /Unblock them first/);
  assert.deepEqual((await a.c.rpc('blocked_list')).data!.map((r: { username: string }) => r.username), [b.username]);
  assert.ok((await a.c.rpc('block_user', { other: a.id })).error);

  assert.ifError((await a.c.rpc('unblock_user', { other: b.id })).error);
  assert.equal((await b.c.rpc('send_friend_request', { target_username: a.username })).data, 'sent');
});

test('daily post limit, signed-out access, and account deletion clean-up', async () => {
  const a = await person('lim');
  for (let i = 0; i < 20; i++) {
    const { error } = await a.c.from('fit_posts').insert({ photo_path: `${a.id}/${randomUUID()}.jpg` });
    assert.ifError(error);
  }
  assert.ok((await a.c.from('fit_posts').insert({ photo_path: `${a.id}/${randomUUID()}.jpg` })).error, '21st post today is refused');

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  assert.ok((await anon.rpc('fit_feed')).error);
  assert.ok((await anon.rpc('send_friend_request', { target_username: a.username })).error);
  assert.equal(((await anon.from('wearday_profiles').select('*')).data ?? []).length, 0);
  assert.equal(((await anon.from('fit_posts').select('*')).data ?? []).length, 0);

  const b = await person('del');
  await befriend(a, b);
  assert.ifError((await b.c.rpc('delete_my_account')).error);
  assert.equal((await a.c.rpc('friend_list')).data!.length, 0);
  assert.equal((await admin.from('wearday_profiles').select('user_id').eq('user_id', b.id)).data!.length, 0);
});
