import assert from 'node:assert/strict';
import { test } from 'node:test';

import jpeg from 'jpeg-js';

import { categoryFromLabels, dominantColorName, nameColor } from '../src/lib/tagging.ts';

/** A 32×32 photo-like image: `item` colour in the middle on a `bg` background, round-tripped through JPEG. */
function photo(item: number[], bg: number[], fill = 0.5) {
  const w = 32, h = 32, data = Buffer.alloc(w * h * 4);
  const pad = Math.round((w * (1 - fill)) / 2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inside = x >= pad && x < w - pad && y >= pad && y < h - pad;
      const c = inside ? item : bg;
      data.set([...c, 255], (y * w + x) * 4);
    }
  const encoded = jpeg.encode({ data, width: w, height: h }, 90).data;
  return jpeg.decode(encoded, { useTArray: true, formatAsRGBA: true }).data;
}

test('names common clothing colours', () => {
  const cases: [number[], string][] = [
    [[20, 20, 22], 'Black'], [[250, 250, 248], 'White'], [[128, 128, 128], 'Grey'],
    [[25, 35, 75], 'Navy'], [[60, 110, 180], 'Blue'], [[160, 200, 235], 'Light blue'],
    [[200, 30, 40], 'Red'], [[110, 20, 35], 'Burgundy'], [[240, 170, 190], 'Pink'],
    [[110, 70, 40], 'Brown'], [[225, 205, 175], 'Beige'], [[85, 90, 40], 'Olive'],
    [[40, 140, 70], 'Green'], [[120, 60, 160], 'Purple'], [[240, 200, 40], 'Yellow'],
  ];
  for (const [rgb, name] of cases) assert.equal(nameColor(rgb as [number, number, number]), name, `rgb(${rgb})`);
});

test('ignores a plain background', () => {
  assert.equal(dominantColorName(photo([25, 35, 75], [245, 245, 245]), 32, 32), 'Navy');
  assert.equal(dominantColorName(photo([200, 30, 40], [190, 175, 150]), 32, 32), 'Red');
});

test('white item on a white-ish background falls back to the whole image', () => {
  assert.equal(dominantColorName(photo([252, 252, 252], [246, 246, 246]), 32, 32), 'White');
});

test('item filling the frame', () => {
  assert.equal(dominantColorName(photo([40, 140, 70], [40, 140, 70], 1), 32, 32), 'Green');
});

test('maps ML Kit labels to categories, ignoring low confidence', () => {
  assert.equal(categoryFromLabels([{ text: 'Jeans', confidence: 0.92 }, { text: 'Denim', confidence: 0.9 }]), 'Bottoms');
  assert.equal(categoryFromLabels([{ text: 'Sneakers', confidence: 0.8 }]), 'Shoes');
  assert.equal(categoryFromLabels([{ text: 'Shoe', confidence: 0.3 }, { text: 'Jacket', confidence: 0.7 }]), 'Outerwear');
  assert.equal(categoryFromLabels([{ text: 'Handbag', confidence: 0.75 }]), 'Bags');
  assert.equal(categoryFromLabels([{ text: 'Sunglasses', confidence: 0.88 }]), 'Accessories');
  assert.equal(categoryFromLabels([{ text: 'Textile', confidence: 0.95 }]), undefined);
  // "top" must not match inside unrelated words like "laptop"
  assert.equal(categoryFromLabels([{ text: 'Laptop', confidence: 0.9 }]), undefined);
});
