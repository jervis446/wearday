import { StyleSheet, useColorScheme } from 'react-native';

import { useSettings } from './settings';

/** Wearday palettes: warm linen neutrals with a terracotta accent, in light and dark. */
export type Palette = {
  bg: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  chip: string;
  danger: string;
  /** Background behind clothing photos; stays light in dark mode so white photo backgrounds blend in. */
  photo: string;
};

export const light: Palette = {
  bg: '#F7F3EE',
  card: '#FFFFFF',
  text: '#2A2420',
  muted: '#8C8279',
  border: '#EAE3DA',
  accent: '#C2603E',
  accentText: '#FFFFFF',
  accentSoft: '#F6E3DA',
  chip: '#EFE8E0',
  danger: '#B3261E',
  photo: '#FFFFFF',
};

export const dark: Palette = {
  bg: '#161311',
  card: '#221D1A',
  text: '#F3EDE7',
  muted: '#A2978D',
  border: '#352E29',
  accent: '#DB7652',
  accentText: '#FFFFFF',
  accentSoft: '#3B2820',
  chip: '#2F2824',
  danger: '#F2645A',
  photo: '#FFFFFF',
};

/**
 * Builds a style factory that is computed once per palette, so screens can call it on
 * every render without recreating StyleSheets.
 */
export function themed<T>(factory: (c: Palette) => T): (c: Palette) => T {
  const cache = new Map<Palette, T>();
  return (c) => {
    let v = cache.get(c);
    if (!v) cache.set(c, (v = factory(c)));
    return v;
  };
}

const makeUi = themed((c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    pad: { padding: 16 },
    h1: { fontSize: 26, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    h2: { fontSize: 18, fontWeight: '600', color: c.text },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: c.muted,
      marginTop: 16,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    body: { fontSize: 15, color: c.text },
    muted: { fontSize: 13, color: c.muted },
    input: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: c.text,
    },
    card: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border },
    row: { flexDirection: 'row', alignItems: 'center' },
    empty: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  }),
);

/** Current palette and shared styles. Follows the phone's setting unless overridden in Settings. */
export function useTheme() {
  const system = useColorScheme();
  const { settings } = useSettings();
  const scheme: 'light' | 'dark' = settings.theme === 'system' ? (system === 'dark' ? 'dark' : 'light') : settings.theme;
  const colors = scheme === 'dark' ? dark : light;
  return { colors, ui: makeUi(colors), scheme };
}
