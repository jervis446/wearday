/**
 * Input rules and labels for friends and "Rate my fit". The database enforces the same limits
 * (supabase/migrations/20261111090000_friends_and_fits.sql); these give instant feedback.
 * No platform imports, so it runs under Node for tests.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const DISPLAY_NAME_MAX = 40;
export const CAPTION_MAX = 200;
export const COMMENT_MAX = 140;
export const MAX_FIT_ITEMS = 8;
export const ITEM_NAME_MAX = 60;

export type Reaction = 'fire' | 'nice' | 'nope';
export const REACTIONS: { key: Reaction; emoji: string; label: string }[] = [
  { key: 'fire', emoji: '🔥', label: 'Fire' },
  { key: 'nice', emoji: '👍', label: 'Nice' },
  { key: 'nope', emoji: '👎', label: 'Not it' },
];
export const reactionOf = (key?: string | null) => REACTIONS.find((r) => r.key === key);

export type ReportReason = 'inappropriate' | 'harassment' | 'spam' | 'other';
export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'inappropriate', label: 'Inappropriate photo' },
  { key: 'harassment', label: 'Bullying or harassment' },
  { key: 'spam', label: 'Spam' },
  { key: 'other', label: 'Something else' },
];

/** What people type: "@Ana.B " → "ana.b". */
export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@+/, '').toLowerCase();
}

/** Why a username can't be used, or undefined if it's fine. Expects a normalized value. */
export function usernameProblem(username: string): string | undefined {
  if (username.length < USERNAME_MIN) return `At least ${USERNAME_MIN} characters.`;
  if (username.length > USERNAME_MAX) return `At most ${USERNAME_MAX} characters.`;
  if (!/^[a-z0-9_.]+$/.test(username)) return 'Use letters, numbers, dots and underscores only.';
  if (username.startsWith('.') || username.endsWith('.') || username.includes('..')) return 'Dots can’t be at the start or end, or next to each other.';
  return undefined;
}

/** Trims and collapses spaces; removes control characters. */
export function cleanDisplayName(input: string): string {
  return input.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
}

export function displayNameProblem(name: string): string | undefined {
  if (!name) return 'Add a name your friends will recognise.';
  if (name.length > DISPLAY_NAME_MAX) return `At most ${DISPLAY_NAME_MAX} characters.`;
  return undefined;
}

/** Trimmed text, or undefined when empty. Keeps line breaks inside. */
export function cleanText(input: string, max: number): string | undefined {
  const text = input.trim().slice(0, max).trim();
  return text || undefined;
}

/** Unique, trimmed, non-empty item names within the database limits. */
export function cleanItemNames(names: string[]): string[] {
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim().slice(0, ITEM_NAME_MAX).trim();
    if (name && !out.includes(name)) out.push(name);
    if (out.length === MAX_FIT_ITEMS) break;
  }
  return out;
}

/** "now", "5m", "3h", "2d", then a short date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
