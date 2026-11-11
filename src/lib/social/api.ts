import type { PostgrestError } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';

import { logError } from '../diagnostics';
import { supabase } from '../supabase';
import type { Reaction, ReportReason } from './rules';

/**
 * Friends and "Rate my fit", backed by Supabase. Every rule (who can see what, limits, blocks)
 * is enforced by the database; see supabase/migrations/20261111090000_friends_and_fits.sql.
 * Nothing here is stored on the phone.
 */

const BUCKET = 'fits';
const PAGE = 20;
/** Signed photo links last an hour; the feed refreshes long before that matters. */
const LINK_SECONDS = 3600;

export type Profile = { username: string; displayName: string };
export type Relation = 'friend' | 'incoming' | 'outgoing';
export type Person = { userId: string; username: string; displayName: string };
export type Connection = Person & { relation: Relation };

export type FriendFit = {
  id: string;
  author: Person;
  photoPath: string;
  caption?: string;
  itemNames: string[];
  createdAt: string;
  myReaction?: Reaction;
  myComment?: string;
};

export type MyFit = {
  id: string;
  photoPath: string;
  caption?: string;
  itemNames: string[];
  createdAt: string;
  hidden: boolean;
  counts: Record<Reaction, number>;
  comments: number;
};

export type FitRating = { username?: string; displayName?: string; reaction: Reaction; comment?: string; updatedAt: string };

export class SocialError extends Error {}

const OFFLINE = 'You’re offline. Check your connection and try again.';
const GENERIC = 'Something went wrong. Please try again.';

function client() {
  if (!supabase) throw new SocialError('Friends aren’t available in this build of the app.');
  return supabase;
}

/**
 * Turns a database or network error into a message for people. Messages we raise ourselves
 * (code P0001) are already written for people; anything else is logged and replaced.
 */
function fail(error: PostgrestError | Error, known: Record<string, string> = {}): never {
  const code = 'code' in error ? error.code : undefined;
  if (code && known[code]) throw new SocialError(known[code]);
  if (code === 'P0001') throw new SocialError(error.message);
  if (/network|fetch|failed to connect|timed? ?out/i.test(error.message)) throw new SocialError(OFFLINE);
  logError('social', new Error(`${code ?? 'error'}: ${error.message}`));
  throw new SocialError(GENERIC);
}

const RLS_DENIED = '42501';
const UNIQUE = '23505';
const CHECK = '23514';

async function myId() {
  const { data } = await client().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new SocialError('Please sign in again.');
  return id;
}

// ---------- profile ----------

export async function getMyProfile(): Promise<Profile | null> {
  const id = await myId();
  const { data, error } = await client().from('wearday_profiles').select('username, display_name').eq('user_id', id).maybeSingle();
  if (error) fail(error);
  return data ? { username: data.username, displayName: data.display_name } : null;
}

export async function saveProfile(profile: Profile, isNew: boolean): Promise<void> {
  const row = { username: profile.username, display_name: profile.displayName };
  const known = { [UNIQUE]: 'That username is taken. Try another one.', [CHECK]: 'That username or name isn’t allowed.' };
  if (isNew) {
    const { error } = await client().from('wearday_profiles').insert(row);
    if (error) fail(error, known);
  } else {
    const { error } = await client().from('wearday_profiles').update(row).eq('user_id', await myId());
    if (error) fail(error, known);
  }
}

// ---------- friends ----------

type ConnectionRow = { user_id: string; username: string; display_name: string; relation: Relation };

export async function listConnections(): Promise<Connection[]> {
  const { data, error } = await client().rpc('friend_list');
  if (error) fail(error);
  return ((data ?? []) as ConnectionRow[]).map((r) => ({ userId: r.user_id, username: r.username, displayName: r.display_name, relation: r.relation }));
}

export type RequestResult = 'sent' | 'accepted' | 'pending' | 'already_friends';

export async function sendFriendRequest(username: string): Promise<RequestResult> {
  const { data, error } = await client().rpc('send_friend_request', { target_username: username });
  if (error) fail(error);
  return data as RequestResult;
}

export async function respondToRequest(fromUser: string, accept: boolean): Promise<void> {
  const { error } = await client().rpc('respond_friend_request', { from_user: fromUser, accept });
  if (error) fail(error);
}

/** Unfriends, or cancels a request you sent. */
export async function removeFriend(userId: string): Promise<void> {
  const { error } = await client().rpc('remove_friend', { other: userId });
  if (error) fail(error);
}

export async function blockUser(userId: string): Promise<void> {
  const { error } = await client().rpc('block_user', { other: userId });
  if (error) fail(error);
}

export async function unblockUser(userId: string): Promise<void> {
  const { error } = await client().rpc('unblock_user', { other: userId });
  if (error) fail(error);
}

type BlockedRow = { user_id: string; username: string | null; display_name: string | null };

export async function listBlocked(): Promise<Person[]> {
  const { data, error } = await client().rpc('blocked_list');
  if (error) fail(error);
  return ((data ?? []) as BlockedRow[]).map((r) => ({
    userId: r.user_id,
    username: r.username ?? '',
    displayName: r.display_name ?? 'Deleted account',
  }));
}

// ---------- fits ----------

type FeedRow = {
  id: string;
  author: string;
  username: string;
  display_name: string;
  photo_path: string;
  caption: string | null;
  item_names: string[];
  created_at: string;
  my_reaction: Reaction | null;
  my_comment: string | null;
};

/** Friends' fits, newest first. Pass the last fit's `createdAt` to load the next page. */
export async function loadFeed(before?: string): Promise<{ fits: FriendFit[]; more: boolean }> {
  const { data, error } = await client().rpc('fit_feed', { before: before ?? null, max_rows: PAGE });
  if (error) fail(error);
  const rows = (data ?? []) as FeedRow[];
  return {
    more: rows.length === PAGE,
    fits: rows.map((r) => ({
      id: r.id,
      author: { userId: r.author, username: r.username, displayName: r.display_name },
      photoPath: r.photo_path,
      caption: r.caption ?? undefined,
      itemNames: r.item_names ?? [],
      createdAt: r.created_at,
      myReaction: r.my_reaction ?? undefined,
      myComment: r.my_comment ?? undefined,
    })),
  };
}

type MyFitRow = {
  id: string;
  photo_path: string;
  caption: string | null;
  item_names: string[];
  created_at: string;
  hidden: boolean;
  fire: number;
  nice: number;
  nope: number;
  comments: number;
};

export async function loadMyFits(before?: string): Promise<{ fits: MyFit[]; more: boolean }> {
  const { data, error } = await client().rpc('my_fits', { before: before ?? null, max_rows: PAGE });
  if (error) fail(error);
  const rows = (data ?? []) as MyFitRow[];
  return {
    more: rows.length === PAGE,
    fits: rows.map((r) => ({
      id: r.id,
      photoPath: r.photo_path,
      caption: r.caption ?? undefined,
      itemNames: r.item_names ?? [],
      createdAt: r.created_at,
      hidden: r.hidden,
      counts: { fire: r.fire, nice: r.nice, nope: r.nope },
      comments: r.comments,
    })),
  };
}

/** One of your own fits, with reaction totals. */
export async function loadMyFit(id: string): Promise<MyFit | null> {
  const { data, error } = await client()
    .from('fit_posts')
    .select('id, photo_path, caption, item_names, created_at, hidden')
    .eq('id', id)
    .eq('author', await myId())
    .maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const ratings = await loadRatings(id);
  const counts: Record<Reaction, number> = { fire: 0, nice: 0, nope: 0 };
  for (const r of ratings) counts[r.reaction]++;
  return {
    id: data.id,
    photoPath: data.photo_path,
    caption: data.caption ?? undefined,
    itemNames: data.item_names ?? [],
    createdAt: data.created_at,
    hidden: data.hidden,
    counts,
    comments: ratings.filter((r) => r.comment).length,
  };
}

type RatingRow = { username: string | null; display_name: string | null; reaction: Reaction; comment: string | null; updated_at: string };

/** Everyone's reactions to one of your fits. */
export async function loadRatings(fitId: string): Promise<FitRating[]> {
  const { data, error } = await client().rpc('fit_ratings_for', { post: fitId });
  if (error) fail(error);
  return ((data ?? []) as RatingRow[]).map((r) => ({
    username: r.username ?? undefined,
    displayName: r.display_name ?? undefined,
    reaction: r.reaction,
    comment: r.comment ?? undefined,
    updatedAt: r.updated_at,
  }));
}

/** Short-lived links for showing photos. Missing entries mean the photo is gone or not allowed. */
export async function photoLinks(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await client().storage.from(BUCKET).createSignedUrls(paths, LINK_SECONDS);
  if (error) fail(error);
  const links: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) links[d.path] = d.signedUrl;
  return links;
}

/**
 * Uploads the photo, then creates the post. If creating the post fails, the photo is removed
 * again so nothing is left behind.
 */
export async function shareFit(photo: Uint8Array, details: { caption?: string; itemNames: string[] }): Promise<string> {
  const id = await myId();
  const path = `${id}/${Crypto.randomUUID()}.jpg`;
  const storage = client().storage.from(BUCKET);
  const body = photo.buffer.slice(photo.byteOffset, photo.byteOffset + photo.byteLength) as ArrayBuffer;
  const upload = await storage.upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (upload.error) fail(upload.error);

  const { data, error } = await client()
    .from('fit_posts')
    .insert({ photo_path: path, caption: details.caption ?? null, item_names: details.itemNames })
    .select('id')
    .single();
  if (error) {
    await storage.remove([path]).catch(() => {});
    fail(error, { [RLS_DENIED]: 'You’ve shared 20 fits today. Try again tomorrow.', [CHECK]: 'That caption or list of clothes is too long.' });
  }
  return data.id as string;
}

export async function deleteFit(fit: { id: string; photoPath: string }): Promise<void> {
  const { error } = await client().from('fit_posts').delete().eq('id', fit.id);
  if (error) fail(error);
  // The post is gone, so nobody can open the photo any more; removing it is clean-up.
  const removed = await client().storage.from(BUCKET).remove([fit.photoPath]);
  if (removed.error) logError('social', new Error(`photo clean-up failed: ${removed.error.message}`));
}

const GONE = 'This fit isn’t available any more.';

export async function rateFit(fitId: string, reaction: Reaction, comment?: string): Promise<void> {
  const { error } = await client().rpc('rate_fit', { post: fitId, reaction, comment: comment ?? null });
  if (error) fail(error, { [RLS_DENIED]: GONE, [CHECK]: 'That comment is too long.' });
}

export async function clearRating(fitId: string): Promise<void> {
  const { error } = await client().from('fit_ratings').delete().eq('post_id', fitId).eq('rater', await myId());
  if (error) fail(error);
}

export async function reportFit(fitId: string, reason: ReportReason): Promise<void> {
  const { error } = await client().from('fit_reports').insert({ post_id: fitId, reason });
  if (!error || error.code === UNIQUE) return; // already reported: the result is the same
  // Not allowed: the fit is no longer visible to you, or you hit the daily report limit.
  fail(error, { [RLS_DENIED]: 'Couldn’t send the report. You may have sent a lot of reports today.' });
}

// ---------- activity ----------

/** Incoming friend requests, and reactions to your fits since `since`. */
export async function loadActivity(since: string): Promise<{ requests: number; reactions: number }> {
  const { data, error } = await client().rpc('social_activity', { since });
  if (error) fail(error);
  const row = (data ?? [])[0] as { requests: number; reactions: number } | undefined;
  return row ?? { requests: 0, reactions: 0 };
}

/** Removes every fit photo you uploaded (before deleting the account). */
export async function deleteAllFitPhotos(userId: string): Promise<void> {
  const storage = client().storage.from(BUCKET);
  for (;;) {
    const { data, error } = await storage.list(userId, { limit: 100 });
    if (error) throw new Error(`Couldn’t delete fit photos: ${error.message}`);
    if (!data?.length) return;
    const { error: e2 } = await storage.remove(data.map((f) => `${userId}/${f.name}`));
    if (e2) throw new Error(`Couldn’t delete fit photos: ${e2.message}`);
  }
}
