import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Tabs } from 'expo-router';
import { Platform, Text, View } from 'react-native';

import { GlassTabBar } from '../../components/TabBar';
import { Backdrop, Bouncy } from '../../components/ui';
import { useSocialBadge } from '../../lib/social/activity';
import { supabaseConfigured } from '../../lib/supabase';
import { font, useTheme } from '../../lib/theme';

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <Tabs
        tabBar={(props) => <GlassTabBar {...props} />}
        screenOptions={{
          headerStyle: { backgroundColor: 'transparent', height: Platform.OS === 'web' ? 76 : undefined },
          headerShadowVisible: false,
          headerTitleAlign: 'left',
          headerTitleStyle: { fontFamily: font.display, fontSize: 30, color: colors.text, letterSpacing: -1 },
          sceneStyle: { backgroundColor: 'transparent' },
          headerRight: () => <HeaderActions />,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Closet', headerTitle: 'wearday' }} />
        <Tabs.Screen name="outfits" options={{ title: 'Looks', headerTitle: 'Looks' }} />
        <Tabs.Screen name="calendar" options={{ title: 'Diary', headerTitle: 'OOTD diary' }} />
        <Tabs.Screen name="trips" options={{ title: 'Trips' }} />
        <Tabs.Screen name="stats" options={{ title: 'Stats', headerTitle: 'Your style' }} />
      </Tabs>
    </View>
  );
}

function HeaderActions() {
  const { colors } = useTheme();
  const badge = useSocialBadge();
  const circle = {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  } as const;
  return (
    <View style={{ flexDirection: 'row', gap: 10, marginRight: 16 }}>
      {supabaseConfigured ? (
        <Bouncy
          onPress={() => router.push('/fits')}
          accessibilityLabel={badge ? `Friends, ${badge} new` : 'Friends'}
          style={circle}
        >
          <Ionicons name="people-outline" size={22} color={colors.text} />
          {badge ? (
            <View
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                minWidth: 20,
                height: 20,
                paddingHorizontal: 5,
                borderRadius: 10,
                backgroundColor: colors.pink,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontFamily: font.bodyBold, fontSize: 11 }}>{badge > 9 ? '9+' : badge}</Text>
            </View>
          ) : null}
        </Bouncy>
      ) : null}
      <Bouncy onPress={() => router.push('/settings')} accessibilityLabel="Settings" style={circle}>
        <Ionicons name="person-circle-outline" size={24} color={colors.text} />
      </Bouncy>
    </View>
  );
}
