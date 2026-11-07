import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planReminders, reminderBody, shiftTime } from '../src/lib/reminderPlan.ts';

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('schedules the next 14 days at the chosen time', () => {
  const now = new Date(2026, 10, 7, 7, 0); // 07:00, before the 08:30 reminder
  const plan = planReminders(now, 8, 30, new Set());
  assert.equal(plan.length, 14);
  assert.equal(key(plan[0]), '2026-11-07');
  assert.equal(plan[0].getHours(), 8);
  assert.equal(plan[0].getMinutes(), 30);
  assert.equal(key(plan[13]), '2026-11-20');
});

test('skips today when the time has passed or today is already logged', () => {
  const after = planReminders(new Date(2026, 10, 7, 9, 0), 8, 30, new Set());
  assert.equal(key(after[0]), '2026-11-08');
  const logged = planReminders(new Date(2026, 10, 7, 7, 0), 8, 30, new Set(['2026-11-07', '2026-11-09']));
  assert.deepEqual(logged.slice(0, 2).map(key), ['2026-11-08', '2026-11-10']);
  assert.equal(logged.length, 12);
});

test('crosses month and year boundaries', () => {
  const plan = planReminders(new Date(2026, 11, 30, 23, 0), 8, 0, new Set(), 4); // today (30th) already past 08:00
  assert.deepEqual(plan.map(key), ['2026-12-31', '2027-01-01', '2027-01-02']);
});

test('shiftTime wraps around midnight', () => {
  assert.deepEqual(shiftTime(8, 30, 15), { hour: 8, minute: 45 });
  assert.deepEqual(shiftTime(23, 45, 15), { hour: 0, minute: 0 });
  assert.deepEqual(shiftTime(0, 0, -15), { hour: 23, minute: 45 });
});

test('reminder text rotates', () => {
  assert.notEqual(reminderBody(new Date(2026, 10, 1)), reminderBody(new Date(2026, 10, 2)));
});
