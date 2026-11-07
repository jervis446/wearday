import assert from 'node:assert/strict';
import { test } from 'node:test';

import { zipSync, strToU8 } from 'fflate';

import { BackupError, backupImageName, imageRefs, packBackup, unpackBackup } from '../src/lib/backupFormat.ts';
import { DEFAULT_SETTINGS } from '../src/lib/settingsModel.ts';

const db = {
  items: [
    { id: 'a', imageUri: 'file:///docs/images/111-x.jpg', name: 'Tee', category: 'Tops', seasons: [], tags: [], wishlist: false, createdAt: 1 },
    { id: 'b', imageUri: 'file:///docs/images/222-y.png', name: 'Jeans', category: 'Bottoms', seasons: [], tags: [], wishlist: false, createdAt: 2 },
    { id: 'c', imageUri: 'file:///docs/images/gone.jpg', name: 'Lost', category: 'Shoes', seasons: [], tags: [], wishlist: false, createdAt: 3 },
  ],
  outfits: [{ id: 'o', name: 'Fit', pieces: [{ itemId: 'a', x: 0.5, y: 0.5, scale: 1 }], tags: [], createdAt: 4 }],
  logs: [{ id: 'l', date: '2026-11-07', itemIds: ['a', 'b'], selfieUri: 'file:///docs/images/333-selfie.jpg' }],
} as any;

const bytes = (n: number) => new Uint8Array([n, n + 1, n + 2]);
const images = new Map([
  ['file:///docs/images/111-x.jpg', bytes(1)],
  ['file:///docs/images/222-y.png', bytes(2)],
  ['file:///docs/images/333-selfie.jpg', bytes(3)],
]);

test('round trip keeps data, settings and photos', () => {
  const zip = packBackup(db, { ...DEFAULT_SETTINGS, currency: 'EUR' }, images, new Date('2026-11-07T10:00:00Z'));
  const { data, images: out } = unpackBackup(zip);
  assert.equal(data.exportedAt, '2026-11-07T10:00:00.000Z');
  assert.equal(data.settings.currency, 'EUR');
  assert.equal(data.db.outfits[0].name, 'Fit');
  assert.deepEqual(data.db.logs[0].itemIds, ['a', 'b']);

  const tee = backupImageName(data.db.items[0].imageUri)!;
  const jeans = backupImageName(data.db.items[1].imageUri)!;
  const selfie = backupImageName(data.db.logs[0].selfieUri!)!;
  assert.deepEqual([...out[tee]], [1, 2, 3]);
  assert.match(jeans, /\.png$/);
  assert.deepEqual([...out[selfie]], [3, 4, 5]);
  // Unreadable photo: reference cleared, nothing invented
  assert.equal(data.db.items[2].imageUri, '');
  assert.equal(Object.keys(out).length, 3);
});

test('imageRefs lists each photo once', () => {
  assert.equal(imageRefs(db).length, 4);
});

test('rejects files that are not Wearday backups', () => {
  assert.throws(() => unpackBackup(new Uint8Array([1, 2, 3])), BackupError);
  assert.throws(() => unpackBackup(zipSync({ 'other.json': strToU8('{}') })), /isn’t a Wearday backup/);
  assert.throws(() => unpackBackup(zipSync({ 'wearday.json': strToU8('{not json') })), /damaged/);
  assert.throws(
    () => unpackBackup(zipSync({ 'wearday.json': strToU8(JSON.stringify({ app: 'wearday', version: 99, db })) })),
    /newer version/,
  );
});
