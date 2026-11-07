// Free-plan sync limit enforced by the database (local Supabase).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const admin = createClient(URL, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });

async function user() {
  const email = `prem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`;
  await admin.auth.admin.createUser({ email, password: 'pw-123456', email_confirm: true });
  const c = createClient(URL, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = await c.auth.signInWithPassword({ email, password: 'pw-123456' });
  return { c, id: data.user!.id };
}
const items = (from: number, n: number, t = 1) => Array.from({ length: n }, (_, i) => ({ kind: 'item', id: `i${from + i}`, updated_at: t, data: { name: `x${from + i}` }, deleted: false }));

test('free accounts sync up to 50 items; growth beyond is refused, edits and deletes still work', async () => {
  const { c } = await user();
  assert.ifError((await c.rpc('push_docs', { docs: items(0, 50) })).error);
  const over = await c.rpc('push_docs', { docs: items(50, 1) });
  assert.match(over.error?.message ?? '', /free plan limit/);
  // The whole failing batch is rolled back
  const count = await c.from('wardrobe_docs').select('id', { count: 'exact', head: true }).eq('kind', 'item');
  assert.equal(count.count, 50);
  // Editing an existing item and adding outfits is fine
  assert.ifError((await c.rpc('push_docs', { docs: [{ kind: 'item', id: 'i3', updated_at: 5, data: { name: 'edited' }, deleted: false }, { kind: 'outfit', id: 'o1', updated_at: 5, data: {}, deleted: false }] })).error);
  // Delete one, then one new item fits again
  assert.ifError((await c.rpc('push_docs', { docs: [{ kind: 'item', id: 'i0', updated_at: 6, data: null, deleted: true }] })).error);
  assert.ifError((await c.rpc('push_docs', { docs: items(100, 1, 7) })).error);
});

test('Premium removes the limit; it ends at the expiry date even without a webhook', async () => {
  const { c, id } = await user();
  await admin.from('user_entitlements').upsert({ user_id: id, premium: true, expires_at: new Date(Date.now() + 864e5).toISOString() });
  assert.equal((await c.rpc('is_premium', { uid: id })).data, true);
  assert.ifError((await c.rpc('push_docs', { docs: items(0, 120) })).error);

  await admin.from('user_entitlements').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('user_id', id);
  assert.equal((await c.rpc('is_premium', { uid: id })).data, false);
  assert.match((await c.rpc('push_docs', { docs: items(500, 1) })).error?.message ?? '', /free plan limit/);
  // Lapsed users can still edit what they have
  assert.ifError((await c.rpc('push_docs', { docs: [{ kind: 'item', id: 'i1', updated_at: 9, data: { name: 'still mine' }, deleted: false }] })).error);
});

test('users can read but not grant themselves Premium', async () => {
  const { c, id } = await user();
  const write = await c.from('user_entitlements').upsert({ user_id: id, premium: true });
  assert.ok(write.error, 'clients must not be able to write entitlements');
  const read = await c.from('user_entitlements').select('premium').eq('user_id', id);
  assert.equal(read.data?.length ?? 0, 0);
});
