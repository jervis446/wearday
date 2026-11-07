// Runs against the local Supabase started with `npx supabase start`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY!;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function user(tag: string) {
  const email = `${tag}-${Date.now()}@test.local`;
  const { error } = await admin.auth.admin.createUser({ email, password: 'pw-123456', email_confirm: true });
  assert.ifError(error);
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error: e2 } = await c.auth.signInWithPassword({ email, password: 'pw-123456' });
  assert.ifError(e2);
  return { c, id: data.user!.id };
}

const doc = (id: string, updated_at: number, data: unknown = { name: id }, deleted = false) => ({ kind: 'item', id, updated_at, data, deleted });

test('users only see their own docs; newer edits win; seq increases', async () => {
  const a = await user('a');
  const b = await user('b');
  assert.equal((await a.c.rpc('push_docs', { docs: [doc('tee', 100), doc('jeans', 100)] })).data, 2);

  const own = await a.c.from('wardrobe_docs').select('id, data, seq').order('seq');
  assert.deepEqual(own.data!.map((r) => r.id), ['tee', 'jeans']);
  const other = await b.c.from('wardrobe_docs').select('id');
  assert.equal(other.data!.length, 0, 'B must not see A’s rows');

  // Older edit is ignored, newer one applies and bumps seq
  assert.equal((await a.c.rpc('push_docs', { docs: [doc('tee', 50, { name: 'stale' })] })).data, 0);
  const before = own.data!.find((r) => r.id === 'tee')!.seq;
  assert.equal((await a.c.rpc('push_docs', { docs: [doc('tee', 200, { name: 'fresh' })] })).data, 1);
  const tee = (await a.c.from('wardrobe_docs').select('data, seq').eq('id', 'tee').single()).data!;
  assert.deepEqual(tee.data, { name: 'fresh' });
  assert.ok(tee.seq > before);

  // Deletes are tombstones with no data
  await a.c.rpc('push_docs', { docs: [doc('jeans', 300, { name: 'x' }, true)] });
  const jeans = (await a.c.from('wardrobe_docs').select('deleted, data').eq('id', 'jeans').single()).data!;
  assert.deepEqual(jeans, { deleted: true, data: null });

  // B cannot overwrite or forge A's rows, even with a newer timestamp
  await b.c.rpc('push_docs', { docs: [doc('tee', 999, { name: 'hacked' })] });
  const still = (await a.c.from('wardrobe_docs').select('data').eq('id', 'tee').single()).data!;
  assert.deepEqual(still.data, { name: 'fresh' });
  const forged = await b.c.from('wardrobe_docs').insert({ user_id: a.id, kind: 'item', id: 'forged', client_updated_at: 1 });
  assert.ok(forged.error, 'inserting as another user must fail');

  // Bad input is rejected
  assert.ok((await a.c.rpc('push_docs', { docs: [{ kind: 'nope', id: 'x', updated_at: 1 }] })).error);
});

test('signed-out users can do nothing', async () => {
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  assert.ok((await anon.rpc('push_docs', { docs: [doc('x', 1)] })).error);
  const rows = await anon.from('wardrobe_docs').select('id');
  assert.equal(rows.data?.length ?? 0, 0);
  assert.ok((await anon.storage.from('photos').upload('x/y.jpg', new Uint8Array([1]), { contentType: 'image/jpeg' })).error);
});

test('photos are private to their owner', async () => {
  const a = await user('pa');
  const b = await user('pb');
  const bytes = new Uint8Array([255, 216, 255, 0, 1, 2]);
  const up = await a.c.storage.from('photos').upload(`${a.id}/shirt.jpg`, bytes, { contentType: 'image/jpeg' });
  assert.ifError(up.error);
  const down = await a.c.storage.from('photos').download(`${a.id}/shirt.jpg`);
  assert.deepEqual([...new Uint8Array(await down.data!.arrayBuffer())], [...bytes]);

  assert.ok((await b.c.storage.from('photos').download(`${a.id}/shirt.jpg`)).error, 'B must not read A’s photo');
  assert.ok((await b.c.storage.from('photos').upload(`${a.id}/evil.jpg`, bytes, { contentType: 'image/jpeg' })).error, 'B must not write into A’s folder');
  assert.ok((await a.c.storage.from('photos').upload(`${a.id}/x.exe`, bytes, { contentType: 'application/x-msdownload' })).error, 'only images allowed');
});

test('delete_my_account removes the user and all their rows', async () => {
  const a = await user('del');
  await a.c.rpc('push_docs', { docs: [doc('tee', 1)] });
  assert.ifError((await a.c.rpc('delete_my_account')).error);
  const left = await admin.from('wardrobe_docs').select('id').eq('user_id', a.id);
  assert.equal(left.data!.length, 0);
  const u = await admin.auth.admin.getUserById(a.id);
  assert.ok(u.error || !u.data.user);
});
