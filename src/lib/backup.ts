import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { backupImageName, imageRefs, mapImageRefs, packBackup, unpackBackup } from './backupFormat';
import { Settings } from './settings';
import { Db, todayKey } from './types';

const isWeb = Platform.OS === 'web';

async function readBytes(uri: string): Promise<Uint8Array | undefined> {
  try {
    if (isWeb) return new Uint8Array(await (await fetch(uri)).arrayBuffer());
    const f = new File(uri);
    return f.exists ? await f.bytes() : undefined;
  } catch {
    return undefined;
  }
}

/** Creates the backup and opens the share sheet (or downloads it on web). Returns photos included. */
export async function exportBackup(db: Db, settings: Settings): Promise<{ photos: number; missing: number }> {
  const refs = imageRefs(db);
  const images = new Map<string, Uint8Array>();
  for (const uri of refs) {
    const bytes = await readBytes(uri);
    if (bytes) images.set(uri, bytes);
  }
  const zip = packBackup(db, settings, images);
  const name = `wearday-backup-${todayKey()}.zip`;

  if (isWeb) {
    const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } else {
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    await file.write(zip);
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/zip',
      UTI: 'public.zip-archive',
      dialogTitle: 'Save your Wearday backup',
    });
  }
  return { photos: images.size, missing: refs.length - images.size };
}

/** Lets the user pick a backup file and reads it. Returns null if they cancel. */
export async function pickBackup() {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const bytes = isWeb && asset.file ? new Uint8Array(await asset.file.arrayBuffer()) : await readBytes(asset.uri);
  if (!bytes) throw new Error('Couldn’t read that file.');
  return unpackBackup(bytes);
}

function toBase64(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Writes the backup's photos into the app and returns the data pointing at them. */
export async function restorePhotos(backup: NonNullable<Awaited<ReturnType<typeof pickBackup>>>): Promise<Db> {
  const { data, images } = backup;
  const written = new Map<string, string>();
  const dir = isWeb ? undefined : new Directory(Paths.document, 'images');
  dir?.create({ intermediates: true, idempotent: true });
  const stamp = Date.now();

  for (const [name, bytes] of Object.entries(images)) {
    const ext = name.split('.').pop() || 'jpg';
    if (isWeb) {
      // Blob URLs die on reload, so the browser version keeps photos as data URIs.
      written.set(name, `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${toBase64(bytes)}`);
    } else {
      const file = new File(dir!, `restored-${stamp}-${name.replace(/\W+/g, '-')}`);
      file.create();
      await file.write(bytes);
      written.set(name, file.uri);
    }
  }
  return mapImageRefs(data.db, (ref) => {
    const name = backupImageName(ref);
    return name ? (written.get(name) ?? '') : ref;
  });
}
