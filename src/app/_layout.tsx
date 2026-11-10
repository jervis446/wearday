import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import { ErrorBoundaryProps, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnalyticsSync } from '../components/AnalyticsSync';
import { ReminderSync } from '../components/ReminderSync';
import { analyticsConfigured } from '../lib/analytics';
import { AuthProvider, useAuth } from '../lib/auth';
import { installErrorLogging, logError } from '../lib/diagnostics';
import { PremiumProvider } from '../lib/premium';
import { remindersSupported } from '../lib/reminders';
import { SettingsProvider } from '../lib/settings';
import { supabaseConfigured } from '../lib/supabase';
import { StoreProvider } from '../lib/store';
import { SyncProvider } from '../lib/sync/SyncProvider';
import { font, useTheme } from '../lib/theme';

installErrorLogging();
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Shown instead of a blank or crashed screen if any screen throws while rendering. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    logError('screen', error);
  }, [error]);
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#08070D' }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: '#F6F4FF' }}>Something went wrong</Text>
      <Text style={{ fontSize: 14, color: '#A19DB6' }}>Please send this message to the Wearday team:</Text>
      <Text selectable style={{ fontSize: 13, color: '#FF5C7A' }}>
        {error.name}: {error.message}
      </Text>
      <Pressable onPress={retry} style={{ backgroundColor: '#7C4DFF', padding: 16, borderRadius: 999, alignItems: 'center' }}>
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
  const { session, ready } = useAuth();
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });
  const fontsReady = fontsLoaded || !!fontError;
  // Builds without accounts set up (local development) skip the sign-in gate.
  const signedIn = !supabaseConfigured || !!session;

  useEffect(() => {
    if (fontError) logError('fonts', fontError);
  }, [fontError]);
  useEffect(() => {
    if (fontsReady && ready) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady, ready]);

  if (!fontsReady || !ready) return null;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {remindersSupported && signedIn ? <ReminderSync /> : null}
      {analyticsConfigured ? <AnalyticsSync /> : null}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: font.displayMedium, fontSize: 18 },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="item/[id]" options={{ title: 'Item' }} />
          <Stack.Screen name="item/edit" options={{ title: 'Add item', presentation: 'modal' }} />
          <Stack.Screen name="outfit/[id]" options={{ title: 'Outfit builder' }} />
          <Stack.Screen name="outfit/share" options={{ title: 'Share outfit', presentation: 'modal' }} />
          <Stack.Screen name="suggest" options={{ title: 'Style me' }} />
          <Stack.Screen name="style" options={{ title: 'My style' }} />
          <Stack.Screen name="log" options={{ title: 'Log outfit', presentation: 'modal' }} />
          <Stack.Screen name="trip/[id]" options={{ title: 'Trip' }} />
          <Stack.Screen name="paywall" options={{ title: '', presentation: 'modal' }} />
          <Stack.Screen name="account" options={{ title: 'Account' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
