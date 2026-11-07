import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addDays, packingCounts, packProgress, seasonOf, suggestPacking, tripEnd } from '../src/lib/packing.ts';

const item = (id: string, category: string, extra: Record<string, unknown> = {}) =>
  ({ id, category, name: id, imageUri: '', seasons: [], tags: [], wishlist: false, createdAt: 0, ...extra }) as any;

test('dates and seasons', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(tripEnd({ start: '2026-11-14', nights: 3 }), '2026-11-17');
  assert.equal(seasonOf('2026-07-01'), 'Summer');
  assert.equal(seasonOf('2026-12-01'), 'Winter');
});

test('counts scale with trip length', () => {
  assert.deepEqual(packingCounts(2, 'Summer'), { Tops: 3, Bottoms: 1, Dresses: 1, Shoes: 1, Outerwear: 0, Bags: 1 });
  const long = packingCounts(13, 'Winter');
  assert.equal(long.Tops, 7);
  assert.equal(long.Bottoms, 3);
  assert.equal(long.Shoes, 2);
  assert.equal(long.Outerwear, 1);
});

test('prefers in-season favourites and skips unavailable items', () => {
  const items = [
    item('tee-fav', 'Tops'),
    item('tee-rare', 'Tops'),
    item('wool', 'Tops', { seasons: ['Winter'] }),
    item('lent-tee', 'Tops', { status: 'lent' }),
    item('wish-tee', 'Tops', { wishlist: true }),
    item('laundry-jeans', 'Bottoms', { status: 'laundry' }),
    item('coat', 'Outerwear'),
  ];
  const picks = suggestPacking(items, { start: '2026-07-10', nights: 1 }, { 'tee-fav': 9, 'tee-rare': 1, wool: 20 });
  // 2 days in summer: 2 tops, wool sweater is out of season, lent and wishlist skipped
  assert.deepEqual(picks, ['tee-fav', 'tee-rare', 'laundry-jeans']);
});

test('progress counts clothes and extras', () => {
  assert.deepEqual(
    packProgress({ itemIds: ['a', 'b', 'c'], packed: ['a', 'zzz'], extras: [{ id: 'x', text: 'Charger', packed: true }, { id: 'y', text: 'ID', packed: false }] }),
    { done: 2, total: 5 },
  );
});
