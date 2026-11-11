import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { cleanupImages, deleteImage } from './images';
import { Collection, Db, Item, Outfit, Trip, WearLog, uid } from './types';

const KEY = 'fits-clone/db/v1';
const empty: Db = { items: [], outfits: [], logs: [], trips: [], collections: [] };

type Store = Db & {
  ready: boolean;
  saveItem: (item: Omit<Item, 'id' | 'createdAt'> & { id?: string }) => Item;
  deleteItem: (id: string) => void;
  saveOutfit: (outfit: Omit<Outfit, 'id' | 'createdAt'> & { id?: string }) => Outfit;
  deleteOutfit: (id: string) => void;
  saveLog: (log: Omit<WearLog, 'id'> & { id?: string }) => WearLog;
  deleteLog: (id: string) => void;
  /** Item ids worn on a log, including the pieces of its outfit. */
  itemsOfLog: (log: WearLog) => string[];
  saveTrip: (trip: Omit<Trip, 'id' | 'createdAt'> & { id?: string }) => Trip;
  deleteTrip: (id: string) => void;
  saveCollection: (c: Omit<Collection, 'id' | 'createdAt'> & { id?: string }) => Collection;
  deleteCollection: (id: string) => void;
  /** The latest data, including changes not yet rendered. */
  getDb: () => Db;
  /** Applies a change computed from the latest data (used by sync). */
  mutate: (fn: (db: Db) => Db) => void;
  /** Replaces all data (used by restore), then deletes photos the old data used. */
  replaceAll: (db: Db) => void;
  /** The user id this data belongs to; null until an account adopts it (see sync/owner.ts). */
  ownerId: string | null;
  /** The owner, including a change not yet rendered. */
  getOwner: () => string | null;
  setOwner: (uid: string | null) => void;
  /** Removes all local data and photos and gives the empty wardrobe to `uid`. */
  resetFor: (uid: string) => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDbState] = useState<Db>(empty);
  // Always-current copy of the data. Every change goes through setDb below, which updates this
  // immediately, so code that reads right after a change (sync, file cleanup) never sees stale data.
  const dbRef = useRef<Db>(empty);
  const setDb = useCallback((next: Db | ((d: Db) => Db)) => {
    const value = typeof next === 'function' ? next(dbRef.current) : next;
    if (value === dbRef.current) return;
    dbRef.current = value;
    setDbState(value);
  }, []);
  const [ready, setReady] = useState(false);
  // Stored inside the same AsyncStorage value as the data, so data and owner are always saved
  // together (a crash can never leave one user's data marked as another's).
  const [ownerId, setOwnerState] = useState<string | null>(null);
  const ownerRef = useRef<string | null>(null);
  const setOwner = useCallback((uid: string | null) => {
    ownerRef.current = uid;
    setOwnerState(uid);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        const { ownerId: owner, ...data } = raw ? JSON.parse(raw) : {};
        const loaded: Db = { ...empty, ...data };
        setOwner(typeof owner === 'string' && owner ? owner : null);
        setDb(loaded);
        // Once per launch, remove photos nothing points to (e.g. from a cancelled "Add item").
        cleanupImages([...loaded.items.map((i) => i.imageUri), ...loaded.logs.map((l) => l.selfieUri)]);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [setDb, setOwner]);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY, JSON.stringify({ ...db, ownerId })).catch(() => {});
  }, [db, ownerId, ready]);

  const upsert = <T extends { id: string }>(list: T[], next: T) =>
    list.some((x) => x.id === next.id) ? list.map((x) => (x.id === next.id ? next : x)) : [next, ...list];

  const saveItem: Store['saveItem'] = useCallback((input) => {
    const saved: Item = { ...input, id: input.id ?? uid(), createdAt: Date.now() };
    const old = dbRef.current.items.find((i) => i.id === saved.id);
    if (old && old.imageUri !== saved.imageUri) deleteImage(old.imageUri);
    setDb((d) => {
      const prev = d.items.find((i) => i.id === saved.id);
      return { ...d, items: upsert(d.items, { ...saved, createdAt: prev?.createdAt ?? saved.createdAt }) };
    });
    return saved;
  }, [setDb]);

  const deleteItem = useCallback((id: string) => {
    deleteImage(dbRef.current.items.find((i) => i.id === id)?.imageUri);
    setDb((d) => ({
      ...d,
      items: d.items.filter((i) => i.id !== id),
      outfits: d.outfits.map((o) => ({ ...o, pieces: o.pieces.filter((p) => p.itemId !== id) })),
      logs: d.logs.map((l) => ({ ...l, itemIds: l.itemIds.filter((x) => x !== id) })),
      trips: d.trips.map((t) => ({ ...t, itemIds: t.itemIds.filter((x) => x !== id), packed: t.packed.filter((x) => x !== id) })),
    }));
  }, [setDb]);

  const saveOutfit: Store['saveOutfit'] = useCallback((input) => {
    const saved: Outfit = { ...input, id: input.id ?? uid(), createdAt: Date.now() };
    setDb((d) => {
      const prev = d.outfits.find((o) => o.id === saved.id);
      return { ...d, outfits: upsert(d.outfits, { ...saved, createdAt: prev?.createdAt ?? saved.createdAt }) };
    });
    return saved;
  }, [setDb]);

  const deleteOutfit = useCallback((id: string) => {
    setDb((d) => ({
      ...d,
      outfits: d.outfits.filter((o) => o.id !== id),
      logs: d.logs.map((l) => (l.outfitId === id ? { ...l, outfitId: undefined } : l)),
      collections: d.collections.map((c) => ({ ...c, outfitIds: c.outfitIds.filter((x) => x !== id) })),
    }));
  }, [setDb]);

  const saveLog: Store['saveLog'] = useCallback((input) => {
    const saved: WearLog = { ...input, id: input.id ?? uid() };
    const old = dbRef.current.logs.find((l) => l.id === saved.id);
    if (old?.selfieUri && old.selfieUri !== saved.selfieUri) deleteImage(old.selfieUri);
    setDb((d) => ({ ...d, logs: upsert(d.logs, saved) }));
    return saved;
  }, [setDb]);

  const deleteLog = useCallback((id: string) => {
    deleteImage(dbRef.current.logs.find((l) => l.id === id)?.selfieUri);
    setDb((d) => ({ ...d, logs: d.logs.filter((l) => l.id !== id) }));
  }, [setDb]);

  const saveTrip: Store['saveTrip'] = useCallback((input) => {
    const saved: Trip = { ...input, id: input.id ?? uid(), createdAt: Date.now() };
    setDb((d) => {
      const prev = d.trips.find((t) => t.id === saved.id);
      return { ...d, trips: upsert(d.trips, { ...saved, createdAt: prev?.createdAt ?? saved.createdAt }) };
    });
    return saved;
  }, [setDb]);

  const deleteTrip = useCallback((id: string) => {
    setDb((d) => ({ ...d, trips: d.trips.filter((t) => t.id !== id) }));
  }, [setDb]);

  const saveCollection: Store['saveCollection'] = useCallback((input) => {
    const saved: Collection = { ...input, id: input.id ?? uid(), createdAt: Date.now() };
    setDb((d) => {
      const prev = d.collections.find((c) => c.id === saved.id);
      return { ...d, collections: upsert(d.collections, { ...saved, createdAt: prev?.createdAt ?? saved.createdAt }) };
    });
    return saved;
  }, [setDb]);

  const deleteCollection = useCallback((id: string) => {
    setDb((d) => ({ ...d, collections: d.collections.filter((c) => c.id !== id) }));
  }, [setDb]);

  const getDb = useCallback(() => dbRef.current, []);
  const mutate = useCallback((fn: (d: Db) => Db) => setDb(fn), [setDb]);

  const replaceAll = useCallback((next: Db) => {
    const merged: Db = { ...empty, ...next };
    setDb(merged);
    cleanupImages([...merged.items.map((i) => i.imageUri), ...merged.logs.map((l) => l.selfieUri)]);
  }, [setDb]);

  const getOwner = useCallback(() => ownerRef.current, []);
  const resetFor = useCallback(
    (uid: string) => {
      setOwner(uid);
      replaceAll(empty);
    },
    [setOwner, replaceAll],
  );

  const itemsOfLog = useCallback(
    (log: WearLog) => {
      const outfit = log.outfitId ? db.outfits.find((o) => o.id === log.outfitId) : undefined;
      return [...new Set([...log.itemIds, ...(outfit?.pieces.map((p) => p.itemId) ?? [])])];
    },
    [db.outfits],
  );

  const value = useMemo(
    () => ({
      ...db,
      ready,
      saveItem,
      deleteItem,
      saveOutfit,
      deleteOutfit,
      saveLog,
      deleteLog,
      itemsOfLog,
      saveTrip,
      deleteTrip,
      saveCollection,
      deleteCollection,
      replaceAll,
      getDb,
      mutate,
      ownerId,
      getOwner,
      setOwner,
      resetFor,
    }),
    [db, ready, saveItem, deleteItem, saveOutfit, deleteOutfit, saveLog, deleteLog, itemsOfLog, saveTrip, deleteTrip, saveCollection, deleteCollection, replaceAll, getDb, mutate, ownerId, getOwner, setOwner, resetFor],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}

/** Wear count per item id, across all logs. */
export function useWearCounts() {
  const { logs, itemsOfLog } = useStore();
  return useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of logs) for (const id of itemsOfLog(log)) counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  }, [logs, itemsOfLog]);
}
