/** Currency formatting (pure, so it can be unit tested). */

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'AUD', 'CAD', 'SGD', 'JPY'] as const;

/**
 * Formats an amount in the given ISO currency, e.g. ₹1,200 or $19.99.
 * Whole amounts drop the decimals; `compact` also drops them for anything over 100.
 */
export function formatMoney(amount: number, currency: string, opts: { compact?: boolean; locale?: string } = {}): string {
  const whole = Number.isInteger(amount) || (opts.compact && Math.abs(amount) >= 100);
  try {
    return new Intl.NumberFormat(opts.locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(whole ? Math.round(amount) : amount);
  } catch {
    // Unknown currency code or no Intl support.
    return `${currency} ${whole ? Math.round(amount) : amount.toFixed(2)}`;
  }
}

/** The currency symbol on its own, e.g. "₹", for input labels. */
export function currencySymbol(currency: string, locale?: string): string {
  try {
    const part = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency');
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

/**
 * Parses what people type as a price: "1,200", "1.200,50", "12,5", "₹ 1,999.00".
 * Returns undefined for empty or unparseable input.
 */
export function parsePrice(input: string): number | undefined {
  let s = input.replace(/[^\d.,-]/g, '');
  if (!s) return undefined;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // Both present: whichever comes last is the decimal separator.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // Only commas: "12,5" / "12,50" is a decimal; "1,200" / "1,200,000" are thousands.
    s = /^-?\d+,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if ((s.match(/\./g) ?? []).length > 1) {
    // "1.200.000" style thousands.
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
