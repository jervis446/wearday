/** Pure helpers for managing the app's photo files (no native imports, so they can be unit tested). */

/** The file name at the end of a URI, without any query string. */
export const fileName = (uri: string) => uri.split('?')[0].split('/').pop() ?? '';

/** Names in `existing` that none of the `referenced` URIs point to. */
export function unreferenced(existing: string[], referenced: (string | undefined)[]): string[] {
  const keep = new Set(referenced.filter((u): u is string => !!u).map(fileName));
  return existing.filter((name) => !keep.has(name));
}
