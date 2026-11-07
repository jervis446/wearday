import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { fileName } from '../files';
import { fingerprint, type Photos } from './engine';

const isWeb = Platform.OS === 'web';
const imagesDir = () => new Directory(Paths.document, 'images');

/**
 * On web, photos live inside the data as data: URIs. A downloaded photo gets its cloud name
 * appended as "#sb=<name>" so it keeps the same name when synced again.
 */
const webCache = new Map<string, string>();

function webName(uri: string): string {
  const tag = /#sb=([^#]+)$/.exec(uri);
  if (tag) return tag[1];
  return `w${fingerprint(uri).replace('.', '')}.jpg`;
}

async function toDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Photo handling for sync on this device. `urlFor` returns a download link for a cloud photo. */
export function devicePhotos(urlFor: (name: string) => Promise<string>): Photos {
  return {
    nameOf(uri) {
      if (!uri) return '';
      if (uri.startsWith('sb:')) return uri.slice(3);
      if (uri.startsWith('data:')) return webName(uri);
      return fileName(uri);
    },
    localUri(name) {
      if (isWeb) return webCache.get(name) ?? `sb:${name}`;
      return new File(imagesDir(), name).uri;
    },
    hasLocal(name) {
      if (isWeb) return webCache.has(name);
      try {
        return new File(imagesDir(), name).exists;
      } catch {
        return false;
      }
    },
    async read(uri) {
      try {
        if (isWeb || uri.startsWith('data:')) return new Uint8Array(await (await fetch(uri.split('#')[0])).arrayBuffer());
        const f = new File(uri);
        return f.exists ? await f.bytes() : undefined;
      } catch {
        return undefined;
      }
    },
    async download(name) {
      const url = await urlFor(name);
      if (isWeb) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        webCache.set(name, `${await toDataUri(await res.blob())}#sb=${name}`);
        return;
      }
      const dir = imagesDir();
      dir.create({ intermediates: true, idempotent: true });
      const dest = new File(dir, name);
      if (dest.exists) dest.delete();
      await File.downloadFileAsync(url, dest);
    },
  };
}
