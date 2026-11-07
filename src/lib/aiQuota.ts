import AsyncStorage from '@react-native-async-storage/async-storage';

import { todayKey } from './types';

/** Counts AI suggestions used today on this device (for the free daily limit). */
const key = () => `wearday/ai-used/${todayKey()}`;

export async function aiUsedToday(): Promise<number> {
  try {
    return Number((await AsyncStorage.getItem(key())) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export async function recordAiUse(): Promise<number> {
  const n = (await aiUsedToday()) + 1;
  await AsyncStorage.setItem(key(), String(n)).catch(() => {});
  return n;
}
