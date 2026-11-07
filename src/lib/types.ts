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
};

export type Db = {
  items: Item[];
  outfits: Outfit[];
  logs: WearLog[];
};

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const todayKey = (d = new Date()) => {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};
