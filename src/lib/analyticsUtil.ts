/** Pure helpers that keep personal data out of analytics (unit tested). */

export type Props = Record<string, string | number | boolean | undefined>;

/** Keeps only numbers, booleans and short labels; drops anything that could be free text. */
export function safeProps(props: Props = {}): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && v.length <= 32 && !/@|\s{2,}/.test(v)) out[k] = v;
  }
  return out;
}

/** Route with record ids removed, e.g. /item/mw64p0tw2nykzx → /item/[id]. */
export function screenName(pathname: string): string {
  const parts = pathname.split('/').map((seg, i) => {
    if (i === 0 || !seg) return seg;
    const prev = pathname.split('/')[i - 1];
    // Segments after these routes are always ids (except fixed sub-routes).
    if (['item', 'outfit', 'trip'].includes(prev) && !['edit', 'new', 'share'].includes(seg)) return '[id]';
    return seg;
  });
  return parts.join('/') || '/';
}
