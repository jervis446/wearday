import type { SupabaseClient } from '@supabase/supabase-js';

import type { PushDoc, Remote, RemoteDoc } from './engine.ts';

export const PHOTO_BUCKET = 'photos';

/** Path of a photo in Storage: photos/<user id>/<file name>. */
export const photoPath = (userId: string, name: string) => `${userId}/${name}`;

/** The engine's Remote, backed by the wardrobe_docs table and the photos bucket. */
export function supabaseRemote(client: SupabaseClient, userId: string): Remote {
  return {
    async pull(afterSeq, limit) {
      const { data, error } = await client
        .from('wardrobe_docs')
        .select('kind, id, data, deleted, client_updated_at, seq')
        .gt('seq', afterSeq)
        .order('seq', { ascending: true })
        .limit(limit);
      if (error) throw new Error(`Couldn’t download changes: ${error.message}`);
      return (data ?? []).map((r) => ({ ...r, client_updated_at: Number(r.client_updated_at), seq: Number(r.seq) })) as RemoteDoc[];
    },
    async push(docs: PushDoc[]) {
      const { error } = await client.rpc('push_docs', { docs });
      if (error) throw new Error(`Couldn’t upload changes: ${error.message}`);
    },
    async uploadPhoto(name, bytes, contentType) {
      const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const { error } = await client.storage.from(PHOTO_BUCKET).upload(photoPath(userId, name), body, { contentType, upsert: false });
      if (error && !/exists|duplicate/i.test(error.message) && (error as { statusCode?: string }).statusCode !== '409') {
        throw new Error(`Couldn’t upload a photo: ${error.message}`);
      }
    },
  };
}

/** A short-lived link to download one of the user's photos. */
export async function photoUrl(client: SupabaseClient, userId: string, name: string): Promise<string> {
  const { data, error } = await client.storage.from(PHOTO_BUCKET).createSignedUrl(photoPath(userId, name), 300);
  if (error || !data) throw new Error(`Photo not found: ${name}`);
  return data.signedUrl;
}

/** Deletes every photo the user has uploaded (used before deleting the account). */
export async function deleteAllPhotos(client: SupabaseClient, userId: string): Promise<void> {
  for (;;) {
    const { data, error } = await client.storage.from(PHOTO_BUCKET).list(userId, { limit: 100 });
    if (error) throw new Error(`Couldn’t delete photos: ${error.message}`);
    if (!data?.length) return;
    const { error: e2 } = await client.storage.from(PHOTO_BUCKET).remove(data.map((f) => photoPath(userId, f.name)));
    if (e2) throw new Error(`Couldn’t delete photos: ${e2.message}`);
  }
}
