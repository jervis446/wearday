import { StyleSheet } from 'react-native';

/** Wearday palette: warm linen neutrals with a terracotta accent. */
export const colors = {
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
};

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16 },
  h1: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  h2: { fontSize: 18, fontWeight: '600', color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 16, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  body: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
});
