import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Remembers the last few errors so testers can see (and show us) what went wrong,
 * instead of a silent blank screen. Shown in Settings → Diagnostics.
 */
export type LoggedError = { at: string; where: string; message: string };

const KEY = 'wearday/diagnostics/v1';
const MAX = 20;
let cache: LoggedError[] = [];
const listeners = new Set<(e: LoggedError[]) => void>();

AsyncStorage.getItem(KEY)
  .then((raw) => {
    if (raw) cache = [...cache, ...JSON.parse(raw)].slice(0, MAX);
    listeners.forEach((l) => l(cache));
  })
  .catch(() => {});

export function logError(where: string, error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  cache = [{ at: new Date().toISOString(), where, message: message.slice(0, 500) }, ...cache].slice(0, MAX);
  AsyncStorage.setItem(KEY, JSON.stringify(cache)).catch(() => {});
  listeners.forEach((l) => l(cache));
}

export function recentErrors() {
  return cache;
}

export function onErrors(fn: (e: LoggedError[]) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearErrors() {
  cache = [];
  AsyncStorage.removeItem(KEY).catch(() => {});
  listeners.forEach((l) => l(cache));
}

/** Records uncaught errors and unhandled promise rejections (native only), then lets the default handler run. */
export function installErrorLogging() {
  if (Platform.OS === 'web') return;
  const g = globalThis as unknown as {
    ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void };
  };
  const prev = g.ErrorUtils?.getGlobalHandler();
  g.ErrorUtils?.setGlobalHandler((e, fatal) => {
    logError(fatal ? 'crash' : 'error', e);
    prev?.(e, fatal);
  });
}
