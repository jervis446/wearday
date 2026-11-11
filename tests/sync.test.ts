import assert from 'node:assert/strict';
import { test } from 'node:test';

import { emptySyncState, fingerprint, mergeRemote, pendingChanges, runSync, type Photos, type PushDoc, type Remote, type RemoteDoc, type SyncState } from '../src/lib/sync/engine.ts';
import { ownerAction } from '../src/lib/sync/owner.ts';

/** In-memory stand-in for Supabase with the same rules as push_docs (newer edit wins). */
class FakeCloud implements Remote {
  rows = new Map<string, RemoteDoc>();
  photos = new Map<string, Uint8Array>();
  seq = 0;
  pushes = 0;
  async pull(after: number, limit: number) {
    return [...this.rows.values()].filter((r) => r.seq > after).sort((a, b) => a.seq - b.seq).slice(0, limit).map((r) => structuredClone(r));
  }
  async push(docs: PushDoc[]) {
    this.pushes++;
    for (const d of docs) {
      const k = `${d.kind}:${d.id}`;
      const cur = this.rows.get(k);
      if (cur && d.updated_at <= cur.client_updated_at) continue;
      this.rows.set(k, { kind: d.kind, id: d.id, data: d.deleted ? null : structuredClone(d.data), deleted: d.deleted, client_updated_at: d.updated_at, seq: ++this.seq });
    }
  }
  async uploadPhoto(name: string, bytes: Uint8Array) {
    if (!this.photos.has(name)) this.photos.set(name, bytes);
  }
}

/** A phone: its own data, its own photo folder, its own sync state. */
class Device {
  db: any = { items: [], outfits: [], logs: [], trips: [], collections: [] };
  files = new Map<string, Uint8Array>();
  state: SyncState = emptySyncState();
  name: string;
  cloud: FakeCloud;
  constructor(name: string, cloud: FakeCloud) {
    this.name = name;
    this.cloud = cloud;
  }
  photos: Photos = {
    nameOf: (uri) => uri.split('/').pop() ?? '',
    localUri: (n) => `file:///${this.name}/images/${n}`,
    hasLocal: (n) => this.files.has(n),
    read: async (uri) => this.files.get(uri.split('/').pop()!),
    download: async (n) => {
      const b = this.cloud.photos.get(n);
      if (!b) throw new Error('404');
      this.files.set(n, b);
    },
  };
  addPhoto(n: string, bytes: number[]) {
    this.files.set(n, new Uint8Array(bytes));
    return `file:///${this.name}/images/${n}`;
  }
  async sync(now: number) {
    const r = await runSync({ getDb: () => this.db, apply: (fn) => (this.db = fn(this.db)), state: this.state, remote: this.cloud, photos: this.photos, now: () => now });
    this.state = r.state;
    return r;
  }
}

const item = (id: string, imageUri = '', extra = {}) => ({ id, name: id, category: 'Tops', imageUri, seasons: [], tags: [], wishlist: false, createdAt: 1, ...extra });

test('an item with its photo travels from one phone to another', async () => {
  const cloud = new FakeCloud();
  const a = new Device('a', cloud), b = new Device('b', cloud);
  a.db.items.push(item('tee', a.addPhoto('tee.jpg', [1, 2, 3])));
  const ra = await a.sync(100);
  assert.deepEqual([ra.pushed, ra.photosUp], [1, 1]);
  const rb = await b.sync(101);
  assert.equal(rb.photosDown, 1);
  assert.equal(b.db.items[0].imageUri, 'file:///b/images/tee.jpg');
  assert.deepEqual([...b.files.get('tee.jpg')!], [1, 2, 3]);
  // Nothing left to do on either side
  assert.equal((await a.sync(102)).pushed, 0);
  assert.equal((await b.sync(103)).pushed, 0);
});

test('edits and deletes go both ways', async () => {
  const cloud = new FakeCloud();
  const a = new Device('a', cloud), b = new Device('b', cloud);
  a.db.items.push(item('tee'), item('jeans', '', { category: 'Bottoms' }));
  await a.sync(100);
  await b.sync(101);
  b.db.items = b.db.items.map((i: any) => (i.id === 'tee' ? { ...i, name: 'Blue tee' } : i));
  b.db.outfits.push({ id: 'o1', name: 'Fit', pieces: [{ itemId: 'tee', x: 0.5, y: 0.5, scale: 1 }], tags: [], createdAt: 1 });
  await b.sync(102);
  await a.sync(103);
  assert.equal(a.db.items.find((i: any) => i.id === 'tee').name, 'Blue tee');
  assert.equal(a.db.outfits[0].name, 'Fit');

  a.db.items = a.db.items.filter((i: any) => i.id !== 'jeans');
  await a.sync(104);
  await b.sync(105);
  assert.deepEqual(b.db.items.map((i: any) => i.id), ['tee']);
  assert.equal(cloud.rows.get('item:jeans')!.deleted, true);
});

test('unsynced local edits are never overwritten by a pull; the later sync wins', async () => {
  const cloud = new FakeCloud();
  const a = new Device('a', cloud), b = new Device('b', cloud);
  a.db.items.push(item('tee'));
  await a.sync(100);
  await b.sync(101);
  // Both edit offline
  a.db.items[0] = { ...a.db.items[0], name: 'From A' };
  b.db.items[0] = { ...b.db.items[0], name: 'From B' };
  await a.sync(200);
  await b.sync(300); // B pulls A's edit but keeps its own unsynced edit, then pushes (newer)
  assert.equal(b.db.items[0].name, 'From B');
  await a.sync(400);
  assert.equal(a.db.items[0].name, 'From B');
  assert.equal(cloud.rows.get('item:tee')!.data!.name, 'From B');
});

test('first sign-in on two phones that both had data merges them', async () => {
  const cloud = new FakeCloud();
  const a = new Device('a', cloud), b = new Device('b', cloud);
  a.db.items.push(item('a-only'));
  b.db.items.push(item('b-only'));
  b.db.trips.push({ id: 't1', name: 'Goa', start: '2026-12-01', nights: 3, itemIds: ['b-only'], packed: [], extras: [], createdAt: 1 });
  await a.sync(100);
  await b.sync(101);
  await a.sync(102);
  const ids = (d: Device) => d.db.items.map((i: any) => i.id).sort();
  assert.deepEqual(ids(a), ['a-only', 'b-only']);
  assert.deepEqual(ids(b), ['a-only', 'b-only']);
  assert.equal(a.db.trips[0].name, 'Goa');
});

test('a local delete of something edited elsewhere: the edit wins, nothing is lost silently', async () => {
  const cloud = new FakeCloud();
  const a = new Device('a', cloud), b = new Device('b', cloud);
  a.db.items.push(item('tee'));
  await a.sync(100);
  await b.sync(101);
  b.db.items[0] = { ...b.db.items[0], name: 'Renamed' };
  await b.sync(102);
  a.db.items = []; // deleted on A before seeing B's edit
  await a.sync(103); // pulls B's edit (A has no local copy) → restored, then pushes nothing stale
  assert.equal(a.db.items[0]?.name, 'Renamed');
});

test('large wardrobes push in batches and pull in pages', async () => {
  const cloud = new FakeCloud();
  const a = new Device('a', cloud), b = new Device('b', cloud);
  for (let i = 0; i < 1500; i++) a.db.items.push(item(`i${i}`));
  await a.sync(100);
  assert.ok(cloud.pushes >= 4);
  await b.sync(101);
  assert.equal(b.db.items.length, 1500);
});

test('mergeRemote keeps unsynced local edits and fingerprint is order-independent', () => {
  const photos: Photos = { nameOf: (u) => u, localUri: (n) => n, hasLocal: () => true, read: async () => undefined, download: async () => {} };
  const db: any = { items: [item('tee', '', { name: 'local edit' })], outfits: [], logs: [], trips: [], collections: [] };
  const docs: RemoteDoc[] = [{ kind: 'item', id: 'tee', data: { ...item('tee'), name: 'remote' }, deleted: false, client_updated_at: 5, seq: 1 }];
  const r = mergeRemote(db, docs, { 'item:tee': 'old-fingerprint' }, photos);
  assert.equal(r.db.items[0].name, 'local edit');
  assert.equal(fingerprint({ a: 1, b: [1, 2] }), fingerprint({ b: [1, 2], a: 1 }));
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
});

test('a pull that changes nothing returns the same data object (no re-render)', () => {
  const photos: Photos = { nameOf: (u) => u, localUri: (n) => n, hasLocal: () => true, read: async () => undefined, download: async () => {} };
  const tee = item('tee');
  const db: any = { items: [tee], outfits: [], logs: [], trips: [], collections: [] };
  const fp = fingerprint(tee);
  const docs: RemoteDoc[] = [
    { kind: 'item', id: 'tee', data: { ...tee }, deleted: false, client_updated_at: 5, seq: 1 },
    { kind: 'item', id: 'gone', data: null, deleted: true, client_updated_at: 5, seq: 2 },
  ];
  const r = mergeRemote(db, docs, { 'item:tee': fp }, photos);
  assert.equal(r.db, db);
  assert.equal(r.applied['item:tee'], fp);
});

test('photos stored inside the data (web) still upload and arrive', async () => {
  const cloud = new FakeCloud();
  // Web-like phone: the photo is a data URI in the record; its cloud name is derived from it,
  // and localUri(name) does NOT give back the original string.
  const cache = new Map<string, string>();
  const web: Photos = {
    nameOf: (u) => (u.startsWith('sb:') ? u.slice(3) : u.startsWith('data:') ? `w${u.length}.jpg` : u),
    localUri: (n) => cache.get(n) ?? `sb:${n}`,
    hasLocal: (n) => cache.has(n),
    read: async (u) => (u.startsWith('data:') ? new Uint8Array([7, 7, 7]) : undefined),
    download: async (n) => void cache.set(n, `data:image/jpeg;base64,BBB#sb=${n}`),
  };
  const a: any = { db: { items: [item('tee', 'data:image/jpeg;base64,AAAA')], outfits: [], logs: [], trips: [], collections: [] }, state: emptySyncState() };
  const r = await runSync({ getDb: () => a.db, apply: (fn) => (a.db = fn(a.db)), state: a.state, remote: cloud, photos: web, now: () => 1 });
  assert.equal(r.photosUp, 1);
  const name = `w${'data:image/jpeg;base64,AAAA'.length}.jpg`;
  assert.deepEqual([...cloud.photos.get(name)!], [7, 7, 7]);

  const b = new Device('b', cloud);
  await b.sync(2);
  assert.equal(b.db.items[0].imageUri, `file:///b/images/${name}`);
  assert.ok(b.files.has(name));
});

// ---------- accounts sharing one phone ----------

/**
 * One phone, several accounts (one cloud each). Mirrors SyncProvider: the local data has an
 * owner; signing in adopts ownerless data, keeps your own, and clears someone else's.
 */
class SharedPhone {
  db: any = { items: [], outfits: [], logs: [], trips: [], collections: [] };
  ownerId: string | null = null;
  states = new Map<string, SyncState>();
  files = new Map<string, Uint8Array>();
  uid: string | null = null;
  clouds: Record<string, FakeCloud>;
  constructor(clouds: Record<string, FakeCloud>) {
    this.clouds = clouds;
  }
  photos: Photos = {
    nameOf: (uri) => uri.split('/').pop() ?? '',
    localUri: (n) => `file:///phone/images/${n}`,
    hasLocal: (n) => this.files.has(n),
    read: async (uri) => this.files.get(uri.split('/').pop()!),
    download: async (n) => {
      const b = this.uid ? this.clouds[this.uid].photos.get(n) : undefined;
      if (!b) throw new Error('404');
      this.files.set(n, b);
    },
  };
  signIn(uid: string) {
    this.uid = uid;
    const action = ownerAction(this.ownerId, uid);
    if (action === 'reset') {
      this.states.delete(this.ownerId!);
      this.db = { items: [], outfits: [], logs: [], trips: [], collections: [] };
      this.files.clear();
    }
    this.ownerId = uid;
    return action;
  }
  signOut() {
    this.states.delete(this.uid!);
    this.uid = null;
  }
  pending() {
    return pendingChanges(this.db, this.states.get(this.uid!) ?? emptySyncState(), this.photos);
  }
  async sync(now: number) {
    const uid = this.uid!;
    assert.equal(this.ownerId, uid, 'never syncs data owned by another account');
    const r = await runSync({ getDb: () => this.db, apply: (fn) => (this.db = fn(this.db)), state: this.states.get(uid) ?? emptySyncState(), remote: this.clouds[uid], photos: this.photos, now: () => now });
    this.states.set(uid, r.state);
    return r;
  }
}

const cloudIds = (c: FakeCloud) => [...c.rows.values()].filter((r) => !r.deleted).map((r) => r.id).sort();

test('ownerAction: adopt ownerless data, keep your own, reset someone else’s', () => {
  assert.equal(ownerAction(null, 'u1'), 'adopt');
  assert.equal(ownerAction(undefined, 'u1'), 'adopt');
  assert.equal(ownerAction('', 'u1'), 'adopt');
  assert.equal(ownerAction('u1', 'u1'), 'keep');
  assert.equal(ownerAction('u1', 'u2'), 'reset');
});

test('a different account signing in on the same phone never receives the previous owner’s wardrobe', async () => {
  const clouds = { alice: new FakeCloud(), bob: new FakeCloud() };
  clouds.bob.rows.set('item:bob-coat', { kind: 'item', id: 'bob-coat', data: item('bob-coat'), deleted: false, client_updated_at: 1, seq: ++clouds.bob.seq });
  const phone = new SharedPhone(clouds);

  // Data made before anyone signed in (or by the older no-login version) is adopted by the first account.
  phone.files.set('tee.jpg', new Uint8Array([1]));
  phone.db.items.push(item('alice-tee', 'file:///phone/images/tee.jpg'));
  assert.equal(phone.signIn('alice'), 'adopt');
  await phone.sync(100);
  assert.deepEqual(cloudIds(clouds.alice), ['alice-tee']);
  assert.ok(clouds.alice.photos.has('tee.jpg'));

  // Alice edits, syncs, and signs out with nothing pending.
  phone.db.items.push(item('alice-jeans'));
  await phone.sync(101);
  assert.equal(phone.pending(), 0);
  phone.signOut();

  // Bob signs in: Alice's data is cleared first, never merged or pushed into Bob's account.
  assert.equal(phone.signIn('bob'), 'reset');
  await phone.sync(200);
  assert.deepEqual(cloudIds(clouds.bob), ['bob-coat']);
  assert.equal(clouds.bob.photos.size, 0);
  assert.deepEqual(phone.db.items.map((i: any) => i.id), ['bob-coat']);
  assert.ok(!phone.files.has('tee.jpg'));
  // …and Bob's empty phone didn't delete anything from Alice's account either.
  assert.deepEqual(cloudIds(clouds.alice), ['alice-jeans', 'alice-tee']);
  phone.signOut();

  // Alice comes back: her wardrobe comes down from her cloud, without Bob's.
  assert.equal(phone.signIn('alice'), 'reset');
  await phone.sync(300);
  assert.deepEqual(phone.db.items.map((i: any) => i.id).sort(), ['alice-jeans', 'alice-tee']);
  assert.deepEqual(cloudIds(clouds.bob), ['bob-coat']);
});

test('signing back in as the same account keeps local changes and pushes them', async () => {
  const clouds = { alice: new FakeCloud() };
  const phone = new SharedPhone(clouds);
  assert.equal(phone.signIn('alice'), 'adopt');
  phone.db.items.push(item('tee'));
  await phone.sync(100);
  phone.db.items.push(item('offline-edit')); // made while offline, then signed out
  assert.equal(phone.pending(), 1);
  phone.signOut();
  assert.equal(phone.signIn('alice'), 'keep');
  await phone.sync(200);
  assert.deepEqual(cloudIds(clouds.alice), ['offline-edit', 'tee']);
});

test('pendingChanges counts unsynced new, edited and deleted records', async () => {
  const clouds = { alice: new FakeCloud() };
  const phone = new SharedPhone(clouds);
  phone.signIn('alice');
  phone.db.items.push(item('a'), item('b'), item('c'));
  assert.equal(phone.pending(), 3);
  await phone.sync(100);
  assert.equal(phone.pending(), 0);
  phone.db.items = phone.db.items.filter((i: any) => i.id !== 'a').map((i: any) => (i.id === 'b' ? { ...i, name: 'B!' } : i));
  phone.db.items.push(item('d'));
  assert.equal(phone.pending(), 3); // a deleted, b edited, d new
});
