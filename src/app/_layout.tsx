import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SettingsProvider } from '../lib/settings';
import { StoreProvider } from '../lib/store';
import { useTheme } from '../lib/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SettingsProvider>
        <StoreProvider>
          <AppStack />
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
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}
