import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';

import { TERMS_URL } from '../../lib/links';
import { saveProfile, SocialError, type Profile } from '../../lib/social/api';
import { cleanDisplayName, DISPLAY_NAME_MAX, displayNameProblem, normalizeUsername, USERNAME_MAX, usernameProblem } from '../../lib/social/rules';
import { useTheme } from '../../lib/theme';
import { Button } from '../ui';

const GUIDELINES_URL = `${TERMS_URL}#community`;

/**
 * Choose a username and name before using Friends. The first time, people also confirm they're
 * 13 or older and agree to the community guidelines.
 */
export function ProfileSetup({ current, onSaved }: { current?: Profile; onSaved: (p: Profile) => void }) {
  const { colors, ui } = useTheme();
  const [username, setUsername] = useState(current?.username ?? '');
  const [displayName, setDisplayName] = useState(current?.displayName ?? '');
  const [agreed, setAgreed] = useState(!!current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);

  const normalized = normalizeUsername(username);
  const name = cleanDisplayName(displayName);
  const usernameIssue = usernameProblem(normalized);
  const nameIssue = displayNameProblem(name);

  const save = async () => {
    setTouched(true);
    setError('');
    if (usernameIssue || nameIssue || !agreed || busy) return;
    setBusy(true);
    try {
      const profile = { username: normalized, displayName: name };
      await saveProfile(profile, !current);
      onSaved(profile);
    } catch (e) {
      setError(e instanceof SocialError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={ui.label}>Username</Text>
      <TextInput
        style={ui.input}
        value={username}
        onChangeText={(t) => setUsername(t.replace(/\s/g, ''))}
        placeholder="e.g. ana.styles"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username-new"
        maxLength={USERNAME_MAX + 1}
        accessibilityLabel="Username"
      />
      <Text style={[ui.muted, touched && usernameIssue ? { color: colors.danger } : null]}>
        {touched && usernameIssue ? usernameIssue : 'Friends add you with this. Letters, numbers, dots and underscores.'}
      </Text>

      <Text style={ui.label}>Your name</Text>
      <TextInput
        style={ui.input}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="What friends call you"
        placeholderTextColor={colors.muted}
        maxLength={DISPLAY_NAME_MAX}
        autoComplete="name"
        accessibilityLabel="Your name"
      />
      {touched && nameIssue ? <Text style={[ui.muted, { color: colors.danger }]}>{nameIssue}</Text> : null}

      {!current ? (
        <View style={[ui.row, { gap: 12, marginTop: 14, alignItems: 'flex-start' }]}>
          <Switch
            value={agreed}
            onValueChange={setAgreed}
            trackColor={{ true: colors.accent }}
            thumbColor={colors.card}
            accessibilityLabel="I’m 13 or older and agree to the community guidelines"
          />
          <Text style={[ui.body, { flex: 1 }]}>
            I’m 13 or older and agree to the{' '}
            <Text style={{ color: colors.accent, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(GUIDELINES_URL)} accessibilityRole="link">
              community guidelines
            </Text>
            .
          </Text>
        </View>
      ) : null}
      {touched && !agreed ? <Text style={[ui.muted, { color: colors.danger }]}>Please confirm to continue.</Text> : null}

      {error ? (
        <Text style={{ color: colors.danger, marginTop: 6 }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button title={current ? 'Save' : 'Continue'} busy={busy} disabled={busy} onPress={save} style={{ marginTop: 12 }} />
    </View>
  );
}
