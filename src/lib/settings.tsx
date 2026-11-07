import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

export type Settings = {
  theme: ThemePref;
  /** ISO 4217 code, e.g. INR, USD, EUR. */
  currency: string;
  reminder: { enabled: boolean; hour: number; minute: number };
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  currency: 'INR',
  reminder: { enabled: false, hour: 8, minute: 30 },
};

const KEY = 'wearday/settings/v1';

type Ctx = { settings: Settings; ready: boolean; update: (patch: Partial<Settings>) => void; replace: (s: Settings) => void };
const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setSettings(mergeSettings(JSON.parse(raw))))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY, JSON.stringify(settings)).catch(() => {});
  }, [settings, ready]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const replace = useCallback((s: Settings) => setSettings(mergeSettings(s)), []);
  const value = useMemo(() => ({ settings, ready, update, replace }), [settings, ready, update, replace]);
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

/** Fills in defaults for anything missing (older saves, backups from older versions). */
export function mergeSettings(raw: Partial<Settings> | null | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    reminder: { ...DEFAULT_SETTINGS.reminder, ...raw?.reminder },
  };
}

export function useSettings() {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
