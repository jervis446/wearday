import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '../auth';
import { supabaseConfigured } from '../supabase';
import { loadActivity } from './api';

/** When this account last looked at reactions on its fits (per account, so shared phones work). */
const seenKey = (uid: string) => `wearday/social/seen/v1/${uid}`;
/** Each tab has its own header, so the badge is mounted several times: they share one check. */
const MIN_INTERVAL_MS = 15_000;
let last: { uid: string; count: number; at: number } | null = null;
let inFlight: Promise<number> | null = null;

async function lastSeen(uid: string): Promise<string> {
  const saved = await AsyncStorage.getItem(seenKey(uid)).catch(() => null);
  if (saved) return saved;
  // First time: start counting from now rather than flagging every old reaction.
  const now = new Date().toISOString();
  await AsyncStorage.setItem(seenKey(uid), now).catch(() => {});
  return now;
}

async function check(uid: string, force: boolean): Promise<number> {
  if (!force && last?.uid === uid && Date.now() - last.at < MIN_INTERVAL_MS) return last.count;
  inFlight ??= (async () => {
    try {
      const activity = await loadActivity(await lastSeen(uid));
      const count = activity.requests + activity.reactions;
      last = { uid, count, at: Date.now() };
      return count;
    } catch {
      // The badge is only a hint; keep the last number if the check fails.
      return last?.uid === uid ? last.count : 0;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Call when the person has looked at reactions on their own fits. */
export async function markReactionsSeen(uid: string) {
  await AsyncStorage.setItem(seenKey(uid), new Date().toISOString()).catch(() => {});
  last = null;
}

/**
 * Number for the Friends badge: incoming friend requests plus new reactions to your fits.
 * Refreshes when a screen with the badge gains focus and when the app returns to the foreground.
 */
export function useSocialBadge(): number {
  const { session } = useAuth();
  const uid = supabaseConfigured ? session?.user.id : undefined;
  const [count, setCount] = useState(0);

  const refresh = useCallback(
    (force = false) => {
      if (!uid) {
        setCount(0);
        return;
      }
      check(uid, force).then(setCount);
    },
    [uid],
  );

  useFocusEffect(useCallback(() => refresh(), [refresh]));

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh(true));
    return () => sub.remove();
  }, [refresh]);

  return count;
}
