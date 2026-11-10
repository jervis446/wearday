import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Text, View } from 'react-native';

import { NohaWalletCard } from '../components/NohaMoney';
import { Button, Section } from '../components/ui';
import { useAuth } from '../lib/auth';
import { supabaseConfigured } from '../lib/supabase';
import { clearSyncState, useSync } from '../lib/sync/SyncProvider';
import { font, useTheme } from '../lib/theme';
import { openPaywall } from '../lib/usePaywall';

function ask(title: string, message: string, ok: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(!!globalThis.confirm?.(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

function timeAgo(t?: number) {
  if (!t) return 'not yet';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(t).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' });
}

export default function AccountScreen() {
  const { ui } = useTheme();
  const { session, ready } = useAuth();

  if (!supabaseConfigured) {
    return (
      <ScrollView style={ui.screen} contentContainerStyle={ui.pad}>
        <Text style={ui.body}>Accounts and sync aren’t set up in this build of the app.</Text>
      </ScrollView>
    );
  }
  // Signed-out people never reach this screen: the root layout shows the welcome screen instead.
  if (!ready || !session) return <View style={ui.screen} />;
  return <SignedIn />;
}

function SignedIn() {
  const { colors, ui } = useTheme();
  const { session, signOut, deleteAccount } = useAuth();
  const { status, syncNow } = useSync();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const user = session!.user;
  const via = (user.app_metadata?.provider as string | undefined) ?? 'email';

  const statusText =
    status.state === 'syncing'
      ? 'Syncing…'
      : status.state === 'error' || status.state === 'offline' || status.state === 'limit'
        ? status.error
        : `Synced ${timeAgo(status.lastSyncedAt)}`;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { gap: 10, maxWidth: 600, width: '100%', alignSelf: 'center' }]}>
      <View style={[ui.row, { gap: 14, marginBottom: 14 }]}>
        <LinearGradient colors={colors.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontFamily: font.display, fontSize: 28 }}>{(user.email ?? '?')[0].toUpperCase()}</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[ui.h2]} numberOfLines={1}>
            {user.email ?? 'Signed in'}
          </Text>
          <Text style={ui.muted}>Signed in with {via === 'email' ? 'email' : via[0].toUpperCase() + via.slice(1)}</Text>
        </View>
      </View>

      <NohaWalletCard />

      <Section title="Sync">
        <View style={[ui.row, { gap: 8 }]}>
          {status.state === 'syncing' ? <ActivityIndicator color={colors.accent} /> : null}
          <Text style={[ui.body, { flex: 1, color: status.state === 'error' ? colors.danger : colors.text }]}>{statusText}</Text>
        </View>
        <Text style={ui.muted}>Your wardrobe syncs automatically when you make changes and when you open the app.</Text>
        {status.state === 'limit' ? (
          <Button title="Go Premium ✨" onPress={() => openPaywall('sync')} />
        ) : (
          <Button title="Sync now" variant="secondary" onPress={() => syncNow()} />
        )}
      </Section>

      <Button
        title="Sign out"
        busy={busy === 'out'}
        variant="secondary"
        onPress={async () => {
          if (!(await ask('Sign out?', 'You’ll need to sign in again to use Wearday. Your wardrobe stays on this phone.', 'Sign out'))) return;
          setBusy('out');
          try {
            await clearSyncState(user.id);
            await signOut();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(null);
          }
        }}
      />
      <Button
        title="Delete account"
        busy={busy === 'delete'}
        variant="danger"
        onPress={async () => {
          const ok = await ask(
            'Delete your account?',
            'This permanently deletes your account and everything stored in the cloud, including photos. The wardrobe on this phone is kept.',
            'Delete',
          );
          if (!ok) return;
          setBusy('delete');
          try {
            await deleteAccount();
            await clearSyncState(user.id);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(null);
          }
        }}
      />
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
    </ScrollView>
  );
}
