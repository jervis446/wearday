import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { font, Palette, themed, useTheme } from '../lib/theme';
import { Item, STATUS_LABEL } from '../lib/types';

/** Destructive confirm dialog that also works on web. */
export function confirm(title: string, onYes: () => void, action = 'Delete', message?: string) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(message ? `${title}\n\n${message}` : title)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onYes },
  ]);
}

/** A light tap on supported phones. */
export function tap(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  if (Platform.OS !== 'web') Haptics.impactAsync(style).catch(() => {});
}

/** Pressable that springs down a little when pressed. */
export function Bouncy({
  onPress,
  style,
  children,
  disabled,
  haptic = true,
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
}: {
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  children: React.ReactNode;
  disabled?: boolean;
  haptic?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'radio' | 'tab';
  accessibilityState?: { selected?: boolean; disabled?: boolean; busy?: boolean };
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const to = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: Platform.OS !== 'web', speed: 40, bounciness: 8 }).start();
  return (
    <Pressable
      onPress={
        disabled || !onPress
          ? undefined
          : () => {
              if (haptic) tap();
              onPress();
            }
      }
      onPressIn={() => to(0.95)}
      onPressOut={() => to(1)}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState ?? { disabled }}
    >
      <Animated.View style={[style as ViewStyle, { transform: [{ scale }], opacity: disabled ? 0.5 : 1 }]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  style,
  busy,
  icon,
  disabled,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
  busy?: boolean;
  icon?: React.ReactNode;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const fg = variant === 'primary' ? '#FFFFFF' : variant === 'danger' ? colors.danger : colors.text;
  const content = (
    <>
      {busy ? <ActivityIndicator color={fg} size="small" /> : icon}
      <Text style={[s.btnText, { color: fg }]} numberOfLines={1}>
        {title}
      </Text>
    </>
  );
  return (
    <Bouncy
      onPress={busy ? undefined : onPress}
      disabled={disabled}
      style={[s.btnOuter, style ?? {}]}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
    >
      {variant === 'primary' ? (
        <LinearGradient colors={colors.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.btn, s.btnGlow]}>
          {content}
        </LinearGradient>
      ) : (
        <View
          style={[
            s.btn,
            variant === 'danger'
              ? { borderWidth: 1, borderColor: colors.danger, backgroundColor: 'transparent' }
              : { borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.glass },
          ]}
        >
          {content}
        </View>
      )}
    </Bouncy>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  return (
    <Bouncy onPress={onPress} style={[s.chip, active ? { backgroundColor: colors.text, borderColor: colors.text } : {}]} accessibilityState={{ selected: !!active }}>
      <Text style={[s.chipText, active && { color: colors.bg, fontFamily: font.bodyBold }]}>{label}</Text>
    </Bouncy>
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
  const chips = options.map((o) => <Chip key={o} label={o} active={selected.includes(o)} onPress={() => onToggle(o)} />);
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
    <View style={[s.thumb, { width: size, height: size, borderRadius: Math.min(22, size * 0.2) }]}>
      {item?.imageUri ? (
        <Image source={{ uri: item.imageUri }} style={{ width: size - 12, height: size - 12 }} resizeMode="contain" />
      ) : (
        <Text style={ui.muted}>?</Text>
      )}
      {badge ? (
        <View style={s.badge}>
          <Text style={s.badgeText}>{badge}</Text>
        </View>
      ) : null}
      {item?.status && item.status !== 'available' && size >= 70 ? (
        <View style={s.status}>
          <Text style={s.statusText}>{item.status === 'laundry' ? '🧺 Laundry' : STATUS_LABEL[item.status]}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function Empty({ title, hint, action, emoji = '✨' }: { title: string; hint?: string; action?: React.ReactNode; emoji?: string }) {
  const { colors, ui } = useTheme();
  return (
    <View style={ui.empty}>
      <View style={[makeStyles(colors).emptyIcon]}>
        <Text style={{ fontSize: 30 }}>{emoji}</Text>
      </View>
      <Text style={[ui.h2, { textAlign: 'center' }]}>{title}</Text>
      {hint ? <Text style={[ui.muted, { textAlign: 'center', maxWidth: 280 }]}>{hint}</Text> : null}
      {action}
    </View>
  );
}

/** A text button for the navigation header (adds the right margin web needs; native adds its own). */
export function HeaderButton({ title, onPress }: { title: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={12} style={{ marginRight: Platform.OS === 'web' ? 16 : 0 }} accessibilityRole="button">
      <Text style={{ color: colors.accent, fontFamily: font.bodyBold, fontSize: 16 }}>{title}</Text>
    </Pressable>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { ui } = useTheme();
  return (
    <View style={[ui.card, { padding: 18, gap: 12, marginBottom: 10 }]}>
      <Text style={ui.h2}>{title}</Text>
      {children}
    </View>
  );
}

/** Big screen title with an optional small kicker above it. */
export function Hero({ kicker, title, children }: { kicker?: string; title: string; children?: React.ReactNode }) {
  const { colors, ui } = useTheme();
  return (
    <View style={{ gap: 6, marginBottom: 6 }}>
      {kicker ? <Text style={[ui.label, { marginTop: 0, marginBottom: 0, color: colors.accent }]}>{kicker}</Text> : null}
      <Text style={ui.h1}>{title}</Text>
      {children}
    </View>
  );
}

/** Same colour at zero opacity, so gradients fade out without going grey. */
const clear = (rgba: string) => rgba.replace(/[\d.]+\)$/, '0)');

/** Soft colour glows behind a screen. Place first inside a full-screen container. */
export function Backdrop() {
  const { colors } = useTheme();
  const [a, b, c] = colors.glows;
  const image = [
    `radial-gradient(circle at 8% 4%, ${a} 0%, ${clear(a)} 55%)`,
    `radial-gradient(circle at 100% 52%, ${b} 0%, ${clear(b)} 45%)`,
    `radial-gradient(circle at 15% 92%, ${c} 0%, ${clear(c)} 45%)`,
  ].join(', ');
  // Native takes `experimental_backgroundImage`; the web takes the CSS property.
  const glow = (Platform.OS === 'web' ? { backgroundImage: image } : { experimental_backgroundImage: image }) as ViewStyle;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }, glow]} />;
}

const makeStyles = themed((colors: Palette) =>
  StyleSheet.create({
    btnOuter: { borderRadius: 999 },
    btn: {
      minHeight: 52,
      paddingHorizontal: 22,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    btnGlow: { boxShadow: `0 8px 24px ${colors.glows[0]}` },
    btnText: { fontSize: 16, fontFamily: font.bodyBold, letterSpacing: -0.2 },
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: colors.chip,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },
    chipText: { fontSize: 13, fontFamily: font.bodyMedium, color: colors.text },
    chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
    thumb: {
      backgroundColor: colors.photo,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    badge: {
      position: 'absolute',
      right: 7,
      top: 7,
      backgroundColor: colors.lime,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    badgeText: { color: colors.onLime, fontSize: 11, fontFamily: font.bodyBold },
    status: {
      position: 'absolute',
      left: 7,
      bottom: 7,
      backgroundColor: 'rgba(11,10,16,0.82)',
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    statusText: { color: '#FFFFFF', fontSize: 10, fontFamily: font.bodyBold },
    emptyIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      marginBottom: 4,
    },
  }),
);
