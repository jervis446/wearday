/**
 * Noha Money top-ups through the NohaPI (YOUPI) UPI gateway. Pure logic so it can be unit tested;
 * index.ts wires it to Supabase and the gateway.
 *
 *   POST /noha-pay/topup    (signed-in user)  → creates an order and returns the gateway checkout URL
 *   POST /noha-pay/webhook  (gateway → us)    → verifies the HMAC signature and credits the wallet
 */

export type Order = { id: string; user_id: string; app: string; amount_paise: number; status: string };

export type Deps = {
  webhookSecret: string;
  now: () => number;
  getOrder: (id: string) => Promise<Order | null>;
  /** Calls public.noha_credit; must be idempotent on the key. */
  credit: (o: Order, p: { reference: string; key: string }) => Promise<void>;
  updateOrder: (id: string, patch: Record<string, unknown>) => Promise<void>;
};

export const MIN_TOPUP_RUPEES = 50;
export const MAX_TOPUP_RUPEES = 10000;
/** Noha Money is valid for 12 months from the day it's added (Asanoha's rule). */
export const VALID_DAYS = 365;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (status: number, body: unknown) => ({ status, body });

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Checks a top-up request body. Returns the amount in paise or an error message. */
export function parseTopup(body: unknown): { amountPaise: number; app: 'wearday' | 'asanoha'; returnUrl: string } | { error: string } {
  const b = (body ?? {}) as { amount?: unknown; app?: unknown; returnUrl?: unknown };
  const rupees = Number(b.amount);
  if (!Number.isInteger(rupees) || rupees < MIN_TOPUP_RUPEES || rupees > MAX_TOPUP_RUPEES)
    return { error: `Add between ₹${MIN_TOPUP_RUPEES} and ₹${MAX_TOPUP_RUPEES}, in whole rupees.` };
  const app = b.app === 'asanoha' ? 'asanoha' : b.app === 'wearday' || b.app === undefined ? 'wearday' : null;
  if (!app) return { error: 'Unknown app.' };
  const returnUrl = typeof b.returnUrl === 'string' ? b.returnUrl : '';
  if (!allowedReturnUrl(returnUrl)) return { error: 'Return URL not allowed.' };
  return { amountPaise: rupees * 100, app, returnUrl };
}

export function allowedReturnUrl(u: string): boolean {
  return /^https:\/\/(wearday\.)?asanoha\.co\.in(\/|$)/.test(u) || /^https:\/\/jervis446\.github\.io\//.test(u) || /^wearday:\/\//.test(u);
}

type GatewayEvent = { event?: string; orderId?: string; amountPaise?: number; amount?: string; utr?: string; paymentId?: string };

export async function handleWebhook(headers: Headers, rawBody: string, deps: Deps): Promise<{ status: number; body: unknown }> {
  if (!deps.webhookSecret) return reply(500, { error: 'webhook secret not configured' });
  const sig = headers.get('x-gateway-signature') ?? '';
  const expected = 'sha256=' + (await hmacHex(deps.webhookSecret, rawBody));
  if (!timingSafeEqual(sig, expected)) return reply(401, { error: 'invalid signature' });

  // Reject old deliveries so a captured request can't be replayed later.
  const ts = Number(headers.get('x-gateway-timestamp'));
  if (ts && Math.abs(deps.now() - ts) > 15 * 60_000) return reply(400, { error: 'stale delivery' });

  let ev: GatewayEvent;
  try {
    ev = JSON.parse(rawBody);
  } catch {
    return reply(400, { error: 'invalid JSON' });
  }
  if (!ev.orderId || !UUID.test(ev.orderId)) return reply(200, { ignored: 'not a Noha Money order' });
  const order = await deps.getOrder(ev.orderId);
  if (!order) return reply(200, { ignored: 'unknown order' });

  if (ev.event === 'SUCCESS') {
    if (order.status === 'paid') return reply(200, { ok: true, duplicate: true });
    const paid = typeof ev.amountPaise === 'number' ? ev.amountPaise : Math.round(Number(ev.amount) * 100);
    if (paid !== order.amount_paise) {
      // Never credit a different amount automatically; check this one against the bank statement.
      await deps.updateOrder(order.id, { status: 'failed', gateway_payment_id: ev.paymentId ?? null, utr: ev.utr ?? null });
      return reply(200, { ignored: 'amount mismatch', expected: order.amount_paise, got: paid });
    }
    await deps.credit(order, { reference: ev.utr || ev.paymentId || order.id, key: `topup:${order.id}` });
    await deps.updateOrder(order.id, { status: 'paid', gateway_payment_id: ev.paymentId ?? null, utr: ev.utr ?? null, paid_at: new Date(deps.now()).toISOString() });
    return reply(200, { ok: true });
  }
  const status = ev.event === 'FAILED' ? 'failed' : ev.event === 'EXPIRED' ? 'expired' : ev.event === 'CANCELLED' ? 'cancelled' : null;
  if (status && order.status === 'pending') await deps.updateOrder(order.id, { status });
  return reply(200, { ok: true });
}
