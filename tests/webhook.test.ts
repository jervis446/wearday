import assert from 'node:assert/strict';
import { test } from 'node:test';

import { entitlementFromSubscriber, handleWebhook, type Row } from '../supabase/functions/revenuecat-webhook/handler.ts';

const UID = '6f1c2a3b-1111-4222-8333-944455556666';
const AUTH = 'Bearer s3cret-webhook';

function deps(extra: Partial<Parameters<typeof handleWebhook>[2]> = {}) {
  const rows = new Map<string, Row>();
  return {
    rows,
    d: {
      expectedAuth: AUTH,
      entitlementId: 'premium',
      getRow: async (id: string) => rows.get(id) ?? null,
      upsertRow: async (r: Row) => void rows.set(r.user_id, r),
      ...extra,
    },
  };
}
const body = (event: Record<string, unknown>) => JSON.stringify({ api_version: '1.0', event });
const exp = Date.parse('2026-12-07T00:00:00Z');

test('rejects calls without the right Authorization header', async () => {
  const { d } = deps();
  assert.equal((await handleWebhook(null, body({ type: 'TEST' }), d)).status, 401);
  assert.equal((await handleWebhook('Bearer wrong', body({ type: 'TEST' }), d)).status, 401);
  assert.equal((await handleWebhook(AUTH, body({ type: 'TEST' }), { ...d, expectedAuth: '' })).status, 401);
  assert.equal((await handleWebhook(AUTH, '{bad', d)).status, 400);
});

test('purchase grants Premium until expiry; cancellation keeps it; expiration removes it', async () => {
  const { d, rows } = deps();
  await handleWebhook(AUTH, body({ type: 'INITIAL_PURCHASE', app_user_id: UID, entitlement_ids: ['premium'], product_id: 'wearday_yearly', expiration_at_ms: exp, event_timestamp_ms: 1 }), d);
  assert.deepEqual(rows.get(UID), { user_id: UID, premium: true, expires_at: '2026-12-07T00:00:00.000Z', product_id: 'wearday_yearly', last_event_ms: 1 });
  await handleWebhook(AUTH, body({ type: 'CANCELLATION', app_user_id: UID, entitlement_ids: ['premium'], expiration_at_ms: exp, event_timestamp_ms: 2 }), d);
  assert.equal(rows.get(UID)!.premium, true);
  await handleWebhook(AUTH, body({ type: 'EXPIRATION', app_user_id: UID, entitlement_ids: ['premium'], expiration_at_ms: exp, event_timestamp_ms: 3 }), d);
  assert.equal(rows.get(UID)!.premium, false);
});

test('older events arriving late are ignored', async () => {
  const { d, rows } = deps();
  await handleWebhook(AUTH, body({ type: 'EXPIRATION', app_user_id: UID, entitlement_ids: ['premium'], event_timestamp_ms: 10 }), d);
  await handleWebhook(AUTH, body({ type: 'RENEWAL', app_user_id: UID, entitlement_ids: ['premium'], expiration_at_ms: exp, event_timestamp_ms: 5 }), d);
  assert.equal(rows.get(UID)!.premium, false);
});

test('anonymous RevenueCat users and other entitlements are ignored', async () => {
  const { d, rows } = deps();
  const r = await handleWebhook(AUTH, body({ type: 'INITIAL_PURCHASE', app_user_id: '$RCAnonymousID:abc', entitlement_ids: ['premium'] }), d);
  assert.equal(r.status, 200);
  await handleWebhook(AUTH, body({ type: 'INITIAL_PURCHASE', app_user_id: UID, entitlement_ids: ['other'], event_timestamp_ms: 1 }), d);
  assert.equal(rows.size, 0);
});

test('alias with the Supabase id is found even when app_user_id is anonymous', async () => {
  const { d, rows } = deps();
  await handleWebhook(AUTH, body({ type: 'RENEWAL', app_user_id: '$RCAnonymousID:x', aliases: ['$RCAnonymousID:x', UID.toUpperCase()], entitlement_ids: ['premium'], expiration_at_ms: exp, event_timestamp_ms: 1 }), d);
  assert.equal(rows.get(UID)!.premium, true);
});

test('with a RevenueCat secret key, the current state is fetched instead of trusting the event', async () => {
  const asked: string[] = [];
  const { d, rows } = deps({
    fetchEntitlement: async (id) => (asked.push(id), { premium: false, expiresAt: '2026-01-01T00:00:00Z', productId: 'wearday_monthly' }),
  });
  await handleWebhook(AUTH, body({ type: 'TRANSFER', transferred_from: [UID], transferred_to: ['$RCAnonymousID:new'], event_timestamp_ms: 9 }), d);
  assert.deepEqual(asked, [UID]);
  assert.equal(rows.get(UID)!.premium, false);
});

test('reads the REST subscriber response', () => {
  const now = Date.parse('2026-11-08T00:00:00Z');
  const sub = (expires: string | null) => ({ subscriber: { entitlements: { premium: { expires_date: expires, product_identifier: 'wearday_yearly' } } } });
  assert.deepEqual(entitlementFromSubscriber(sub('2026-12-01T00:00:00Z'), 'premium', now), { premium: true, expiresAt: '2026-12-01T00:00:00Z', productId: 'wearday_yearly' });
  assert.equal(entitlementFromSubscriber(sub('2026-10-01T00:00:00Z'), 'premium', now).premium, false);
  assert.equal(entitlementFromSubscriber(sub(null), 'premium', now).premium, true);
  assert.equal(entitlementFromSubscriber({ subscriber: { entitlements: {} } }, 'premium', now).premium, false);
});
