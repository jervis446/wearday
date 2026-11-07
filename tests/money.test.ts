import assert from 'node:assert/strict';
import { test } from 'node:test';

import { currencySymbol, formatMoney, parsePrice } from '../src/lib/moneyFormat.ts';

test('parsePrice understands how people type prices', () => {
  const cases: [string, number | undefined][] = [
    ['1200', 1200], ['1,200', 1200], ['1,200,000', 1200000], ['12,5', 12.5], ['12,50', 12.5],
    ['1.200,50', 1200.5], ['1,200.50', 1200.5], ['1.200.000', 1200000], ['₹ 1,999.00', 1999],
    ['$19.99', 19.99], ['', undefined], ['abc', undefined], ['-5', undefined],
  ];
  for (const [input, want] of cases) assert.equal(parsePrice(input), want, input);
});

test('formatMoney uses the currency and drops needless decimals', () => {
  assert.equal(formatMoney(1200, 'INR', { locale: 'en-IN' }), '₹1,200');
  assert.equal(formatMoney(19.99, 'USD', { locale: 'en-US' }), '$19.99');
  assert.equal(formatMoney(1234.56, 'EUR', { locale: 'en-US', compact: true }), '€1,235');
  assert.equal(formatMoney(12.5, 'GBP', { locale: 'en-GB', compact: true }), '£12.50');
  assert.equal(formatMoney(5, 'XXX1'), 'XXX1 5');
});

test('currencySymbol', () => {
  assert.equal(currencySymbol('INR', 'en-IN'), '₹');
  assert.equal(currencySymbol('USD', 'en-US'), '$');
});
