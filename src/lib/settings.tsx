import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { DEFAULT_SETTINGS, mergeSettings, Settings } from './settingsModel';

export { DEFAULT_SETTINGS, mergeSettings } from './settingsModel';
export type { Settings, ThemePref } from './settingsModel';

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

export function useSettings() {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
