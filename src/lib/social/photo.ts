import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { SocialError } from './api';

/** The fits bucket accepts JPEGs up to 2 MB. */
const MAX_BYTES = 2 * 1024 * 1024;

async function readBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web' || uri.startsWith('data:') || uri.startsWith('blob:')) {
    return new Uint8Array(await (await fetch(uri)).arrayBuffer());
  }
  return new File(uri).bytes();
}

/**
 * Re-encodes a photo as a JPEG no wider than the feed shows it. Re-encoding also drops the
 * photo's metadata (EXIF), such as where it was taken, before it leaves the phone.
 */
export async function preparePhotoForSharing(uri: string): Promise<Uint8Array> {
  let originalWidth = 0;
  try {
    originalWidth = (await ImageManipulator.manipulate(uri).renderAsync()).width;
  } catch {
    throw new SocialError('Couldn’t open that photo. Try a different one.');
  }
  for (const [width, compress] of [
    [1080, 0.78],
    [900, 0.6],
  ] as const) {
    try {
      const ctx = ImageManipulator.manipulate(uri);
      if (originalWidth > width) ctx.resize({ width });
      const image = await ctx.renderAsync();
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress });
      const bytes = await readBytes(saved.uri);
      if (bytes.byteLength <= MAX_BYTES) return bytes;
    } catch {
      break;
    }
  }
  throw new SocialError('Couldn’t prepare that photo. Try a different one.');
}
