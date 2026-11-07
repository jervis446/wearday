import { Item, OutfitPiece } from './types';

/** Default spot on the canvas for each category, so pieces land roughly where they'd be worn. */
export const SLOT: Record<string, { x: number; y: number }> = {
  Tops: { x: 0.35, y: 0.28 },
  Outerwear: { x: 0.68, y: 0.28 },
  Dresses: { x: 0.4, y: 0.4 },
  Bottoms: { x: 0.35, y: 0.66 },
  Shoes: { x: 0.68, y: 0.8 },
  Bags: { x: 0.75, y: 0.58 },
  Accessories: { x: 0.8, y: 0.12 },
  Other: { x: 0.5, y: 0.5 },
};

/** Lays out items on the canvas by category, nudging repeats in the same slot apart. */
export function autoLayout(items: Item[]): OutfitPiece[] {
  const used: Record<string, number> = {};
  return items.map((item) => {
    const slot = SLOT[item.category] ?? SLOT.Other;
    const n = (used[item.category] = (used[item.category] ?? 0) + 1) - 1;
    return { itemId: item.id, x: Math.min(0.85, slot.x + n * 0.12), y: Math.min(0.85, slot.y + n * 0.06), scale: 1 };
  });
}
