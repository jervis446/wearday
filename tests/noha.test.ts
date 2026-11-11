import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allowedReturnUrl, handleWebhook, hmacHex, type Order, parseTopup } from '../supabase/functions/noha-pay/handler.ts';

const SECRET = 'test-secret';
const NOW = 1_800_000_000_000;
const ORDER: Order = { id: '11111111-2222-4333-8444-555555555555', user_id: 'u1', app: 'wearday', amount_paise: 50000, status: 'pending' };

function setup(order: Order | null = { ...ORDER }) {
  const credits: string[] = [];
  const updates: Record<string, unknown>[] = [];
  const deps = {
    webhookSecret: SECRET,
    now: () => NOW,
    getOrder: async () => order,
    credit: async (_o: Order, p: { key: string }) => void credits.push(p.key),
    updateOrder: async (_id: string, patch: Record<string, unknown>) => {
      updates.push(patch);
      if (order && patch.status) order.status = patch.status as string;
    },
  };
  return { deps, credits, updates };
}

async function send(body: object, deps: ReturnType<typeof setup>['deps'], opts: { sig?: string; ts?: number } = {}) {
  const raw = JSON.stringify(body);
  const h = new Headers({ 'x-gateway-signature': opts.sig ?? 'sha256=' + (await hmacHex(SECRET, raw)), 'x-gateway-timestamp': String(opts.ts ?? NOW) });
  return handleWebhook(h, raw, deps);
}

const success = { event: 'SUCCESS', orderId: ORDER.id, amountPaise: 50000, amount: '500.00', utr: '123456789012', paymentId: 'pay_1' };

test('a signed SUCCESS credits the wallet once, even if delivered twice', async () => {
  const s = setup();
  assert.equal((await send(success, s.deps)).status, 200);
  assert.equal((await send(success, s.deps)).status, 200);
  assert.deepEqual(s.credits, [`topup:${ORDER.id}`]);
  assert.equal(s.updates[0].status, 'paid');
});

test('a bad signature is rejected and nothing is credited', async () => {
  const s = setup();
  const r = await send(success, s.deps, { sig: 'sha256=' + '0'.repeat(64) });
  assert.equal(r.status, 401);
  assert.equal(s.credits.length, 0);
});

test('an old (replayed) delivery is rejected', async () => {
  const s = setup();
  assert.equal((await send(success, s.deps, { ts: NOW - 60 * 60_000 })).status, 400);
  assert.equal(s.credits.length, 0);
});

test('a different amount is never credited', async () => {
  const s = setup();
  const r = await send({ ...success, amountPaise: 100 }, s.deps);
  assert.equal(r.status, 200);
  assert.equal(s.credits.length, 0);
  assert.equal(s.updates[0].status, 'failed');
});

test('failed and expired payments mark a pending order, unknown orders are ignored', async () => {
  const s = setup();
  await send({ event: 'EXPIRED', orderId: ORDER.id }, s.deps);
  assert.equal(s.updates[0].status, 'expired');
  const u = setup(null);
  assert.equal((await send(success, u.deps)).status, 200);
  assert.equal(u.credits.length, 0);
});

test('top-up requests are validated', () => {
  assert.ok('error' in parseTopup({ amount: 10, returnUrl: 'https://wearday.asanoha.co.in/account.html' }));
  assert.ok('error' in parseTopup({ amount: 99.5, returnUrl: 'https://wearday.asanoha.co.in/' }));
  assert.ok('error' in parseTopup({ amount: 500, returnUrl: 'https://evil.example/' }));
  assert.deepEqual(parseTopup({ amount: 500, app: 'asanoha', returnUrl: 'https://asanoha.co.in/shop/' }), {
    amountPaise: 50000,
    app: 'asanoha',
    returnUrl: 'https://asanoha.co.in/shop/',
  });
  assert.equal(allowedReturnUrl('https://asanoha.co.in.evil.com/'), false);
});
