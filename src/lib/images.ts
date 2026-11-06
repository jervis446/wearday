import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

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
  return persist(result.assets[0].uri);
}

function persist(uri: string): string {
  if (Platform.OS === 'web') return uri;
  try {
    const dir = new Directory(Paths.document, 'images');
    dir.create({ intermediates: true, idempotent: true });
    const ext = uri.split('.').pop()?.split('?')[0] || 'jpg';
    const dest = new File(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`);
    new File(uri).copy(dest);
    return dest.uri;
  } catch {
    return uri;
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
