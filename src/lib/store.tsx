import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { Db, Item, Outfit, WearLog, uid } from './types';

const KEY = 'fits-clone/db/v1';
const empty: Db = { items: [], outfits: [], logs: [] };

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
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<Db>(empty);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setDb({ ...empty, ...JSON.parse(raw) }))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY, JSON.stringify(db)).catch(() => {});
  }, [db, ready]);

  const upsert = <T extends { id: string }>(list: T[], next: T) =>
    list.some((x) => x.id === next.id) ? list.map((x) => (x.id === next.id ? next : x)) : [next, ...list];

  const saveItem: Store['saveItem'] = useCallback((input) => {
    const saved: Item = { ...input, id: input.id ?? uid(), createdAt: Date.now() };
    setDb((d) => {
      const prev = d.items.find((i) => i.id === saved.id);
      return { ...d, items: upsert(d.items, { ...saved, createdAt: prev?.createdAt ?? saved.createdAt }) };
    });
    return saved;
  }, []);

  const deleteItem = useCallback((id: string) => {
    setDb((d) => ({
      items: d.items.filter((i) => i.id !== id),
      outfits: d.outfits.map((o) => ({ ...o, pieces: o.pieces.filter((p) => p.itemId !== id) })),
      logs: d.logs.map((l) => ({ ...l, itemIds: l.itemIds.filter((x) => x !== id) })),
    }));
  }, []);

  const saveOutfit: Store['saveOutfit'] = useCallback((input) => {
    const saved: Outfit = { ...input, id: input.id ?? uid(), createdAt: Date.now() };
    setDb((d) => {
      const prev = d.outfits.find((o) => o.id === saved.id);
      return { ...d, outfits: upsert(d.outfits, { ...saved, createdAt: prev?.createdAt ?? saved.createdAt }) };
    });
    return saved;
  }, []);

  const deleteOutfit = useCallback((id: string) => {
    setDb((d) => ({
      ...d,
      outfits: d.outfits.filter((o) => o.id !== id),
      logs: d.logs.map((l) => (l.outfitId === id ? { ...l, outfitId: undefined } : l)),
    }));
  }, []);

  const saveLog: Store['saveLog'] = useCallback((input) => {
    const saved: WearLog = { ...input, id: input.id ?? uid() };
    setDb((d) => ({ ...d, logs: upsert(d.logs, saved) }));
    return saved;
  }, []);

  const deleteLog = useCallback((id: string) => {
    setDb((d) => ({ ...d, logs: d.logs.filter((l) => l.id !== id) }));
  }, []);

  const itemsOfLog = useCallback(
    (log: WearLog) => {
      const outfit = log.outfitId ? db.outfits.find((o) => o.id === log.outfitId) : undefined;
      return [...new Set([...log.itemIds, ...(outfit?.pieces.map((p) => p.itemId) ?? [])])];
    },
    [db.outfits],
  );

  const value = useMemo(
    () => ({ ...db, ready, saveItem, deleteItem, saveOutfit, deleteOutfit, saveLog, deleteLog, itemsOfLog }),
    [db, ready, saveItem, deleteItem, saveOutfit, deleteOutfit, saveLog, deleteLog, itemsOfLog],
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
