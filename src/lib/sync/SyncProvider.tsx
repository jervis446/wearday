import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '../auth';
import { canSync, FREE_LIMITS } from '../plans';
import { usePremium } from '../premium';
import { useStore } from '../store';
import { supabase } from '../supabase';
import { emptySyncState, runSync, type SyncState } from './engine';
import { devicePhotos } from './photos';
import { photoUrl, supabaseRemote } from './supabaseRemote';

export type SyncStatus = {
  state: 'off' | 'idle' | 'syncing' | 'error' | 'offline' | 'limit';
  lastSyncedAt?: number;
  error?: string;
};

type Ctx = { status: SyncStatus; syncNow: () => Promise<void> };
const SyncCtx = createContext<Ctx>({ status: { state: 'off' }, syncNow: async () => {} });

const stateKey = (uid: string) => `wearday/sync/v1/${uid}`;
const LIMIT_MESSAGE = `Sync paused: the free plan syncs up to ${FREE_LIMITS.syncItems} items. Go Premium to sync your whole wardrobe.`;
/** Wait this long after the last change before syncing, so a burst of edits goes up together. */
const DEBOUNCE_MS = 2500;

/** Runs sync automatically while signed in: on start, when the app returns, and after changes. */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const store = useStore();
  const { isPremium } = usePremium();
  const { getDb, mutate } = store;
  const uid = session?.user.id;
  const [status, setStatus] = useState<SyncStatus>({ state: 'off' });
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const lastSyncedAt = useRef<number | undefined>(undefined);

  const syncOnce = useCallback(async () => {
    if (!supabase || !uid || !store.ready) return;
    if (!canSync(isPremium, getDb().items.length)) {
      setStatus({ state: 'limit', error: LIMIT_MESSAGE, lastSyncedAt: lastSyncedAt.current });
      return;
    }
    setStatus({ state: 'syncing', lastSyncedAt: lastSyncedAt.current });
    try {
      const raw = await AsyncStorage.getItem(stateKey(uid));
      const saved: SyncState = raw ? JSON.parse(raw) : emptySyncState();
      const result = await runSync({
        getDb,
        apply: mutate,
        state: saved,
        remote: supabaseRemote(supabase, uid),
        photos: devicePhotos((name) => photoUrl(supabase!, uid, name)),
      });
      await AsyncStorage.setItem(stateKey(uid), JSON.stringify(result.state));
      lastSyncedAt.current = Date.now();
      setStatus({ state: 'idle', lastSyncedAt: lastSyncedAt.current });
    } catch (e) {
      const msg = (e as Error).message || 'Sync failed';
      if (/free plan limit/i.test(msg)) {
        setStatus({ state: 'limit', error: LIMIT_MESSAGE, lastSyncedAt: lastSyncedAt.current });
        return;
      }
      const offline = /network|fetch|connection/i.test(msg);
      setStatus({ state: offline ? 'offline' : 'error', error: offline ? 'Offline — will sync when you’re back online.' : msg, lastSyncedAt: lastSyncedAt.current });
    }
  }, [uid, store.ready, getDb, mutate, isPremium]);

  /** Runs a sync, or queues one more if a sync is already running. */
  const syncNow = useCallback(async () => {
    if (running.current) {
      again.current = true;
      return running.current;
    }
    const run = (async () => {
      do {
        again.current = false;
        await syncOnce();
      } while (again.current);
    })();
    running.current = run;
    try {
      await run;
    } finally {
      running.current = null;
    }
  }, [syncOnce]);

  // Start / stop with sign-in.
  useEffect(() => {
    if (!uid || !store.ready) return;
    syncNow();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && syncNow());
    return () => sub.remove();
  }, [uid, store.ready, syncNow]);

  // After local changes, sync shortly after the user stops editing.
  const data = useMemo(
    () => [store.items, store.outfits, store.logs, store.trips, store.collections],
    [store.items, store.outfits, store.logs, store.trips, store.collections],
  );
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!uid || !store.ready) return;
    const t = setTimeout(syncNow, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [data, uid, store.ready, syncNow]);

  // Signed out means sync is off, whatever the last run reported.
  const value = useMemo(() => ({ status: uid ? status : ({ state: 'off' } as SyncStatus), syncNow }), [uid, status, syncNow]);
  return <SyncCtx.Provider value={value}>{children}</SyncCtx.Provider>;
}

export const useSync = () => useContext(SyncCtx);

/** Forgets what was synced for a user (after sign-out or account deletion). */
export async function clearSyncState(uid: string) {
  await AsyncStorage.removeItem(stateKey(uid));
}
