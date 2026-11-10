import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Button, Section } from '../components/ui';
import { Provider, useAuth } from '../lib/auth';
import { logError } from '../lib/diagnostics';
import { supabaseConfigured } from '../lib/supabase';
import { clearSyncState, useSync } from '../lib/sync/SyncProvider';
import { useTheme } from '../lib/theme';
import { openPaywall } from '../lib/usePaywall';

/**
 * Which sign-in options this build offers, e.g. "apple,google,email".
 * "apple" = native Sign in with Apple on iPhone. Add "apple-web" to also offer Apple on Android/web
 * (needs the extra Apple Services ID setup in Supabase).
 */
const LIST: string[] = (process.env.EXPO_PUBLIC_AUTH_PROVIDERS ?? 'apple,google,email').split(',').map((s: string) => s.trim());
const ENABLED = LIST.filter((p) => p !== 'apple' || Platform.OS === 'ios' || LIST.includes('apple-web')).filter((p) => p !== 'apple-web');

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
  if (!ready) return <View style={ui.screen} />;
  return session ? <SignedIn /> : <SignIn />;
}

function SignIn() {
  const { colors, ui } = useTheme();
  const { sendCode, verifyCode, signInWith, initError } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [nativeApple, setNativeApple] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setNativeApple);
  }, []);

  const run = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(what);
    setError('');
    try {
      await fn();
    } catch (e) {
      logError(`sign-in (${what})`, e);
      setError((e as Error)?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { gap: 14, maxWidth: 480, width: '100%', alignSelf: 'center' }]} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 6, marginTop: 8 }}>
        <Text style={ui.h1}>Back up & sync</Text>
        <Text style={ui.muted}>
          Sign in to keep your wardrobe safe in the cloud and use it on more than one phone. Everything you already have here comes
          with you.
        </Text>
      </View>

      {ENABLED.includes('apple') ? (
        nativeApple ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={{ height: 48 }}
            onPress={() => run('apple', () => signInWith('apple'))}
          />
        ) : (
          <ProviderButton provider="apple" busy={busy === 'apple'} onPress={() => run('apple', () => signInWith('apple'))} />
        )
      ) : null}
      {ENABLED.includes('google') ? (
        <ProviderButton provider="google" busy={busy === 'google'} onPress={() => run('google', () => signInWith('google'))} />
      ) : null}

      {ENABLED.includes('email') ? (
        <>
          {ENABLED.length > 1 ? (
            <View style={[ui.row, { gap: 10, marginVertical: 4 }]}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              <Text style={ui.muted}>or use your email</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            </View>
          ) : null}

          {!codeSentTo ? (
            <>
              <TextInput
                style={ui.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                onSubmitEditing={() => validEmail && run('send', async () => (await sendCode(email), setCodeSentTo(email.trim())))}
              />
              <Button
                title={busy === 'send' ? 'Sending…' : 'Email me a sign-in link'}
                variant="secondary"
                onPress={() =>
                  !busy &&
                  (validEmail
                    ? run('send', async () => {
                        await sendCode(email);
                        setCodeSentTo(email.trim());
                      })
                    : setError('Enter a valid email address.'))
                }
              />
            </>
          ) : (
            <>
              <Text style={ui.body}>
                We emailed <Text style={{ fontWeight: '700' }}>{codeSentTo}</Text>. Open the email on this phone and tap{' '}
                <Text style={{ fontWeight: '700' }}>Sign in to Wearday</Text>. If the email has a 6-digit code, you can enter it below instead.
              </Text>
              <TextInput
                style={[ui.input, { fontSize: 24, letterSpacing: 8, textAlign: 'center' }]}
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
              />
              <Button
                title={busy === 'verify' ? 'Checking…' : 'Sign in'}
                onPress={() => !busy && code.length === 6 && run('verify', () => verifyCode(codeSentTo, code))}
              />
              <View style={[ui.row, { justifyContent: 'space-between' }]}>
                <Pressable onPress={() => (setCodeSentTo(null), setCode(''))} hitSlop={8}>
                  <Text style={[ui.body, { color: colors.accent }]}>Use a different email</Text>
                </Pressable>
                <Pressable onPress={() => !busy && run('send', () => sendCode(codeSentTo))} hitSlop={8}>
                  <Text style={[ui.body, { color: colors.accent }]}>Resend email</Text>
                </Pressable>
              </View>
            </>
          )}
        </>
      ) : null}

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      {initError && !error ? <Text style={ui.muted}>{initError}</Text> : null}
      <Text style={[ui.muted, { marginTop: 8 }]}>
        Your photos and wardrobe are stored privately in your account. Only you can see them.
      </Text>
    </ScrollView>
  );
}

function ProviderButton({ provider, busy, onPress }: { provider: Provider; busy: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const apple = provider === 'apple';
  const bg = apple ? '#000000' : colors.card;
  const fg = apple ? '#FFFFFF' : colors.text;
  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        height: 48,
        borderRadius: 12,
        backgroundColor: bg,
        borderWidth: apple ? 0 : 1,
        borderColor: colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Ionicons name={apple ? 'logo-apple' : 'logo-google'} size={20} color={fg} />}
      <Text style={{ color: fg, fontSize: 16, fontWeight: '600' }}>Continue with {apple ? 'Apple' : 'Google'}</Text>
    </Pressable>
  );
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
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { gap: 8, maxWidth: 600, width: '100%', alignSelf: 'center' }]}>
      <Section title="Account">
        <Text style={ui.body}>{user.email ?? 'Signed in'}</Text>
        <Text style={ui.muted}>Signed in with {via === 'email' ? 'email code' : via[0].toUpperCase() + via.slice(1)}</Text>
      </Section>

      <Section title="Sync">
        <View style={[ui.row, { gap: 8 }]}>
          {status.state === 'syncing' ? <ActivityIndicator color={colors.accent} /> : null}
          <Text style={[ui.body, { flex: 1, color: status.state === 'error' ? colors.danger : colors.text }]}>{statusText}</Text>
        </View>
        <Text style={ui.muted}>Your wardrobe syncs automatically when you make changes and when you open the app.</Text>
        {status.state === 'limit' ? (
          <Button title="✨ Go Premium" onPress={() => openPaywall('sync')} />
        ) : (
          <Button title="Sync now" variant="secondary" onPress={() => syncNow()} />
        )}
      </Section>

      <Button
        title={busy === 'out' ? 'Signing out…' : 'Sign out'}
        variant="secondary"
        onPress={async () => {
          if (!(await ask('Sign out?', 'Your wardrobe stays on this phone. Sign in again any time to sync.', 'Sign out'))) return;
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
        title={busy === 'delete' ? 'Deleting…' : 'Delete account'}
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
