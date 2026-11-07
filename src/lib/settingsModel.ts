/** Settings shape and defaults (no React, so it can be unit tested). */

export type ThemePref = 'system' | 'light' | 'dark';

export type Settings = {
  theme: ThemePref;
  /** ISO 4217 code, e.g. INR, USD, EUR. */
  currency: string;
  reminder: { enabled: boolean; hour: number; minute: number };
  /** ISO date of the last successful export. */
  lastBackupAt?: string;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  currency: 'INR',
  reminder: { enabled: false, hour: 8, minute: 30 },
};

/** Fills in defaults for anything missing (older saves, backups from older versions). */
export function mergeSettings(raw: Partial<Settings> | null | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    reminder: { ...DEFAULT_SETTINGS.reminder, ...raw?.reminder },
  };
}
