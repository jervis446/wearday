import type { Category } from './types';

/** Pure helpers for auto-tagging (no React Native imports, so they can be unit tested). */

type RGB = [number, number, number];

/** Exported for tests. `data` is RGBA, row-major. */
export function dominantColorName(data: ArrayLike<number>, w: number, h: number): string | undefined {
  const px = (x: number, y: number): RGB => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };

  // Background = average of the border pixels (clothes are usually shot on a plain surface).
  const border: RGB[] = [];
  for (let x = 0; x < w; x++) border.push(px(x, 0), px(x, h - 1));
  for (let y = 1; y < h - 1; y++) border.push(px(0, y), px(w - 1, y));
  const bg = average(border);

  const all: RGB[] = [];
  const fg: RGB[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = px(x, y);
      all.push(p);
      if (dist(p, bg) > 60) fg.push(p);
    }
  // If almost nothing stands out, the item fills the frame (or matches the background).
  const pool = fg.length >= all.length * 0.08 ? fg : all;

  // Bucket into a coarse grid and take the most common bucket's average.
  const buckets = new Map<string, RGB[]>();
  for (const p of pool) {
    const key = p.map((c) => c >> 5).join(',');
    const b = buckets.get(key);
    if (b) b.push(p);
    else buckets.set(key, [p]);
  }
  let best: RGB[] = [];
  for (const b of buckets.values()) if (b.length > best.length) best = b;
  return best.length ? nameColor(average(best)) : undefined;
}

function average(ps: RGB[]): RGB {
  const s = ps.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]] as RGB, [0, 0, 0] as RGB);
  return [s[0] / ps.length, s[1] / ps.length, s[2] / ps.length];
}

function dist(a: RGB, b: RGB) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Maps an RGB value to a plain clothing colour name. Exported for tests. */
export function nameColor([r, g, b]: RGB): string {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d) {
    const [rr, gg, bb] = [r / 255, g / 255, b / 255];
    if (max === rr) hue = 60 * (((gg - bb) / d) % 6);
    else if (max === gg) hue = 60 * ((bb - rr) / d + 2);
    else hue = 60 * ((rr - gg) / d + 4);
    if (hue < 0) hue += 360;
  }

  if (l < 0.13) return 'Black';
  if (s < 0.14 || (s < 0.22 && l > 0.8)) {
    if (l > 0.88) return 'White';
    if (l > 0.6) return 'Light grey';
    if (l > 0.3) return 'Grey';
    return 'Charcoal';
  }
  if (hue < 15 || hue >= 345) return l < 0.3 ? 'Burgundy' : l > 0.72 ? 'Pink' : 'Red';
  if (hue < 45) {
    if (l > 0.68 && s < 0.6) return 'Beige';
    if (l < 0.45) return 'Brown';
    return s < 0.45 ? 'Camel' : 'Orange';
  }
  if (hue < 70) {
    if (l > 0.7 && s < 0.6) return 'Cream';
    if (l < 0.35) return 'Olive';
    return s < 0.4 ? 'Khaki' : 'Yellow';
  }
  if (hue < 165) return l < 0.32 || s < 0.3 ? 'Olive' : 'Green';
  if (hue < 195) return 'Teal';
  if (hue < 255) {
    if (l < 0.3) return 'Navy';
    return l > 0.65 ? 'Light blue' : 'Blue';
  }
  if (hue < 290) return 'Purple';
  return l > 0.65 ? 'Pink' : 'Magenta';
}

const KEYWORDS: [Category, string[]][] = [
  ['Shoes', ['shoe', 'sneaker', 'boot', 'sandal', 'footwear', 'heel', 'slipper', 'loafer']],
  ['Dresses', ['dress', 'gown', 'jumpsuit']],
  ['Outerwear', ['coat', 'jacket', 'blazer', 'parka', 'raincoat', 'overcoat']],
  ['Bottoms', ['jeans', 'denim', 'pants', 'trousers', 'shorts', 'skirt', 'leggings']],
  ['Bags', ['bag', 'handbag', 'backpack', 'purse', 'luggage', 'suitcase', 'wallet']],
  ['Accessories', ['hat', 'cap', 'scarf', 'glove', 'sunglasses', 'glasses', 'belt', 'watch', 'jewelry', 'necklace', 'tie', 'sock', 'earring', 'bracelet']],
  ['Tops', ['shirt', 't-shirt', 'top', 'blouse', 'sweater', 'jersey', 'sweatshirt', 'hoodie', 'polo', 'cardigan', 'tank']],
];

/** Exported for tests. Picks the first category whose keyword appears in a confident label. */
export function categoryFromLabels(labels: { text: string; confidence: number }[]): Category | undefined {
  const sorted = [...labels].filter((l) => l.confidence >= 0.5).sort((a, b) => b.confidence - a.confidence);
  for (const label of sorted) {
    const words = label.text.toLowerCase();
    for (const [category, keys] of KEYWORDS) {
      if (keys.some((k) => new RegExp(`\\b${k}`).test(words))) return category;
    }
  }
  return undefined;
}
