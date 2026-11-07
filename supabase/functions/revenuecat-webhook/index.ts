// Supabase Edge Function: RevenueCat webhook → public.user_entitlements.
// No dependencies: talks to the database through Supabase's REST API with the service role key.
// Deploy:  npx supabase functions deploy revenuecat-webhook --no-verify-jwt
// Secrets: npx supabase secrets set REVENUECAT_WEBHOOK_AUTH="Bearer <long random>" REVENUECAT_SECRET_KEY=sk_... (recommended)
import { entitlementFromSubscriber, handleWebhook, type Row } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const entitlementId = Deno.env.get('REVENUECAT_ENTITLEMENT') ?? 'premium';
const secretKey = Deno.env.get('REVENUECAT_SECRET_KEY');

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const result = await handleWebhook(req.headers.get('authorization'), await req.text(), {
    expectedAuth: Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '',
    entitlementId,
    fetchEntitlement: secretKey
      ? async (userId) => {
          const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
            headers: { Authorization: `Bearer ${secretKey}` },
          });
          if (!res.ok) throw new Error(`RevenueCat API ${res.status}`);
          return entitlementFromSubscriber(await res.json(), entitlementId);
        }
      : undefined,
    getRow: async (userId) => {
      const res = await rest(`user_entitlements?user_id=eq.${encodeURIComponent(userId)}&select=*`);
      if (!res.ok) throw new Error(`read failed: ${res.status} ${await res.text()}`);
      return ((await res.json()) as Row[])[0] ?? null;
    },
    upsertRow: async (row) => {
      const res = await rest('user_entitlements?on_conflict=user_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`write failed: ${res.status} ${await res.text()}`);
    },
  }).catch((e) => ({ status: 500, body: { error: (e as Error).message } }));
  // A 5xx makes RevenueCat retry later.
  return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'content-type': 'application/json' } });
});
