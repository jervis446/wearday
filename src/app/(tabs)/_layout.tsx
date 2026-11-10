import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Tabs } from 'expo-router';
import { Platform, View } from 'react-native';

import { GlassTabBar } from '../../components/TabBar';
import { Backdrop, Bouncy } from '../../components/ui';
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
          headerRight: () => (
            <Bouncy
              onPress={() => router.push('/settings')}
              accessibilityLabel="Settings"
              style={{
                marginRight: 16,
                width: 42,
                height: 42,
                borderRadius: 21,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.glass,
                borderWidth: 1,
                borderColor: colors.glassBorder,
              }}
            >
              <Ionicons name="person-circle-outline" size={24} color={colors.text} />
            </Bouncy>
          ),
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
