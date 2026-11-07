import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fileName, unreferenced } from '../src/lib/files.ts';

test('fileName strips folders and query strings', () => {
  assert.equal(fileName('file:///data/user/0/app/files/images/123-abc.jpg'), '123-abc.jpg');
  assert.equal(fileName('file:///x/images/a.png?v=2'), 'a.png');
});

test('unreferenced keeps photos still used by items or selfies', () => {
  const existing = ['item1.jpg', 'selfie1.jpg', 'cancelled.jpg', 'deleted.jpg'];
  const referenced = ['file:///docs/images/item1.jpg', undefined, 'file:/docs/images/selfie1.jpg'];
  assert.deepEqual(unreferenced(existing, referenced), ['cancelled.jpg', 'deleted.jpg']);
});

test('nothing referenced means everything is stale; nothing on disk means nothing to delete', () => {
  assert.deepEqual(unreferenced(['a.jpg'], []), ['a.jpg']);
  assert.deepEqual(unreferenced([], ['file:///images/a.jpg']), []);
});
