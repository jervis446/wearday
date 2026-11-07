import assert from 'node:assert/strict';
import { test } from 'node:test';

import { colorBreakdown, declutterCandidates, logStreak, monthlySpend, swatchFor } from '../src/lib/insights.ts';

const DAY = 864e5;
const now = new Date(2026, 10, 7, 12).getTime();
const item = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, name: id, category: 'Tops', imageUri: '', seasons: [], tags: [], wishlist: false, createdAt: now, ...extra }) as any;

test('colour breakdown groups case-insensitively, most common first, unset last', () => {
  const rows = colorBreakdown([
    item('a', { color: 'Navy' }), item('b', { color: 'navy ' }), item('c', { color: 'Black' }), item('d'), item('e', { color: 'Mauve' }),
  ]);
  assert.deepEqual(rows.map((r) => [r.name, r.count]), [['Navy', 2], ['Black', 1], ['Mauve', 1], ['Not set', 1]]);
  assert.equal(rows[0].swatch, '#1c2a4f');
  assert.equal(rows[2].swatch, undefined);
  assert.equal(swatchFor('Light Blue'), '#a8c8e8');
});

test('monthly spend covers the last N months, oldest first', () => {
  const rows = monthlySpend(
    [
      item('nov', { price: 1200, createdAt: new Date(2026, 10, 2).getTime() }),
      item('nov2', { price: 300, createdAt: new Date(2026, 10, 5).getTime() }),
      item('jul', { price: 50, createdAt: new Date(2026, 6, 20).getTime() }),
      item('old', { price: 999, createdAt: new Date(2025, 10, 1).getTime() }),
    ],
    new Date(now),
    6,
  );
  assert.deepEqual(rows.map((r) => r.key), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.deepEqual(rows.map((r) => r.total), [0, 50, 0, 0, 0, 1500]);
  assert.equal(rows[5].count, 2);
});

test('declutter: owned 6+ months and not worn in that time', () => {
  const old = now - 400 * DAY;
  const rows = declutterCandidates(
    [
      item('never', { createdAt: old }),
      item('stale', { createdAt: old }),
      item('recent-wear', { createdAt: old }),
      item('new', { createdAt: now - 10 * DAY }),
    ],
    { stale: '2026-01-15', 'recent-wear': '2026-10-01' },
    '2026-11-07',
    now,
  );
  assert.deepEqual(rows.map((r) => r.item.id), ['never', 'stale']);
});

test('streak counts back from today, or from yesterday if today is not logged yet', () => {
  const dates = new Set(['2026-11-07', '2026-11-06', '2026-11-05', '2026-11-03']);
  assert.equal(logStreak(dates, '2026-11-07'), 3);
  assert.equal(logStreak(new Set(['2026-11-06', '2026-11-05']), '2026-11-07'), 2);
  assert.equal(logStreak(new Set(['2026-11-04']), '2026-11-07'), 0);
  assert.equal(logStreak(new Set(['2026-12-31', '2027-01-01']), '2027-01-01'), 2);
});
