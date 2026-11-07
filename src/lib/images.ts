import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

import { fileName, unreferenced } from './files';

/**
 * Picks a photo from the camera or library and copies it into the app's document
 * directory so it survives cache clears. Returns the persistent URI, or null if cancelled.
 */
export async function pickImage(source: 'camera' | 'library', square = true): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: square ? [1, 1] : [3, 4],
    quality: 0.8,
  };

  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera permission needed', 'Enable camera access in Settings to take photos.');
      return null;
    }
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return persist(asset.uri, asset.width);
}

const imagesDir = () => new Directory(Paths.document, 'images');

/** Photos are never shown bigger than this, so larger ones only waste space and slow backups. */
const MAX_WIDTH = Platform.OS === 'web' ? 800 : 1200;

/**
 * Shrinks the photo if needed and stores it where it will last:
 * - phone: a JPEG in the app's documents folder (survives cache clears)
 * - web: an embedded data URI (blob URLs stop working after a reload)
 */
async function persist(uri: string, width?: number): Promise<string> {
  let src = uri;
  let base64: string | undefined;
  try {
    const ctx = ImageManipulator.manipulate(uri);
    if (!width || width > MAX_WIDTH) ctx.resize({ width: MAX_WIDTH });
    const out = await (await ctx.renderAsync()).saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.8,
      base64: Platform.OS === 'web',
    });
    src = out.uri;
    base64 = out.base64;
  } catch {
    // Keep the original if resizing fails.
  }

  if (Platform.OS === 'web') return base64 ? `data:image/jpeg;base64,${base64}` : src;
  try {
    const dir = imagesDir();
    dir.create({ intermediates: true, idempotent: true });
    const ext = src.split('.').pop()?.split('?')[0] || 'jpg';
    const dest = new File(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`);
    new File(src).copy(dest);
    return dest.uri;
  } catch {
    return src;
  }
}

/** Lets the user choose camera or library via an action sheet. */
export function chooseImage(square = true): Promise<string | null> {
  if (Platform.OS === 'web') return pickImage('library', square);
  return new Promise((resolve) => {
    Alert.alert('Add photo', undefined, [
      { text: 'Take photo', onPress: () => pickImage('camera', square).then(resolve) },
      { text: 'Choose from library', onPress: () => pickImage('library', square).then(resolve) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

/** Deletes a photo the app owns. Ignores anything outside the app's images folder. */
export function deleteImage(uri?: string) {
  if (!uri || Platform.OS === 'web' || !uri.includes('/images/')) return;
  try {
    const file = new File(imagesDir(), fileName(uri));
    if (file.exists) file.delete();
  } catch {
    // Already gone, or not ours.
  }
}

/**
 * Deletes photos in the images folder that nothing refers to any more, e.g. a photo taken
 * for an item that was then cancelled. Returns how many files were removed.
 */
export function cleanupImages(referenced: (string | undefined)[]): number {
  if (Platform.OS === 'web') return 0;
  try {
    const dir = imagesDir();
    if (!dir.exists) return 0;
    const files = dir.list().filter((e): e is File => e instanceof File);
    const stale = new Set(unreferenced(files.map((f) => f.name), referenced));
    for (const f of files) if (stale.has(f.name)) f.delete();
    return stale.size;
  } catch {
    return 0;
  }
}
