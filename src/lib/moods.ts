/**
 * Moods people can pick when asking for an outfit. The AI gets the label and hint; the offline
 * picker uses the colour and tag words. No platform imports, so it runs under Node for tests.
 */

export type Mood = {
  label: string;
  emoji: string;
  /** What the mood means for clothes, in words a stylist (or the model) can act on. */
  hint: string;
  /** Colour words that suit the mood (matched against an item's colour, lowercase). */
  colors: string[];
  /** Tag / name words that suit the mood. */
  words: string[];
};

const NEUTRALS = ['black', 'white', 'grey', 'gray', 'navy', 'beige', 'cream', 'camel', 'brown', 'tan', 'khaki', 'olive', 'charcoal', 'ivory'];
const BRIGHTS = ['red', 'yellow', 'orange', 'pink', 'green', 'purple', 'turquoise', 'teal', 'coral', 'lime', 'fuchsia', 'magenta', 'multi', 'print'];
const SOFTS = ['pink', 'blush', 'lavender', 'lilac', 'cream', 'ivory', 'white', 'peach', 'mint', 'sky', 'pastel', 'rose'];

export const MOODS: Mood[] = [
  { label: 'Cozy', emoji: '😌', hint: 'soft, comfortable, relaxed layers; nothing tight or fussy', colors: [...NEUTRALS, 'cream', 'oatmeal'], words: ['cozy', 'comfy', 'knit', 'sweater', 'hoodie', 'cardigan', 'fleece', 'lounge', 'relaxed', 'sweatshirt', 'joggers'] },
  { label: 'Confident', emoji: '⚡', hint: 'sharp, polished and put-together, with one statement piece', colors: ['black', 'white', 'navy', 'red', 'camel', 'charcoal'], words: ['blazer', 'tailored', 'statement', 'leather', 'boots', 'heels', 'formal', 'smart', 'work'] },
  { label: 'Playful', emoji: '🌈', hint: 'fun colours, prints and unexpected combinations', colors: BRIGHTS, words: ['print', 'pattern', 'graphic', 'colourful', 'colorful', 'fun', 'party', 'stripes', 'floral'] },
  { label: 'Low-key', emoji: '🖤', hint: 'simple, neutral and understated; easy basics', colors: NEUTRALS, words: ['basic', 'minimal', 'plain', 'casual', 'tee', 't-shirt', 'jeans', 'sneakers', 'everyday'] },
  { label: 'Romantic', emoji: '🌸', hint: 'soft colours, flowy shapes and delicate details', colors: SOFTS, words: ['dress', 'skirt', 'lace', 'silk', 'satin', 'floral', 'flowy', 'blouse', 'date'] },
  { label: 'Energetic', emoji: '🔥', hint: 'sporty, easy to move in, bright accents', colors: [...BRIGHTS, 'white', 'black'], words: ['sport', 'gym', 'active', 'running', 'sneakers', 'trainers', 'shorts', 'track', 'athleisure'] },
];

export const moodByLabel = (label?: string) => MOODS.find((m) => m.label === label);
export const moodChip = (m: Mood) => `${m.emoji} ${m.label}`;
export const moodFromChip = (chip: string) => MOODS.find((m) => moodChip(m) === chip);

/** 0..2: how well an item suits a mood (colour match + word match in name/tags/category). */
export function moodFit(mood: Mood, item: { name?: string; color?: string; tags?: string[]; category?: string }): number {
  const color = (item.color ?? '').toLowerCase();
  const text = [item.name, item.category, ...(item.tags ?? [])].join(' ').toLowerCase();
  const colorHit = !!color && mood.colors.some((c) => color.includes(c));
  const wordHit = mood.words.some((w) => text.includes(w));
  return (colorHit ? 1 : 0) + (wordHit ? 1 : 0);
}
