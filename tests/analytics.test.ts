import assert from 'node:assert/strict';
import { test } from 'node:test';

import { safeProps, screenName } from '../src/lib/analyticsUtil.ts';

test('only safe values leave the phone', () => {
  assert.deepEqual(
    safeProps({ items: 3, ok: true, source: 'ai', name: 'My lovely grandmother’s silk wedding scarf', email: 'a@b.co', nan: NaN, none: undefined }),
    { items: 3, ok: true, source: 'ai' },
  );
});

test('screen names never contain record ids', () => {
  assert.equal(screenName('/item/mw64p0tw2nykzx'), '/item/[id]');
  assert.equal(screenName('/item/edit'), '/item/edit');
  assert.equal(screenName('/outfit/o-office'), '/outfit/[id]');
  assert.equal(screenName('/outfit/new'), '/outfit/new');
  assert.equal(screenName('/outfit/share'), '/outfit/share');
  assert.equal(screenName('/trip/t-goa'), '/trip/[id]');
  assert.equal(screenName('/stats'), '/stats');
  assert.equal(screenName('/'), '/');
});
