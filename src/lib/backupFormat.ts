import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { fileName } from './files.ts';
import type { Settings } from './settingsModel';
import type { Db } from './types';

/**
 * Backup file format: a .zip containing
 *   wearday.json        – all data and settings, with photo URIs replaced by "backup:images/<name>"
 *   images/<name>       – each photo, as stored on the phone
 * Pure functions only (no native imports), so this can be unit tested.
 */

export const BACKUP_VERSION = 1;
const DATA_FILE = 'wearday.json';
const REF = 'backup:';

export type BackupData = {
  app: 'wearday';
  version: number;
  exportedAt: string;
  settings: Settings;
  db: Db;
};

export class BackupError extends Error {}

/** Every photo URI the data points to. */
export function imageRefs(db: Db): string[] {
  return [...new Set([...db.items.map((i) => i.imageUri), ...db.logs.map((l) => l.selfieUri)].filter((u): u is string => !!u))];
}

/** Returns a copy of `db` with every photo URI passed through `map`. */
export function mapImageRefs(db: Db, map: (uri: string) => string): Db {
  return {
    ...db,
    items: db.items.map((i) => ({ ...i, imageUri: i.imageUri ? map(i.imageUri) : i.imageUri })),
    logs: db.logs.map((l) => (l.selfieUri ? { ...l, selfieUri: map(l.selfieUri) } : l)),
  };
}

/**
 * Builds the backup zip. `images` maps each photo URI to its bytes; photos missing from it
 * (unreadable files) are dropped from the backup and their references cleared.
 */
export function packBackup(db: Db, settings: Settings, images: Map<string, Uint8Array>, now = new Date()): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  const names = new Map<string, string>();
  let n = 0;
  for (const uri of imageRefs(db)) {
    const bytes = images.get(uri);
    if (!bytes) continue;
    const ext = /\.(jpe?g|png|webp|heic)$/i.exec(fileName(uri))?.[1]?.toLowerCase() ?? 'jpg';
    const name = `images/${++n}.${ext}`;
    names.set(uri, name);
    entries[name] = bytes;
  }
  const data: BackupData = {
    app: 'wearday',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    settings,
    db: mapImageRefs(db, (uri) => (names.has(uri) ? REF + names.get(uri) : '')),
  };
  entries[DATA_FILE] = strToU8(JSON.stringify(data));
  // Photos are already compressed, so store without re-compressing (much faster on phones).
  return zipSync(entries, { level: 0 });
}

/** Reads and validates a backup zip. Photo references stay as "backup:images/<name>". */
export function unpackBackup(bytes: Uint8Array): { data: BackupData; images: Record<string, Uint8Array> } {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new BackupError('This file isn’t a Wearday backup (it’s not a valid .zip).');
  }
  const raw = files[DATA_FILE];
  if (!raw) throw new BackupError('This file isn’t a Wearday backup.');

  let data: BackupData;
  try {
    data = JSON.parse(strFromU8(raw));
  } catch {
    throw new BackupError('The backup is damaged and can’t be read.');
  }
  if (data?.app !== 'wearday' || !data.db) throw new BackupError('This file isn’t a Wearday backup.');
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
    throw new BackupError('This backup was made by a newer version of Wearday. Update the app and try again.');
  }
  if (!Array.isArray(data.db.items) || !Array.isArray(data.db.outfits) || !Array.isArray(data.db.logs)) {
    throw new BackupError('The backup is damaged and can’t be read.');
  }

  const images: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) if (name.startsWith('images/')) images[name] = content;
  return { data, images };
}

/** "backup:images/3.jpg" → "images/3.jpg", or undefined for a normal URI. */
export function backupImageName(ref: string): string | undefined {
  return ref.startsWith(REF) ? ref.slice(REF.length) : undefined;
}
