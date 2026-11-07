import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as jpeg from 'jpeg-js';

import { categoryFromLabels, dominantColorName } from './tagging';
import type { Category } from './types';

/**
 * On-device auto-tagging for a newly photographed item. Nothing leaves the phone.
 * - Colour: shrinks the photo to 32×32 and finds the dominant non-background colour (works everywhere).
 * - Category: Google ML Kit image labeling. Only available in a real build, not in Expo Go or on web;
 *   when unavailable it returns undefined and the user picks the category as before.
 */
export async function autoTag(uri: string): Promise<{ color?: string; category?: Category }> {
  const [color, category] = await Promise.all([detectColor(uri).catch(() => undefined), detectCategory(uri)]);
  return { color, category };
}

// ---------- colour ----------

const SIZE = 32;

export async function detectColor(uri: string): Promise<string | undefined> {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: SIZE, height: SIZE }).renderAsync();
  const { base64 } = await ref.saveAsync({ format: SaveFormat.JPEG, base64: true, compress: 1 });
  if (!base64) return undefined;
  const { data } = jpeg.decode(base64ToBytes(base64), { useTArray: true, formatAsRGBA: true });
  return dominantColorName(data, SIZE, SIZE);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function detectCategory(uri: string): Promise<Category | undefined> {
  try {
    // Loaded lazily: the native module only exists in a development/production build.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ImageLabeling = require('@react-native-ml-kit/image-labeling').default;
    const labels = await ImageLabeling.label(uri);
    return categoryFromLabels(labels ?? []);
  } catch {
    return undefined;
  }
}
