import { Platform } from 'react-native';

import { copyIntoImages } from './images';

/**
 * On-device background removal: Google ML Kit subject segmentation on Android,
 * Apple Vision on iOS 17+. Photos never leave the phone.
 * Unavailable in Expo Go, on web, and on iPhones older than iOS 17. Callers should
 * check canRemoveBackground() and hide the option when it returns false.
 */

type Lib = {
  removeBackground: (uri: string, options?: { trim?: boolean }) => Promise<string>;
  isNativeBackgroundRemovalSupported: () => Promise<boolean>;
};

function load(): Lib | undefined {
  if (Platform.OS === 'web') return undefined;
  try {
    // Loaded lazily: the native module only exists in a development/production build.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@six33/react-native-bg-removal') as Lib;
  } catch {
    return undefined;
  }
}

let supported: Promise<boolean> | undefined;

export function canRemoveBackground(): Promise<boolean> {
  supported ??= (async () => {
    try {
      return (await load()?.isNativeBackgroundRemovalSupported()) ?? false;
    } catch {
      return false;
    }
  })();
  return supported;
}

/**
 * Returns a new transparent PNG (cropped to the item) stored in the app's images folder,
 * or null if the background couldn't be removed.
 */
export async function removeBackground(uri: string): Promise<string | null> {
  const lib = load();
  if (!lib) return null;
  try {
    const out = await lib.removeBackground(uri, { trim: true });
    // Simulators return the original unchanged.
    if (!out || out === uri) return null;
    return copyIntoImages(out, true) ?? null;
  } catch {
    return null;
  }
}
