// Supabase Edge Function: Noha Money top-ups via the NohaPI UPI gateway.
// Deploy:  npx supabase functions deploy noha-pay --no-verify-jwt   (it checks the user's token itself)
// Secrets: npx supabase secrets set NOHA_GATEWAY_URL=https://pay.asanoha.co.in NOHA_MERCHANT_ID=<uuid> NOHA_WEBHOOK_SECRET=<secret>
// Gateway webhook URL: https://<project>.supabase.co/functions/v1/noha-pay/webhook
import { handleWebhook, type Order, parseTopup, VALID_DAYS } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GATEWAY = Deno.env.get('NOHA_GATEWAY_URL') ?? '';
const MERCHANT = Deno.env.get('NOHA_MERCHANT_ID') ?? '';
const SECRET = Deno.env.get('NOHA_WEBHOOK_SECRET') ?? '';
const ORIGINS = ['https://wearday.asanoha.co.in', 'https://asanoha.co.in', 'https://www.asanoha.co.in', 'https://jervis446.github.io'];

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
const must = async (res: Response) => {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res;
};

function cors(req: Request): Record<string, string> {
  const o = req.headers.get('origin') ?? '';
  return ORIGINS.includes(o)
    ? { 'access-control-allow-origin': o, 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin' }
    : {};
}
const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors(req) } });

async function topup(req: Request) {
  if (!GATEWAY || !MERCHANT) return json(req, 503, { error: 'Adding money isn’t available yet.' });
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: req.headers.get('authorization') ?? '' } });
  if (!userRes.ok) return json(req, 401, { error: 'Please sign in again.' });
  const user = (await userRes.json()) as { id: string };

  const parsed = parseTopup(await req.json().catch(() => null));
  if ('error' in parsed) return json(req, 400, parsed);

  const [order] = (await (
    await must(
      await rest('noha_orders', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ user_id: user.id, app: parsed.app, amount_paise: parsed.amountPaise }),
      }),
    )
  ).json()) as Order[];

  const gw = await fetch(`${GATEWAY.replace(/\/$/, '')}/api/v1/payments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-merchant-id': MERCHANT },
    body: JSON.stringify({
      orderId: order.id,
      amount: (parsed.amountPaise / 100).toFixed(2),
      currency: 'INR',
      returnUrl: parsed.returnUrl,
      metadata: { purpose: 'noha_topup', app: parsed.app },
    }),
  });
  if (!gw.ok) {
    await rest(`noha_orders?id=eq.${order.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed' }) });
    return json(req, 502, { error: 'The payment page couldn’t be opened. Please try again.' });
  }
  const pay = (await gw.json()) as { checkoutUrl?: string; paymentId?: string };
  if (pay.paymentId) await rest(`noha_orders?id=eq.${order.id}`, { method: 'PATCH', body: JSON.stringify({ gateway_payment_id: pay.paymentId }) });
  return json(req, 200, { orderId: order.id, checkoutUrl: pay.checkoutUrl });
}

async function webhook(req: Request) {
  const result = await handleWebhook(req.headers, await req.text(), {
    webhookSecret: SECRET,
    now: () => Date.now(),
    getOrder: async (id) => ((await (await must(await rest(`noha_orders?id=eq.${id}&select=*`))).json()) as Order[])[0] ?? null,
    credit: async (o, p) => {
      await must(
        await rest('rpc/noha_credit', {
          method: 'POST',
          body: JSON.stringify({
            uid: o.user_id,
            p_app: o.app,
            p_type: 'topup',
            p_amount: o.amount_paise,
            p_kind: 'cash',
            p_expires_at: new Date(Date.now() + VALID_DAYS * 864e5).toISOString(),
            p_description: 'Added via UPI',
            p_reference: p.reference,
            p_idempotency_key: p.key,
          }),
        }),
      );
    },
    updateOrder: async (id, patch) => {
      await must(await rest(`noha_orders?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) }));
    },
  }).catch((e) => ({ status: 500, body: { error: (e as Error).message } }));
  return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'content-type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const path = new URL(req.url).pathname;
  try {
    if (path.endsWith('/topup')) return await topup(req);
    if (path.endsWith('/webhook')) return await webhook(req);
    return json(req, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    return json(req, 500, { error: 'Something went wrong.' });
  }
});
