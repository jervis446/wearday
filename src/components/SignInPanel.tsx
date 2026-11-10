import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { Provider, useAuth } from '../lib/auth';
import { logError } from '../lib/diagnostics';
import { font, useTheme } from '../lib/theme';
import { Bouncy, Button } from './ui';

/**
 * Which sign-in options this build offers, e.g. "apple,google,email".
 * "apple" = native Sign in with Apple on iPhone. Add "apple-web" to also offer Apple on Android/web
 * (needs the extra Apple Services ID setup in Supabase).
 */
const LIST: string[] = (process.env.EXPO_PUBLIC_AUTH_PROVIDERS ?? 'apple,google,email').split(',').map((s: string) => s.trim());
const ENABLED = LIST.filter((p) => p !== 'apple' || Platform.OS === 'ios' || LIST.includes('apple-web')).filter((p) => p !== 'apple-web');

/** Sign-in buttons and the email link/code flow. Used by the welcome screen. */
export function SignInPanel() {
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
  const send = () =>
    busy
      ? undefined
      : validEmail
        ? run('send', async () => {
            await sendCode(email);
            setCodeSentTo(email.trim());
          })
        : setError('Enter a valid email address.');

  return (
    <View style={{ gap: 12 }}>
      {ENABLED.includes('apple') ? (
        nativeApple ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={26}
            style={{ height: 52 }}
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
              <Text style={ui.muted}>or with email</Text>
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
                returnKeyType="send"
                onSubmitEditing={send}
              />
              <Button title="Continue with email" busy={busy === 'send'} onPress={send} />
            </>
          ) : (
            <>
              <View style={[ui.card, { padding: 16, gap: 6 }]}>
                <Text style={[ui.body, { fontFamily: font.bodyBold }]}>Check your inbox 📬</Text>
                <Text style={ui.muted}>
                  We sent a link to <Text style={{ color: colors.text, fontFamily: font.bodyBold }}>{codeSentTo}</Text>. Open it on this phone, or
                  type the 6-digit code from the email.
                </Text>
              </View>
              <TextInput
                style={[ui.input, { fontSize: 26, letterSpacing: 10, textAlign: 'center', fontFamily: font.display }]}
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
              />
              <Button
                title="Sign in"
                busy={busy === 'verify'}
                onPress={() => (code.length === 6 ? run('verify', () => verifyCode(codeSentTo, code)) : setError('Enter the 6-digit code.'))}
              />
              <View style={[ui.row, { justifyContent: 'space-between' }]}>
                <Pressable onPress={() => (setCodeSentTo(null), setCode(''))} hitSlop={8}>
                  <Text style={[ui.body, { color: colors.accent }]}>Use a different email</Text>
                </Pressable>
                <Pressable onPress={() => !busy && run('send', () => sendCode(codeSentTo))} hitSlop={8}>
                  <Text style={[ui.body, { color: colors.accent }]}>{busy === 'send' ? 'Sending…' : 'Resend'}</Text>
                </Pressable>
              </View>
            </>
          )}
        </>
      ) : null}

      {error ? <Text style={[ui.body, { color: colors.danger }]}>{error}</Text> : null}
      {initError && !error ? <Text style={ui.muted}>{initError}</Text> : null}
    </View>
  );
}

function ProviderButton({ provider, busy, onPress }: { provider: Provider; busy: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const apple = provider === 'apple';
  // Solid white / glass pills, so the brand marks stay recognisable on the dark background.
  const bg = apple ? colors.text : colors.glass;
  const fg = apple ? colors.bg : colors.text;
  return (
    <Bouncy
      onPress={busy ? undefined : onPress}
      style={{
        height: 52,
        borderRadius: 999,
        backgroundColor: bg,
        borderWidth: apple ? 0 : 1,
        borderColor: colors.glassBorder,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
      }}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Ionicons name={apple ? 'logo-apple' : 'logo-google'} size={20} color={fg} />}
      <Text style={{ color: fg, fontSize: 16, fontFamily: font.bodyBold }}>Continue with {apple ? 'Apple' : 'Google'}</Text>
    </Bouncy>
  );
}
