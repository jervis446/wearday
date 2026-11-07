// Two "phones" signed in to the same account, syncing through the local Supabase.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createClient } from '@supabase/supabase-js';

import { emptySyncState, runSync, type Photos, type SyncState } from '../../src/lib/sync/engine.ts';
import { deleteAllPhotos, photoUrl, supabaseRemote } from '../../src/lib/sync/supabaseRemote.ts';

const URL = 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });

async function signIn(email: string) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'pw-123456' });
  assert.ifError(error);
  return { c, id: data.user!.id };
}

function phone(name: string, c: any, userId: string) {
  const files = new Map<string, Uint8Array>();
  const photos: Photos = {
    nameOf: (u) => u.split('/').pop() ?? '',
    localUri: (n) => `file:///${name}/${n}`,
    hasLocal: (n) => files.has(n),
    read: async (u) => files.get(u.split('/').pop()!),
    download: async (n) => {
      const res = await fetch(await photoUrl(c, userId, n));
      if (!res.ok) throw new Error(String(res.status));
      files.set(n, new Uint8Array(await res.arrayBuffer()));
    },
  };
  const dev = {
    db: { items: [], outfits: [], logs: [], trips: [], collections: [] } as any,
    state: emptySyncState() as SyncState,
    files,
    async sync() {
      const r = await runSync({ getDb: () => dev.db, apply: (fn) => (dev.db = fn(dev.db)), state: dev.state, remote: supabaseRemote(c, userId), photos });
      dev.state = r.state;
      return r;
    },
  };
  return dev;
}

test('two phones sync data and photos through Supabase', async () => {
  const email = `sync-${Date.now()}@test.local`;
  await admin.auth.admin.createUser({ email, password: 'pw-123456', email_confirm: true });
  const s1 = await signIn(email), s2 = await signIn(email);
  const a = phone('a', s1.c, s1.id), b = phone('b', s2.c, s2.id);

  a.files.set('tee.jpg', new Uint8Array([255, 216, 255, 9, 9]));
  a.db.items.push({ id: 'tee', name: 'Tee', category: 'Tops', imageUri: 'file:///a/tee.jpg', seasons: [], tags: [], wishlist: false, createdAt: 1 });
  a.db.logs.push({ id: 'l1', date: '2026-11-07', itemIds: ['tee'] });
  const r1 = await a.sync();
  assert.deepEqual([r1.pushed, r1.photosUp], [2, 1]);

  const r2 = await b.sync();
  assert.equal(r2.photosDown, 1);
  assert.equal(b.db.items[0].imageUri, 'file:///b/tee.jpg');
  assert.deepEqual([...b.files.get('tee.jpg')!], [255, 216, 255, 9, 9]);
  assert.equal(b.db.logs[0].date, '2026-11-07');

  // Edit on B, delete on B, both reach A
  b.db.items[0] = { ...b.db.items[0], name: 'Blue tee' };
  b.db.logs = [];
  await new Promise((r) => setTimeout(r, 5));
  await b.sync();
  await a.sync();
  assert.equal(a.db.items[0].name, 'Blue tee');
  assert.equal(a.db.logs.length, 0);

  // Steady state: nothing more to send
  assert.equal((await a.sync()).pushed, 0);
  assert.equal((await b.sync()).pushed, 0);

  // Re-uploading an existing photo is fine (second phone with the same file name)
  await supabaseRemote(s2.c, s2.id).uploadPhoto('tee.jpg', new Uint8Array([1]), 'image/jpeg');

  await deleteAllPhotos(s1.c, s1.id);
  const left = await s1.c.storage.from('photos').list(s1.id);
  assert.equal(left.data!.length, 0);
});
