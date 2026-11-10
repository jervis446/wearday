import type { Item, Outfit, WearLog } from './types';

/**
 * A summary of someone's style, learned from the outfits they've worn (wear logs, including
 * past outfits they add), how they rated them, the moods they wore them in, the outfits they
 * saved, and their own description. It is sent with each AI suggestion request as context, and
 * also steers the offline picker. Nothing is trained: the profile is rebuilt from the data
 * every time, so editing or deleting a log changes it straight away.
 *
 * No platform imports, so it runs under plain Node for tests.
 */
export type StyleProfile = {
  /** Wear logs the profile learned from. */
  outfitsLearned: number;
  loved: number;
  disliked: number;
  /** Most-liked colours and tags, best first. */
  favoriteColors: string[];
  favoriteTags: string[];
  /** Item id lists, newest first. Only items that still exist. */
  lovedOutfits: string[][];
  dislikedOutfits: string[][];
  /** Outfits worn per mood (mood label → item id lists), newest first. */
  moodOutfits: Record<string, string[][]>;
  /** The person's own description of their style. */
  notes?: string;
};

const MAX_EXAMPLES = 6;
const MAX_DISLIKED = 4;
const MAX_PER_MOOD = 2;
const TOP = 5;

/** How much each rating counts toward favourite colours and tags. */
const WEIGHT = { love: 3, ok: 1, dislike: -2 } as const;

function top(counts: Map<string, number>, n: number) {
  return [...counts.entries()]
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([k]) => k);
}

export function buildStyleProfile(opts: {
  items: Item[];
  logs: WearLog[];
  outfits?: Outfit[];
  itemsOfLog: (l: WearLog) => string[];
  notes?: string;
}): StyleProfile {
  const byId = new Map(opts.items.map((i) => [i.id, i]));
  const colors = new Map<string, number>();
  const tags = new Map<string, number>();
  const add = (map: Map<string, number>, key: string | undefined, w: number) => {
    const k = key?.trim().toLowerCase();
    if (k) map.set(k, (map.get(k) ?? 0) + w);
  };

  const lovedOutfits: string[][] = [];
  const dislikedOutfits: string[][] = [];
  const moodOutfits: Record<string, string[][]> = {};
  let outfitsLearned = 0;
  let loved = 0;
  let disliked = 0;

  const logs = [...opts.logs].sort((a, b) => b.date.localeCompare(a.date));
  for (const log of logs) {
    const ids = opts.itemsOfLog(log).filter((id) => byId.has(id));
    if (!ids.length) continue;
    outfitsLearned++;
    const w = WEIGHT[log.rating ?? 'ok'];
    for (const id of ids) {
      const item = byId.get(id)!;
      add(colors, item.color, w);
      for (const t of item.tags) add(tags, t, w);
    }
    if (log.rating === 'love') {
      loved++;
      if (lovedOutfits.length < MAX_EXAMPLES) lovedOutfits.push(ids);
    } else if (log.rating === 'dislike') {
      disliked++;
      if (dislikedOutfits.length < MAX_DISLIKED) dislikedOutfits.push(ids);
    }
    if (log.mood && log.rating !== 'dislike') {
      const list = (moodOutfits[log.mood] ??= []);
      if (list.length < MAX_PER_MOOD) list.push(ids);
    }
  }

  // Outfits someone put together themselves say something about taste too (lightly).
  for (const o of opts.outfits ?? []) {
    for (const p of o.pieces) {
      const item = byId.get(p.itemId);
      if (!item) continue;
      add(colors, item.color, 0.5);
      for (const t of item.tags) add(tags, t, 0.5);
    }
  }

  const notes = opts.notes?.trim() || undefined;
  return {
    outfitsLearned,
    loved,
    disliked,
    favoriteColors: top(colors, TOP),
    favoriteTags: top(tags, TOP),
    lovedOutfits,
    dislikedOutfits,
    moodOutfits,
    notes,
  };
}

/** True when there's anything to personalise with. */
export const hasStyle = (p: StyleProfile) => p.outfitsLearned > 0 || !!p.notes || p.favoriteColors.length > 0;

/**
 * -1..1 nudge for the offline picker: items from loved outfits and in favourite colours score
 * up, items that keep showing up in disliked outfits score down.
 */
export function styleFit(p: StyleProfile, item: Item): number {
  let s = 0;
  if (item.color && p.favoriteColors.includes(item.color.trim().toLowerCase())) s += 0.4;
  if (item.tags.some((t) => p.favoriteTags.includes(t.trim().toLowerCase()))) s += 0.2;
  if (p.lovedOutfits.some((o) => o.includes(item.id))) s += 0.4;
  const badCount = p.dislikedOutfits.filter((o) => o.includes(item.id)).length;
  s -= Math.min(1, badCount * 0.5);
  return Math.max(-1, Math.min(1, s));
}
