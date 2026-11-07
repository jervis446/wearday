import React from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Palette, themed, useTheme } from '../lib/theme';
import { Item } from '../lib/types';

/** Destructive confirm dialog that also works on web. */
export function confirm(title: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(title)) onYes();
    return;
  }
  Alert.alert(title, undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onYes },
  ]);
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const bg = variant === 'primary' ? colors.accent : variant === 'danger' ? colors.danger : colors.chip;
  const fg = variant === 'secondary' ? colors.text : colors.accentText;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: pressed ? 0.7 : 1 }, style]}
    >
      <Text style={[s.btnText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  return (
    <Pressable onPress={onPress} style={[s.chip, active && { backgroundColor: colors.accent }]}>
      <Text style={[s.chipText, active && { color: colors.accentText }]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({
  options,
  selected,
  onToggle,
  scroll = true,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (v: string) => void;
  scroll?: boolean;
}) {
  const s = makeStyles(useTheme().colors);
  const chips = options.map((o) => (
    <Chip key={o} label={o} active={selected.includes(o)} onPress={() => onToggle(o)} />
  ));
  return scroll ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
      {chips}
    </ScrollView>
  ) : (
    <View style={[s.chipRow, { flexWrap: 'wrap' }]}>{chips}</View>
  );
}

export function ItemThumb({ item, size, badge }: { item?: Item; size: number; badge?: string }) {
  const { colors, ui } = useTheme();
  const s = makeStyles(colors);
  return (
    <View style={[s.thumb, { width: size, height: size }]}>
      {item?.imageUri ? (
        <Image source={{ uri: item.imageUri }} style={{ width: size - 8, height: size - 8 }} resizeMode="contain" />
      ) : (
        <Text style={ui.muted}>?</Text>
      )}
      {badge ? (
        <View style={s.badge}>
          <Text style={s.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  const { ui } = useTheme();
  return (
    <View style={ui.empty}>
      <Text style={ui.h2}>{title}</Text>
      {hint ? <Text style={[ui.muted, { textAlign: 'center' }]}>{hint}</Text> : null}
      {action}
    </View>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { ui } = useTheme();
  return (
    <View style={[ui.card, { padding: 14, gap: 10, marginBottom: 8 }]}>
      <Text style={ui.h2}>{title}</Text>
      {children}
    </View>
  );
}

const makeStyles = themed((colors: Palette) =>
  StyleSheet.create({
  btn: { paddingVertical: 13, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center' },
  btnText: { fontSize: 15, fontWeight: '600' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.chip },
  chipText: { fontSize: 13, fontWeight: '500', color: colors.text },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  thumb: {
    backgroundColor: colors.photo,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    right: 6,
    top: 6,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: { color: colors.accentText, fontSize: 11, fontWeight: '600' },
  }),
);
