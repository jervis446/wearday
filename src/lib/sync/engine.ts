import type { Db } from '../types';

/**
 * Two-way sync between the local store and the cloud.
 *
 * How it works:
 * - Every record is one cloud "doc" keyed by kind + id.
 * - Instead of tracking every edit, the engine remembers a fingerprint of each record as it
 *   was at the last sync. A record whose fingerprint changed has local edits; a fingerprint
 *   with no record behind it means the record was deleted locally.
 * - Pull first (apply cloud changes, but never over unsynced local edits), then push.
 * - Photos travel separately: in synced data a photo is referenced as "sb:<file name>".
 *
 * No platform imports here, so it runs under plain Node for tests.
 */

export type Kind = 'item' | 'outfit' | 'log' | 'trip' | 'collection';
export const KINDS: Kind[] = ['item', 'outfit', 'log', 'trip', 'collection'];
const LIST: Record<Kind, keyof Db> = { item: 'items', outfit: 'outfits', log: 'logs', trip: 'trips', collection: 'collections' };
/** Fields holding photo URIs, per kind. */
const PHOTO_FIELDS: Partial<Record<Kind, string>> = { item: 'imageUri', log: 'selfieUri' };

export type RemoteDoc = { kind: Kind; id: string; data: Record<string, unknown> | null; deleted: boolean; client_updated_at: number; seq: number };
export type PushDoc = { kind: Kind; id: string; data: Record<string, unknown> | null; deleted: boolean; updated_at: number };

/** The cloud side (Supabase in the app, in-memory in tests). */
export interface Remote {
  pull(afterSeq: number, limit: number): Promise<RemoteDoc[]>;
  push(docs: PushDoc[]): Promise<void>;
  /** Must succeed if the photo already exists. */
  uploadPhoto(name: string, bytes: Uint8Array, contentType: string): Promise<void>;
}

/** The device side for photos. */
export interface Photos {
  /** Stable, device-independent name for a local photo URI ("" if none). */
  nameOf(uri: string): string;
  /** URI to use locally for a photo name (it may not be downloaded yet). */
  localUri(name: string): string;
  hasLocal(name: string): boolean;
  read(uri: string): Promise<Uint8Array | undefined>;
  download(name: string): Promise<void>;
}

export type SyncState = {
  /** Highest server seq already pulled. */
  cursor: number;
  /** Fingerprint of each record (kind:id) as of the last sync. */
  synced: Record<string, string>;
  /** Photo names known to exist in the cloud. */
  uploaded: string[];
};

export const emptySyncState = (): SyncState => ({ cursor: 0, synced: {}, uploaded: [] });

export type SyncResult = { state: SyncState; pulled: number; pushed: number; photosUp: number; photosDown: number };

const PULL_PAGE = 1000;
const PUSH_BATCH = 400;

// ---------- fingerprints ----------

function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(',')}}`;
}

/** FNV-1a over the stable JSON, plus its length. Enough to spot changes. */
export function fingerprint(v: unknown): string {
  const s = stable(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(36)}.${s.length.toString(36)}`;
}

const key = (kind: Kind, id: string) => `${kind}:${id}`;

// ---------- portable form ----------

/** The record as stored in the cloud: photo URIs replaced by "sb:<name>". */
export function toPortable(kind: Kind, rec: Record<string, unknown>, photos: Photos): Record<string, unknown> {
  const field = PHOTO_FIELDS[kind];
  if (!field || typeof rec[field] !== 'string' || !rec[field]) return rec;
  const name = photos.nameOf(rec[field] as string);
  return { ...rec, [field]: name ? `sb:${name}` : '' };
}

export function fromPortable(kind: Kind, data: Record<string, unknown>, photos: Photos): Record<string, unknown> {
  const field = PHOTO_FIELDS[kind];
  const v = field ? data[field] : undefined;
  if (typeof v !== 'string' || !v.startsWith('sb:')) return data;
  return { ...data, [field!]: photos.localUri(v.slice(3)) };
}

export function photoName(kind: Kind, data: Record<string, unknown> | null): string | undefined {
  const field = PHOTO_FIELDS[kind];
  const v = field && data ? data[field] : undefined;
  return typeof v === 'string' && v.startsWith('sb:') && v.length > 3 ? v.slice(3) : undefined;
}

function records(db: Db, kind: Kind): Record<string, unknown>[] {
  return ((db[LIST[kind]] as unknown[]) ?? []) as Record<string, unknown>[];
}

/** Every local record in portable form with its fingerprint. */
export function snapshot(db: Db, photos: Photos) {
  const out = new Map<string, { kind: Kind; id: string; data: Record<string, unknown>; fp: string; photoUri?: string }>();
  for (const kind of KINDS)
    for (const rec of records(db, kind)) {
      const data = toPortable(kind, rec, photos);
      const field = PHOTO_FIELDS[kind];
      const photoUri = field && typeof rec[field] === 'string' ? (rec[field] as string) : undefined;
      out.set(key(kind, rec.id as string), { kind, id: rec.id as string, data, fp: fingerprint(data), photoUri });
    }
  return out;
}

/**
 * How many local changes the last sync hasn't pushed yet: new or edited records, plus
 * records deleted locally. Used before sign-out to warn about changes that would be lost.
 */
export function pendingChanges(db: Db, state: SyncState, photos: Pick<Photos, 'nameOf'>): number {
  const snap = snapshot(db, photos as Photos);
  let n = 0;
  for (const [k, r] of snap) if (state.synced[k] !== r.fp) n++;
  for (const k of Object.keys(state.synced)) if (!snap.has(k)) n++;
  return n;
}

// ---------- merge ----------

/**
 * Applies cloud docs to the local data. A doc is skipped when the local copy has edits that
 * haven't been pushed yet (those win and will be pushed next). Returns the new data and the
 * fingerprints to record for the applied docs (null = deleted).
 */
export function mergeRemote(db: Db, docs: RemoteDoc[], synced: Record<string, string>, photos: Photos) {
  const applied: Record<string, string | null> = {};
  /** Keys that were already identical locally (no change to apply). */
  const unchanged: Record<string, true> = {};
  const next: Db = { ...db };
  const lists: Partial<Record<keyof Db, Record<string, unknown>[]>> = {};
  const list = (kind: Kind) => (lists[LIST[kind]] ??= [...records(db, kind)]);

  // Only the newest doc per key matters.
  const latest = new Map<string, RemoteDoc>();
  for (const d of docs) if (KINDS.includes(d.kind)) latest.set(key(d.kind, d.id), d);

  for (const [k, d] of latest) {
    const arr = list(d.kind);
    const idx = arr.findIndex((r) => r.id === d.id);
    const remoteFp = d.deleted ? null : fingerprint(d.data);
    if (idx >= 0) {
      const localFp = fingerprint(toPortable(d.kind, arr[idx], photos));
      if (localFp === remoteFp) {
        // Already identical (often our own push coming back): nothing to change.
        applied[k] = remoteFp;
        unchanged[k] = true;
        continue;
      }
      const locallyEdited = localFp !== synced[k];
      if (locallyEdited) continue;
    }
    if (d.deleted || !d.data) {
      if (idx >= 0) arr.splice(idx, 1);
      else unchanged[k] = true;
      applied[k] = null;
    } else {
      const local = fromPortable(d.kind, { ...d.data, id: d.id }, photos);
      if (idx >= 0) arr[idx] = local;
      else arr.unshift(local);
      applied[k] = remoteFp;
    }
  }
  const changed = Object.values(applied).length > 0 && Object.keys(applied).some((k) => !(k in unchanged));
  if (!changed) return { db, applied };
  for (const [name, arr] of Object.entries(lists)) (next as Record<string, unknown>)[name] = arr;
  return { db: next, applied };
}

// ---------- the sync run ----------

const contentType = (name: string) =>
  /\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : /\.heic$/i.test(name) ? 'image/heic' : 'image/jpeg';

export async function runSync(opts: {
  getDb: () => Db;
  /** Applies a change to the latest local data (e.g. through a state setter). */
  apply: (fn: (db: Db) => Db) => void;
  state: SyncState;
  remote: Remote;
  photos: Photos;
  now?: () => number;
}): Promise<SyncResult> {
  const { getDb, apply, remote, photos } = opts;
  const now = opts.now ?? Date.now;
  const state: SyncState = { cursor: opts.state.cursor, synced: { ...opts.state.synced }, uploaded: [...opts.state.uploaded] };
  const uploaded = new Set(state.uploaded);
  let photosDown = 0;
  let photosUp = 0;

  // 1. Pull everything newer than the cursor.
  const docs: RemoteDoc[] = [];
  for (;;) {
    const page = await remote.pull(state.cursor, PULL_PAGE);
    docs.push(...page);
    if (page.length) state.cursor = Math.max(state.cursor, ...page.map((d) => d.seq));
    if (page.length < PULL_PAGE) break;
  }

  // 2. Fetch photos the incoming docs need before showing them.
  for (const d of docs) {
    const name = photoName(d.kind, d.data);
    if (!name) continue;
    uploaded.add(name);
    if (!photos.hasLocal(name)) {
      try {
        await photos.download(name);
        photosDown++;
      } catch {
        // Shown as a missing photo; retried on a later sync because hasLocal stays false.
      }
    }
  }

  // 3. Apply to the latest local data.
  if (docs.length) {
    let applied: Record<string, string | null> = {};
    apply((db) => {
      const r = mergeRemote(db, docs, state.synced, photos);
      applied = r.applied;
      return r.db;
    });
    for (const [k, fp] of Object.entries(applied)) {
      if (fp === null) delete state.synced[k];
      else state.synced[k] = fp;
    }
  }

  // 4. Push local changes: edited/new records, and deletions.
  const snap = snapshot(getDb(), photos);
  const stamp = now();
  const push: (PushDoc & { fp: string | null; photoUri?: string })[] = [];
  for (const [k, r] of snap)
    if (state.synced[k] !== r.fp) push.push({ kind: r.kind, id: r.id, data: r.data, deleted: false, updated_at: stamp, fp: r.fp, photoUri: r.photoUri });
  for (const k of Object.keys(state.synced)) {
    if (snap.has(k)) continue;
    const [kind, ...rest] = k.split(':');
    push.push({ kind: kind as Kind, id: rest.join(':'), data: null, deleted: true, updated_at: stamp, fp: null });
  }

  // Photos first, so other devices never see a record whose photo isn't there yet.
  for (const p of push) {
    const name = photoName(p.kind, p.data);
    if (!name || uploaded.has(name) || !p.photoUri) continue;
    // Read from where the photo really is on this device (not rebuilt from its cloud name).
    const bytes = await photos.read(p.photoUri);
    if (!bytes) continue;
    await remote.uploadPhoto(name, bytes, contentType(name));
    uploaded.add(name);
    photosUp++;
  }

  for (let i = 0; i < push.length; i += PUSH_BATCH) {
    const batch = push.slice(i, i + PUSH_BATCH);
    await remote.push(batch.map(({ fp: _fp, photoUri: _uri, ...doc }) => doc));
    for (const p of batch) {
      const k = key(p.kind, p.id);
      if (p.fp === null) delete state.synced[k];
      else state.synced[k] = p.fp;
    }
  }

  state.uploaded = [...uploaded];
  return { state, pulled: docs.length, pushed: push.length, photosUp, photosDown };
}
