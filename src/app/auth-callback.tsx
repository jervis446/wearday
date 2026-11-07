import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

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
      if (!params.error_description) router.replace('/account');
      return;
    }
    supabase.auth.exchangeCodeForSession(params.code).then(({ error: e }) => {
      if (e && !/already|used/i.test(e.message)) setError(e.message);
      else router.replace('/account');
    });
  }, [params.code, params.error_description]);

  return (
    <View style={[ui.screen, { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }]}>
      {error ? <Text style={{ color: colors.danger, textAlign: 'center' }}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
    </View>
  );
}
