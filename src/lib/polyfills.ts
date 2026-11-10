import { getRandomValues } from 'expo-crypto';

/**
 * Secure random numbers for sign-in (PKCE). Hermes doesn't always provide
 * crypto.getRandomValues, so fill it in from expo-crypto when missing.
 * Imported first in src/lib/supabase.ts.
 */
const g = globalThis as unknown as { crypto?: { getRandomValues?: unknown } };
if (typeof g.crypto?.getRandomValues !== 'function') {
  const impl = <T extends ArrayBufferView | null>(array: T): T => getRandomValues(array as never) as T;
  if (g.crypto) g.crypto.getRandomValues = impl;
  else g.crypto = { getRandomValues: impl };
}
