/**
 * RevenueCat → Supabase: keeps public.user_entitlements up to date so the database can enforce
 * the free-plan limits. Pure logic (no Deno/Node APIs) so it can be unit tested.
 *
 * RevenueCat calls this for every subscription event. The app logs users in to RevenueCat with
 * their Supabase user id, so app_user_id (or one of its aliases) is the Supabase user id.
 */

export type Entitlement = { premium: boolean; expiresAt: string | null; productId: string | null };
export type Row = { user_id: string; premium: boolean; expires_at: string | null; product_id: string | null; last_event_ms: number };

export type Deps = {
  /** Value configured as the webhook's Authorization header in RevenueCat. */
  expectedAuth: string;
  entitlementId: string;
  /** Current state from RevenueCat's REST API, if a secret key is configured (most reliable). */
  fetchEntitlement?: (userId: string) => Promise<Entitlement>;
  getRow: (userId: string) => Promise<Row | null>;
  upsertRow: (row: Row) => Promise<void>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Events that mean "has access until expiration_at_ms".
const GRANTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED', 'TEMPORARY_ENTITLEMENT_GRANT']);
// Cancelling turns off auto-renew but keeps access until expiry; billing issues get a grace period.
const KEEPS_UNTIL_EXPIRY = new Set(['CANCELLATION', 'BILLING_ISSUE', 'SUBSCRIPTION_PAUSED']);

type RcEvent = {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  transferred_from?: string[];
  transferred_to?: string[];
  entitlement_ids?: string[] | null;
  entitlement_id?: string | null;
  product_id?: string;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number;
};

const json = (status: number, body: unknown) => ({ status, body });

export async function handleWebhook(authHeader: string | null, rawBody: string, deps: Deps): Promise<{ status: number; body: unknown }> {
  if (!deps.expectedAuth || !timingSafeEqual(authHeader ?? '', deps.expectedAuth)) return json(401, { error: 'unauthorized' });

  let event: RcEvent;
  try {
    event = (JSON.parse(rawBody) as { event?: RcEvent }).event ?? {};
  } catch {
    return json(400, { error: 'invalid JSON' });
  }
  if (!event.type) return json(400, { error: 'missing event' });
  if (event.type === 'TEST') return json(200, { ok: true, test: true });

  const ids = [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
    ...(event.transferred_from ?? []),
    ...(event.transferred_to ?? []),
  ].filter((id): id is string => !!id && UUID.test(id));
  const users = [...new Set(ids.map((id) => id.toLowerCase()))];
  if (!users.length) return json(200, { ok: true, ignored: 'no signed-in user on this event' });

  const eventMs = event.event_timestamp_ms ?? Date.now();
  const updated: string[] = [];

  for (const uid of users) {
    // Preferred: ask RevenueCat for the current truth (handles transfers, refunds and out-of-order events).
    if (deps.fetchEntitlement) {
      const e = await deps.fetchEntitlement(uid);
      await deps.upsertRow({ user_id: uid, premium: e.premium, expires_at: e.expiresAt, product_id: e.productId, last_event_ms: eventMs });
      updated.push(uid);
      continue;
    }

    // Fallback: derive from the event itself, ignoring events older than the last one applied.
    const row = await deps.getRow(uid);
    if (row && row.last_event_ms >= eventMs) continue;
    const entitlements = event.entitlement_ids ?? (event.entitlement_id ? [event.entitlement_id] : []);
    const relevant = entitlements.length === 0 || entitlements.includes(deps.entitlementId);
    if (!relevant) continue;
    const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;
    let premium: boolean;
    if (GRANTS.has(event.type)) premium = true;
    else if (KEEPS_UNTIL_EXPIRY.has(event.type)) premium = row?.premium ?? true;
    else if (event.type === 'EXPIRATION' || event.type === 'REFUND' || event.type === 'TRANSFER') premium = false;
    else continue;
    await deps.upsertRow({
      user_id: uid,
      premium,
      expires_at: premium ? (expiresAt ?? row?.expires_at ?? null) : expiresAt,
      product_id: event.product_id ?? row?.product_id ?? null,
      last_event_ms: eventMs,
    });
    updated.push(uid);
  }
  return json(200, { ok: true, updated });
}

/** Reads RevenueCat's REST API response for one subscriber. */
export function entitlementFromSubscriber(body: unknown, entitlementId: string, now = Date.now()): Entitlement {
  const ent = (body as { subscriber?: { entitlements?: Record<string, { expires_date?: string | null; product_identifier?: string }> } })
    ?.subscriber?.entitlements?.[entitlementId];
  if (!ent) return { premium: false, expiresAt: null, productId: null };
  const expires = ent.expires_date ?? null;
  return { premium: !expires || Date.parse(expires) > now, expiresAt: expires, productId: ent.product_identifier ?? null };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
