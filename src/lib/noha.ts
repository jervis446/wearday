import { Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * Noha Money: the Asanoha wallet, shared with asanoha.co.in. One balance and one transaction
 * history per account, across every Asanoha app (see supabase/migrations/*_noha_money.sql).
 *
 * Paying for Premium with it is switched on per platform with EXPO_PUBLIC_NOHA_PAY, e.g. "web" or
 * "web,android". App stores have rules about paying for digital features outside their billing:
 * - iPhone: Apple requires In-App Purchase, so leave "ios" out.
 * - Android: only add "android" after enrolling in Google Play's User Choice Billing (India).
 */
const PAY_PLATFORMS = (process.env.EXPO_PUBLIC_NOHA_PAY ?? 'web').split(',').map((s: string) => s.trim());
export const nohaPayEnabled = !!supabase && PAY_PLATFORMS.includes(Platform.OS);

export type Wallet = { cash: number; bonus: number; total: number; nextExpiry: string | null };
export type NohaTxn = { id: string; app: string; type: string; amount_paise: number; description: string; created_at: string };
export type NohaProduct = { id: string; name: string; price_paise: number; max_bonus_pct: number };

const need = () => {
  if (!supabase) throw new Error('Accounts aren’t set up in this build.');
  return supabase;
};

export const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export async function fetchWallet(): Promise<{ wallet: Wallet; txns: NohaTxn[] }> {
  const sb = need();
  const [bal, tx] = await Promise.all([
    sb.rpc('noha_balance'),
    sb.from('noha_transactions').select('id, app, type, amount_paise, description, created_at').order('created_at', { ascending: false }).limit(20),
  ]);
  if (bal.error) throw bal.error;
  if (tx.error) throw tx.error;
  const b = (bal.data as { cash_paise: number; bonus_paise: number; total_paise: number; next_expiry: string | null }[])[0];
  return {
    wallet: { cash: b?.cash_paise ?? 0, bonus: b?.bonus_paise ?? 0, total: b?.total_paise ?? 0, nextExpiry: b?.next_expiry ?? null },
    txns: (tx.data ?? []) as NohaTxn[],
  };
}

export async function fetchWeardayProducts(): Promise<NohaProduct[]> {
  const { data, error } = await need().from('noha_products').select('id, name, price_paise, max_bonus_pct').eq('app', 'wearday').order('price_paise');
  if (error) throw error;
  return (data ?? []) as NohaProduct[];
}

/** Server-side Premium (Noha Money purchases, and store purchases recorded by the RevenueCat webhook). */
export async function fetchServerPremium(): Promise<{ premium: boolean; nohaUntil: string | null }> {
  const { data, error } = await need().rpc('my_premium');
  if (error) throw error;
  const d = (data ?? {}) as { premium?: boolean; noha_until?: string | null };
  return { premium: !!d.premium, nohaUntil: d.noha_until ?? null };
}

/** How much a price can be paid with right now (cashback can cover only part of it). */
export function canAfford(w: Wallet, p: NohaProduct): boolean {
  const bonusUsable = Math.min(w.bonus, Math.floor((p.price_paise * p.max_bonus_pct) / 100));
  return w.cash + bonusUsable >= p.price_paise;
}

export async function buyWithNoha(productId: string): Promise<{ premiumUntil: string | null }> {
  // A fresh key per tap; the server makes retries of the same key safe.
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const { data, error } = await need().rpc('noha_buy', { p_product_id: productId, p_idempotency_key: key });
  if (error) throw new Error(/not enough/i.test(error.message) ? 'Not enough Noha Money for this plan.' : error.message);
  return { premiumUntil: (data as { premium_until?: string | null })?.premium_until ?? null };
}
