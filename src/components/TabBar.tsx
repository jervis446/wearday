import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import { ComponentProps } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { font, useTheme } from '../lib/theme';
import { Bouncy } from './ui';

type IconName = ComponentProps<typeof Ionicons>['name'];
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export const TAB_ICONS: Record<string, [IconName, IconName]> = {
  index: ['shirt-outline', 'shirt'],
  outfits: ['layers-outline', 'layers'],
  calendar: ['calendar-clear-outline', 'calendar-clear'],
  trips: ['airplane-outline', 'airplane'],
  stats: ['sparkles-outline', 'sparkles'],
};

/**
 * Floating frosted-glass pill tab bar. The active tab grows into a gradient pill with its label,
 * the others are icon-only.
 */
export function GlassTabBar({ state, descriptors, emitter, navigateToTab }: TabBarProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  // Real blur on iOS and web; Android gets a denser tint (blurring there needs a blur target).
  const fill = Platform.OS === 'android' ? (scheme === 'dark' ? 'rgba(23,21,31,0.94)' : 'rgba(255,255,255,0.94)') : colors.glass;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 4 }]}>
      <View style={styles.shadow}>
      <View style={[styles.bar, { borderColor: colors.glassBorder }]}>
        <BlurView intensity={60} tint={colors.blurTint} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label = typeof options.title === 'string' ? options.title : route.name;
          const [off, on] = TAB_ICONS[route.name] ?? ['ellipse-outline', 'ellipse'];
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Bouncy
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
            >
              {focused ? (
                <LinearGradient colors={colors.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.active}>
                  <Ionicons name={on} size={19} color="#FFFFFF" />
                  <Text style={styles.activeText} numberOfLines={1}>
                    {label}
                  </Text>
                </LinearGradient>
              ) : (
                <View style={styles.idle}>
                  <Ionicons name={off} size={22} color={colors.text} style={{ opacity: 0.75 }} />
                </View>
              )}
            </Bouncy>
          );
        })}
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    padding: 6,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
  },
  shadow: { width: '100%', maxWidth: 440, borderRadius: 999, boxShadow: '0 12px 32px rgba(0,0,0,0.35)' },
  active: {
    height: 50,
    borderRadius: 999,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  activeText: { color: '#FFFFFF', fontFamily: font.bodyBold, fontSize: 14 },
  idle: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
});
