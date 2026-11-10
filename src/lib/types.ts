export const CATEGORIES = [
  'Tops',
  'Bottoms',
  'Dresses',
  'Outerwear',
  'Shoes',
  'Bags',
  'Accessories',
  'Other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;
export type Season = (typeof SEASONS)[number];

export const STATUSES = ['available', 'laundry', 'lent', 'sold', 'donated'] as const;
export type ItemStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<ItemStatus, string> = {
  available: 'Available',
  laundry: 'In laundry',
  lent: 'Lent out',
  sold: 'Sold',
  donated: 'Donated',
};

export type Item = {
  id: string;
  imageUri: string;
  name: string;
  category: Category;
  brand?: string;
  color?: string;
  size?: string;
  price?: number;
  seasons: Season[];
  tags: string[];
  notes?: string;
  /** Wishlist items are things you want, not things you own. */
  wishlist: boolean;
  /** Missing means available. */
  status?: ItemStatus;
  /** Who it's lent to, when status is 'lent'. */
  lentTo?: string;
  createdAt: number;
};

/** Owned and still in the wardrobe (not wishlist, sold or donated). */
export const inCloset = (i: Item) => !i.wishlist && i.status !== 'sold' && i.status !== 'donated';
/** In the wardrobe and wearable right now (not in the laundry or lent out). */
export const wearable = (i: Item) => inCloset(i) && (!i.status || i.status === 'available');
export const archived = (i: Item) => !i.wishlist && (i.status === 'sold' || i.status === 'donated');

/** One clothing piece placed on the outfit canvas. x/y are 0..1 relative to the canvas. */
export type OutfitPiece = {
  itemId: string;
  x: number;
  y: number;
  scale: number;
};

export type Outfit = {
  id: string;
  name: string;
  pieces: OutfitPiece[];
  tags: string[];
  createdAt: number;
};

/** A day's record: what was worn, plus an optional outfit selfie. */
export type WearLog = {
  id: string;
  date: string; // YYYY-MM-DD
  outfitId?: string;
  itemIds: string[];
  selfieUri?: string;
  note?: string;
  /** How it felt to wear: teaches suggestions the person's style (see style.ts). */
  rating?: OutfitRating;
  /** The mood it was worn in (a MOODS label from moods.ts). */
  mood?: string;
};

export const RATINGS = ['love', 'ok', 'dislike'] as const;
export type OutfitRating = (typeof RATINGS)[number];
export const RATING_LABEL: Record<OutfitRating, string> = { love: '❤️ Loved it', ok: '🙂 It was fine', dislike: '👎 Not me' };

/** A non-clothing thing to pack, e.g. "Charger". */
export type PackExtra = { id: string; text: string; packed: boolean };

export type Trip = {
  id: string;
  name: string;
  destination?: string;
  start: string; // YYYY-MM-DD
  nights: number;
  itemIds: string[];
  /** Item ids already in the suitcase. */
  packed: string[];
  extras: PackExtra[];
  createdAt: number;
};

/** A named group of outfits, e.g. "Office" or "Goa trip". */
export type Collection = {
  id: string;
  name: string;
  outfitIds: string[];
  createdAt: number;
};

export type Db = {
  items: Item[];
  outfits: Outfit[];
  logs: WearLog[];
  trips: Trip[];
  collections: Collection[];
};

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** The local date `days` days before `from` (YYYY-MM-DD). */
export const daysAgoKey = (days: number, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return todayKey(d);
};

/** "Today", "Yesterday", or the date in the phone's format. */
export function dayLabel(date: string) {
  if (date === todayKey()) return 'Today';
  if (date === daysAgoKey(1)) return 'Yesterday';
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export const todayKey = (d = new Date()) => {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};
