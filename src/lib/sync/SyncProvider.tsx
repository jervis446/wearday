import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '../auth';
import { canSync, FREE_LIMITS } from '../plans';
import { usePremium } from '../premium';
import { useSettings } from '../settings';
import { useStore } from '../store';
import { supabase } from '../supabase';
import { emptySyncState, pendingChanges, runSync, type SyncState } from './engine';
import { ownerAction } from './owner';
import { devicePhotos } from './photos';
import { photoUrl, supabaseRemote } from './supabaseRemote';

export type SyncStatus = {
  state: 'off' | 'idle' | 'syncing' | 'error' | 'offline' | 'limit';
  lastSyncedAt?: number;
  error?: string;
};

type Ctx = {
  status: SyncStatus;
  syncNow: () => Promise<void>;
  /** Syncs one last time and returns how many local changes still aren't in the cloud. */
  prepareSignOut: () => Promise<number>;
};
const SyncCtx = createContext<Ctx>({ status: { state: 'off' }, syncNow: async () => {}, prepareSignOut: async () => 0 });

const stateKey = (uid: string) => `wearday/sync/v1/${uid}`;
const LIMIT_MESSAGE = `Sync paused: the free plan syncs up to ${FREE_LIMITS.syncItems} items. Go Premium to sync your whole wardrobe.`;
/** Wait this long after the last change before syncing, so a burst of edits goes up together. */
const DEBOUNCE_MS = 2500;

/** Runs sync automatically while signed in: on start, when the app returns, and after changes. */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const store = useStore();
  const { isPremium } = usePremium();
  const { update: updateSettings } = useSettings();
  const { getDb, mutate, ownerId, getOwner, setOwner, resetFor } = store;
  const uid = session?.user.id;
  // The local data belongs to the signed-in user (adopted or theirs). Never sync otherwise.
  const owned = !!uid && store.ready && ownerId === uid;
  // Local data from a different account, about to be removed: don't show it meanwhile.
  const foreign = !!uid && store.ready && ownerAction(ownerId, uid) === 'reset';
  const [status, setStatus] = useState<SyncStatus>({ state: 'off' });
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const lastSyncedAt = useRef<number | undefined>(undefined);

  const syncOnce = useCallback(async () => {
    if (!supabase || !uid || !store.ready || getOwner() !== uid) return;
    if (!canSync(isPremium, getDb().items.length)) {
      setStatus({ state: 'limit', error: LIMIT_MESSAGE, lastSyncedAt: lastSyncedAt.current });
      return;
    }
    setStatus({ state: 'syncing', lastSyncedAt: lastSyncedAt.current });
    try {
      const raw = await AsyncStorage.getItem(stateKey(uid));
      const saved: SyncState = raw ? JSON.parse(raw) : emptySyncState();
      // If the account changes while this run is in flight, stop before it touches the other
      // account's data (pulling into it, or pushing it — including as deletions — to this one).
      const mine = () => {
        if (getOwner() !== uid) throw new Error('Signed out during sync');
      };
      const result = await runSync({
        getDb: () => (mine(), getDb()),
        apply: (fn) => (mine(), mutate(fn)),
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
  }, [uid, store.ready, getDb, getOwner, mutate, isPremium]);

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

  // On sign-in, settle whose data this is before anything syncs (see owner.ts).
  useEffect(() => {
    if (!uid || !store.ready) return;
    const action = ownerAction(ownerId, uid);
    if (action === 'adopt') setOwner(uid);
    else if (action === 'reset') {
      // Unsynced changes were checked at sign-out (prepareSignOut). The previous owner's
      // data is removed from this phone; their cloud copy is untouched.
      if (ownerId) clearSyncState(ownerId).catch(() => {});
      resetFor(uid);
      // Their style description is personal too.
      updateSettings({ styleNotes: undefined });
    }
  }, [uid, store.ready, ownerId, setOwner, resetFor, updateSettings]);

  // Start / stop with sign-in.
  useEffect(() => {
    if (!owned) return;
    syncNow();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && syncNow());
    return () => sub.remove();
  }, [owned, syncNow]);

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
    if (!owned) return;
    const t = setTimeout(syncNow, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [data, owned, syncNow]);

  const prepareSignOut = useCallback(async () => {
    if (!uid || getOwner() !== uid) return 0;
    await syncNow();
    try {
      const raw = await AsyncStorage.getItem(stateKey(uid));
      const saved: SyncState = raw ? JSON.parse(raw) : emptySyncState();
      return pendingChanges(getDb(), saved, devicePhotos(async () => ''));
    } catch {
      return 0;
    }
  }, [uid, getOwner, getDb, syncNow]);

  // Signed out means sync is off, whatever the last run reported.
  const value = useMemo(
    () => ({ status: uid ? status : ({ state: 'off' } as SyncStatus), syncNow, prepareSignOut }),
    [uid, status, syncNow, prepareSignOut],
  );
  return <SyncCtx.Provider value={value}>{foreign ? null : children}</SyncCtx.Provider>;
}

export const useSync = () => useContext(SyncCtx);

/** Forgets what was synced for a user (after sign-out or account deletion). */
export async function clearSyncState(uid: string) {
  await AsyncStorage.removeItem(stateKey(uid));
}
