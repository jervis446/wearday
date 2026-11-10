import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';

/**
 * Landing route for wearday://auth-callback. Usually the sign-in browser hands the result
 * straight back to the app; this covers the case where Android opens the link as a deep link.
 */
export default function AuthCallback() {
  const { colors, ui } = useTheme();
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const [error, setError] = useState(params.error_description ?? '');

  useEffect(() => {
    if (!params.code || !supabase) {
      if (!params.error_description) router.replace('/');
      return;
    }
    supabase.auth.exchangeCodeForSession(params.code).then(({ error: e }) => {
      if (e && /verifier/i.test(e.message)) setError('Open the sign-in link on the same phone where you asked for it, or request a new one there.');
      else if (e && /expired|invalid/i.test(e.message)) setError('That sign-in link has expired. Request a new one on the sign-in screen.');
      else if (e && !/already|used/i.test(e.message)) setError(e.message);
      else router.replace('/');
    });
  }, [params.code, params.error_description]);

  return (
    <View style={[ui.screen, { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }]}>
      {error ? (
        <>
          <Text style={[ui.body, { color: colors.danger, textAlign: 'center' }]}>{error}</Text>
          <Button title="Back to sign in" variant="secondary" onPress={() => router.replace('/')} />
        </>
      ) : (
        <ActivityIndicator color={colors.accent} />
      )}
    </View>
  );
}
