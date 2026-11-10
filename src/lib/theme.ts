import { Platform, StyleSheet, useColorScheme } from 'react-native';

import { useSettings } from './settings';

/**
 * Wearday "Glow": dark-first glass surfaces with an electric violet → hot pink gradient
 * and an acid-lime highlight. Light mode is a soft lilac version of the same system.
 */
export type Palette = {
  bg: string;
  /** Solid surface (sheets, switch thumbs, anything that must not be see-through). */
  card: string;
  /** Frosted surface for cards, inputs and chips. */
  glass: string;
  glassBorder: string;
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
  /** Pop colour for badges and small highlights. Always paired with `onLime` text. */
  lime: string;
  onLime: string;
  pink: string;
  /** Main brand gradient, used on primary buttons and hero text. */
  grad: readonly [string, string, ...string[]];
  /** Colours of the soft glows behind screens. */
  glows: readonly string[];
  blurTint: 'dark' | 'light';
};

export const dark: Palette = {
  bg: '#08070D',
  card: '#17151F',
  glass: 'rgba(255,255,255,0.07)',
  glassBorder: 'rgba(255,255,255,0.12)',
  text: '#F6F4FF',
  muted: '#A19DB6',
  border: 'rgba(255,255,255,0.10)',
  accent: '#A58BFF',
  accentText: '#FFFFFF',
  accentSoft: 'rgba(165,139,255,0.16)',
  chip: 'rgba(255,255,255,0.08)',
  danger: '#FF5C7A',
  photo: '#F3F0FA',
  lime: '#C6FF3D',
  onLime: '#0B0A10',
  pink: '#FF4FD8',
  grad: ['#7C4DFF', '#C13BF5', '#FF4FD8'],
  glows: ['rgba(124,77,255,0.55)', 'rgba(255,79,216,0.38)', 'rgba(198,255,61,0.16)'],
  blurTint: 'dark',
};

export const light: Palette = {
  bg: '#F4F1FF',
  card: '#FFFFFF',
  glass: 'rgba(255,255,255,0.68)',
  glassBorder: 'rgba(255,255,255,0.95)',
  text: '#15121F',
  muted: '#6A6680',
  border: 'rgba(21,18,31,0.08)',
  accent: '#7C3AED',
  accentText: '#FFFFFF',
  accentSoft: 'rgba(124,58,237,0.10)',
  chip: 'rgba(255,255,255,0.8)',
  danger: '#E11D48',
  photo: '#FFFFFF',
  lime: '#C6FF3D',
  onLime: '#0B0A10',
  pink: '#EC4899',
  grad: ['#7C3AED', '#B43CF0', '#EC4899'],
  glows: ['rgba(124,58,237,0.30)', 'rgba(236,72,153,0.24)', 'rgba(132,204,22,0.16)'],
  blurTint: 'light',
};

/** Font families, loaded in the root layout. */
export const font = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_600SemiBold',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodyBold: 'DMSans_700Bold',
} as const;

/** Space reserved at the bottom of tab screens for the floating tab bar. */
export const TAB_BAR_SPACE = Platform.OS === 'web' ? 110 : 120;

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
    // Transparent so the glow backdrop shows through; navigators give each screen a solid base.
    screen: { flex: 1, backgroundColor: 'transparent' },
    pad: { padding: 20 },
    h1: { fontFamily: font.display, fontSize: 34, lineHeight: 38, color: c.text, letterSpacing: -1.2 },
    h2: { fontFamily: font.displayMedium, fontSize: 20, color: c.text, letterSpacing: -0.4 },
    label: {
      fontFamily: font.bodyBold,
      fontSize: 11,
      color: c.muted,
      marginTop: 18,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 1.4,
    },
    body: { fontFamily: font.body, fontSize: 15, lineHeight: 21, color: c.text },
    muted: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: c.muted },
    input: {
      backgroundColor: c.glass,
      borderWidth: 1,
      borderColor: c.glassBorder,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 13,
      fontSize: 15,
      fontFamily: font.body,
      color: c.text,
    },
    card: { backgroundColor: c.glass, borderRadius: 24, borderWidth: 1, borderColor: c.glassBorder },
    row: { flexDirection: 'row', alignItems: 'center' },
    empty: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  }),
);

/** Current palette and shared styles. Follows Settings → Appearance (dark by default). */
export function useTheme() {
  const system = useColorScheme();
  const { settings } = useSettings();
  const scheme: 'light' | 'dark' = settings.theme === 'system' ? (system === 'light' ? 'light' : 'dark') : settings.theme;
  const colors = scheme === 'dark' ? dark : light;
  return { colors, ui: makeUi(colors), scheme };
}
