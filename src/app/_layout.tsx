import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnalyticsSync } from '../components/AnalyticsSync';
import { ReminderSync } from '../components/ReminderSync';
import { analyticsConfigured } from '../lib/analytics';
import { AuthProvider } from '../lib/auth';
import { PremiumProvider } from '../lib/premium';
import { remindersSupported } from '../lib/reminders';
import { SettingsProvider } from '../lib/settings';
import { StoreProvider } from '../lib/store';
import { SyncProvider } from '../lib/sync/SyncProvider';
import { useTheme } from '../lib/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SettingsProvider>
        <StoreProvider>
          <AuthProvider>
            <PremiumProvider>
              <SyncProvider>
                <AppStack />
              </SyncProvider>
            </PremiumProvider>
          </AuthProvider>
        </StoreProvider>
      </SettingsProvider>
    </GestureHandlerRootView>
  );
}

function AppStack() {
  const { colors, scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {remindersSupported ? <ReminderSync /> : null}
      {analyticsConfigured ? <AnalyticsSync /> : null}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="item/[id]" options={{ title: 'Item' }} />
        <Stack.Screen name="item/edit" options={{ title: 'Add item', presentation: 'modal' }} />
        <Stack.Screen name="outfit/[id]" options={{ title: 'Outfit builder' }} />
        <Stack.Screen name="outfit/share" options={{ title: 'Share outfit', presentation: 'modal' }} />
        <Stack.Screen name="suggest" options={{ title: 'Suggest an outfit' }} />
        <Stack.Screen name="log" options={{ title: 'Log outfit', presentation: 'modal' }} />
        <Stack.Screen name="trip/[id]" options={{ title: 'Trip' }} />
        <Stack.Screen name="paywall" options={{ title: '', presentation: 'modal' }} />
        <Stack.Screen name="account" options={{ title: 'Account & sync' }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}
