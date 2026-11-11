import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ByAsanoha } from '../components/NohaMoney';
import { SignInPanel } from '../components/SignInPanel';
import { Backdrop } from '../components/ui';
import { PRIVACY_URL, TERMS_URL } from '../lib/links';
import { font, useTheme } from '../lib/theme';


const STICKERS = [
  { text: '👟 closet', rotate: '-8deg', top: 6, left: 4 },
  { text: '✨ AI fits', rotate: '6deg', top: 0, right: 8 },
  { text: '📅 OOTD', rotate: '-4deg', top: 64, right: 40 },
  { text: '🧳 packing', rotate: '7deg', top: 74, left: 36 },
] as const;

/** First screen for anyone who isn't signed in. */
export default function Welcome() {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <Backdrop />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'space-between',
            padding: 24,
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
            maxWidth: 480,
            width: '100%',
            alignSelf: 'center',
            gap: 28,
          }}
        >
          <View style={{ gap: 18 }}>
            <View style={{ height: 120 }}>
              {STICKERS.map((s) => (
                <View
                  key={s.text}
                  style={{
                    position: 'absolute',
                    top: s.top,
                    left: 'left' in s ? s.left : undefined,
                    right: 'right' in s ? s.right : undefined,
                    transform: [{ rotate: s.rotate }],
                    backgroundColor: s.text.includes('AI') ? colors.lime : colors.glass,
                    borderColor: colors.glassBorder,
                    borderWidth: 1,
                    borderRadius: 999,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ fontFamily: font.bodyBold, fontSize: 14, color: s.text.includes('AI') ? colors.onLime : colors.text }}>{s.text}</Text>
                </View>
              ))}
            </View>
            <Text style={[ui.h1, { fontSize: 56, lineHeight: 58, letterSpacing: -2.5 }]}>
              your closet,{'\n'}
              <Text style={{ color: colors.pink }}>but make it</Text>
              {'\n'}
              <Text style={{ color: colors.accent }}>iconic.</Text>
            </Text>
            <Text style={[ui.body, { color: colors.muted, fontSize: 17, lineHeight: 24 }]}>
              Snap your clothes, build fits, log your OOTD and get outfit ideas for today’s weather.
            </Text>
          </View>

          <View style={{ gap: 14 }}>
            <SignInPanel />
            <Text style={[ui.muted, { textAlign: 'center', fontSize: 12 }]}>
              By continuing you agree to the{' '}
              <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(TERMS_URL)}>
                Terms
              </Text>{' '}
              and{' '}
              <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(PRIVACY_URL)}>
                Privacy Policy
              </Text>
              . Your wardrobe is private to your account.
            </Text>
            <View style={{ alignItems: 'center' }}>
              <ByAsanoha />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
