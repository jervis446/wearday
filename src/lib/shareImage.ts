import * as Sharing from 'expo-sharing';
import { ComponentRef, RefObject } from 'react';
import { Platform, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/**
 * Captures a view as a PNG and opens the share sheet (Instagram, WhatsApp, Photos…).
 * On web it uses the browser's share sheet when it supports files, otherwise downloads the image.
 */
export async function shareViewAsImage(ref: RefObject<ComponentRef<typeof View> | null>, title: string): Promise<'shared' | 'downloaded'> {
  if (!ref.current) throw new Error('Nothing to share yet.');
  const fileName = `${title.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'outfit'}.png`;

  if (Platform.OS === 'web') {
    const dataUri = await captureRef(ref, { format: 'png', result: 'data-uri' });
    const blob = await (await fetch(dataUri)).blob();
    const file = new File([blob], fileName, { type: 'image/png' });
    const nav = globalThis.navigator as Navigator | undefined;
    if (nav?.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title });
      return 'shared';
    }
    const a = document.createElement('a');
    a.href = dataUri;
    a.download = fileName;
    a.click();
    return 'downloaded';
  }

  const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: title });
  return 'shared';
}
