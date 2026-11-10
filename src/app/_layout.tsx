import { ErrorBoundaryProps, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnalyticsSync } from '../components/AnalyticsSync';
import { ReminderSync } from '../components/ReminderSync';
import { analyticsConfigured } from '../lib/analytics';
import { AuthProvider } from '../lib/auth';
import { installErrorLogging, logError } from '../lib/diagnostics';
import { PremiumProvider } from '../lib/premium';
import { remindersSupported } from '../lib/reminders';
import { SettingsProvider } from '../lib/settings';
import { StoreProvider } from '../lib/store';
import { SyncProvider } from '../lib/sync/SyncProvider';
import { useTheme } from '../lib/theme';

installErrorLogging();

/** Shown instead of a blank or crashed screen if any screen throws while rendering. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    logError('screen', error);
  }, [error]);
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#F7F3EE' }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: '#2A2420' }}>Something went wrong</Text>
      <Text style={{ fontSize: 14, color: '#8C8279' }}>Please send this message to the Wearday team:</Text>
      <Text selectable style={{ fontSize: 13, color: '#B3261E' }}>
        {error.name}: {error.message}
      </Text>
      <Pressable onPress={retry} style={{ backgroundColor: '#C2603E', padding: 14, borderRadius: 12, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>Try again</Text>
      </Pressable>
    </ScrollView>
  );
}

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
