import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cleanDisplayName,
  cleanItemNames,
  cleanText,
  displayNameProblem,
  MAX_FIT_ITEMS,
  normalizeUsername,
  reactionOf,
  timeAgo,
  usernameProblem,
} from '../src/lib/social/rules.ts';

test('usernames: normalised the way people type them, same rules as the database', () => {
  assert.equal(normalizeUsername('  @@Ana.Styles '), 'ana.styles');
  for (const ok of ['ana', 'ana.styles', 'a_b_c', 'x1y2z3', 'a'.repeat(20)]) assert.equal(usernameProblem(ok), undefined, ok);
  for (const bad of ['ab', 'a'.repeat(21), 'has space', 'émile', 'a-b', '.ana', 'ana.', 'an..a', 'ana😀']) assert.ok(usernameProblem(bad), bad);
});

test('display names are trimmed, single-spaced and free of control characters', () => {
  assert.equal(cleanDisplayName('  Ana \n\t Banana\u0007 '), 'Ana Banana');
  assert.ok(displayNameProblem(''));
  assert.ok(displayNameProblem('x'.repeat(41)));
  assert.equal(displayNameProblem('Ana'), undefined);
});

test('captions, comments and item names stay within the limits', () => {
  assert.equal(cleanText('   ', 200), undefined);
  assert.equal(cleanText('  hi  ', 200), 'hi');
  assert.equal(cleanText('x'.repeat(300), 200)!.length, 200);
  const names = cleanItemNames([' Tee ', 'Tee', '', 'x'.repeat(80), ...Array.from({ length: 12 }, (_, i) => `Item ${i}`)]);
  assert.equal(names.length, MAX_FIT_ITEMS);
  assert.deepEqual(names.slice(0, 2), ['Tee', 'x'.repeat(60)]);
});

test('reactions and relative times', () => {
  assert.equal(reactionOf('fire')?.emoji, '🔥');
  assert.equal(reactionOf('meh'), undefined);
  const now = Date.parse('2026-11-11T12:00:00Z');
  assert.equal(timeAgo('2026-11-11T11:59:30Z', now), 'now');
  assert.equal(timeAgo('2026-11-11T11:15:00Z', now), '45m');
  assert.equal(timeAgo('2026-11-11T07:00:00Z', now), '5h');
  assert.equal(timeAgo('2026-11-09T12:00:00Z', now), '2d');
  assert.equal(timeAgo('2026-11-12T12:00:00Z', now), 'now', 'clock skew never shows negative times');
});
