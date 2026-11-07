import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canAddCollection, canAddTrip, canSync, canUseAi, FREE_LIMITS, parsePeriod, trialLabel, yearlySavings } from '../src/lib/plans.ts';

test('free plan limits, premium unlimited', () => {
  assert.equal(canUseAi(false, 0), true);
  assert.equal(canUseAi(false, 1), false);
  assert.equal(canUseAi(true, 99), true);
  assert.equal(canAddTrip(false, 0), true);
  assert.equal(canAddTrip(false, 1), false);
  assert.equal(canAddCollection(false, 1), true);
  assert.equal(canAddCollection(false, 2), false);
  assert.equal(canSync(false, FREE_LIMITS.syncItems), true);
  assert.equal(canSync(false, FREE_LIMITS.syncItems + 1), false);
  assert.equal(canSync(true, 5000), true);
});

test('trial labels and savings', () => {
  assert.deepEqual(parsePeriod('P7D'), { unit: 'D', count: 7 });
  assert.equal(trialLabel(parsePeriod('P7D')), '7-day free trial');
  assert.equal(trialLabel(parsePeriod('P1W')), '7-day free trial');
  assert.equal(trialLabel(parsePeriod('P1M')), '1-month free trial');
  assert.equal(trialLabel(null), null);
  assert.equal(yearlySavings(99, 599), 49);
  assert.equal(yearlySavings(99, 1300), null);
  assert.equal(yearlySavings(null, 599), null);
});
