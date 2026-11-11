import * as Linking from 'expo-linking';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, Share, Text, TextInput, View } from 'react-native';

import { Avatar } from '../components/social/FitCard';
import { ProfileSetup } from '../components/social/ProfileSetup';
import { Button, confirm, Section } from '../components/ui';
import { track } from '../lib/analytics';
import {
  blockUser,
  type Connection,
  getMyProfile,
  listBlocked,
  listConnections,
  type Person,
  type Profile,
  removeFriend,
  respondToRequest,
  sendFriendRequest,
  SocialError,
  unblockUser,
} from '../lib/social/api';
import { normalizeUsername, USERNAME_MAX, usernameProblem } from '../lib/social/rules';
import { font, useTheme } from '../lib/theme';

const message = (e: unknown) => (e instanceof SocialError ? e.message : 'Something went wrong. Please try again.');

const RESULT_TEXT = {
  sent: 'Request sent. You’ll be friends when they accept.',
  accepted: 'You’re now friends!',
  pending: 'You already sent them a request.',
  already_friends: 'You’re already friends.',
} as const;

/** Your username and invite, friend requests, friends and blocked people. */
export default function FriendsScreen() {
  const { colors, ui } = useTheme();
  // Invite links open wearday://friends?add=<username>.
  const params = useLocalSearchParams<{ add?: string }>();
  const [profile, setProfile] = useState<Profile | null>();
  const [editing, setEditing] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [blocked, setBlocked] = useState<Person[]>([]);
  const [username, setUsername] = useState(params.add ? normalizeUsername(params.add) : '');
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const [busyId, setBusyId] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [inviteText, setInviteText] = useState('');
  const sending = useRef(false);

  const load = useCallback(async () => {
    try {
      const me = await getMyProfile();
      setProfile(me);
      if (!me) return;
      const [list, blockedList] = await Promise.all([listConnections(), listBlocked()]);
      setConnections(list);
      setBlocked(blockedList);
    } catch (e) {
      setNotice({ text: message(e), error: true });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /** Runs a change for one person, then reloads the lists. */
  const act = async (userId: string, run: () => Promise<void>, done?: string) => {
    if (busyId) return;
    setBusyId(userId);
    setNotice(undefined);
    try {
      await run();
      if (done) setNotice({ text: done });
      await load();
    } catch (e) {
      setNotice({ text: message(e), error: true });
    } finally {
      setBusyId(undefined);
    }
  };

  const add = async () => {
    const name = normalizeUsername(username);
    const problem = usernameProblem(name);
    if (problem) return setNotice({ text: problem, error: true });
    if (sending.current) return;
    sending.current = true;
    setNotice(undefined);
    try {
      const result = await sendFriendRequest(name);
      setNotice({ text: RESULT_TEXT[result] });
      if (result === 'sent' || result === 'accepted') {
        setUsername('');
        track(result === 'sent' ? 'friend_request_sent' : 'friend_added');
      }
      await load();
    } catch (e) {
      setNotice({ text: message(e), error: true });
    } finally {
      sending.current = false;
    }
  };

  const invite = async () => {
    if (!profile) return;
    const link = Linking.createURL('/friends', { queryParams: { add: profile.username } });
    const text = `Add me on Wearday so we can rate each other’s fits! My username is @${profile.username}\n${link}`;
    try {
      if (Platform.OS === 'web' && !('share' in navigator)) throw new Error('no share sheet');
      await Share.share({ message: text });
    } catch {
      // No share sheet (some browsers): show the text so it can be copied.
      setInviteText(text);
    }
  };

  if (profile === undefined) {
    return (
      <View style={[ui.screen, { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }]}>
        <Stack.Screen options={{ title: 'Friends' }} />
        {notice ? <Text style={[ui.body, { textAlign: 'center' }]}>{notice.text}</Text> : <ActivityIndicator color={colors.accent} />}
        {notice ? <Button title="Try again" variant="secondary" onPress={load} /> : null}
      </View>
    );
  }

  const friends = connections.filter((c) => c.relation === 'friend');
  const incoming = connections.filter((c) => c.relation === 'incoming');
  const outgoing = connections.filter((c) => c.relation === 'outgoing');

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={[ui.pad, { gap: 4, paddingBottom: 60, maxWidth: 600, width: '100%', alignSelf: 'center' }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={colors.accent}
        />
      }
    >
      <Stack.Screen options={{ title: 'Friends' }} />

      {profile === null || editing ? (
        <Section title={profile ? 'Edit your profile' : 'Choose a username'}>
          <ProfileSetup
            current={profile ?? undefined}
            onSaved={(p) => {
              setProfile(p);
              setEditing(false);
              load();
            }}
          />
          {editing ? <Button title="Cancel" variant="secondary" onPress={() => setEditing(false)} /> : null}
        </Section>
      ) : (
        <>
          <Section title="You">
            <View style={[ui.row, { gap: 12 }]}>
              <Avatar name={profile.displayName} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={[ui.body, { fontFamily: font.bodyBold }]}>{profile.displayName}</Text>
                <Text style={ui.muted} selectable>
                  @{profile.username}
                </Text>
              </View>
              <Button title="Edit" variant="secondary" onPress={() => setEditing(true)} />
            </View>
            <Button title="Invite a friend" onPress={invite} />
            {inviteText ? (
              <Text selectable style={[ui.muted, { padding: 10, borderRadius: 12, backgroundColor: colors.chip }]}>
                {inviteText}
              </Text>
            ) : null}
          </Section>

          <Section title="Add a friend">
            <TextInput
              style={ui.input}
              value={username}
              onChangeText={(t) => setUsername(t.replace(/\s/g, ''))}
              onSubmitEditing={add}
              placeholder="Their username, e.g. ana.styles"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={USERNAME_MAX + 1}
              returnKeyType="send"
              accessibilityLabel="Friend’s username"
            />
            <Button title="Send request" onPress={add} disabled={!username.trim()} />
          </Section>

          {notice ? (
            <Text style={{ color: notice.error ? colors.danger : colors.text, marginBottom: 8 }} accessibilityLiveRegion="polite">
              {notice.text}
            </Text>
          ) : null}

          {incoming.length ? (
            <Section title={`Requests (${incoming.length})`}>
              {incoming.map((p) => (
                <PersonRow key={p.userId} person={p}>
                  <Button title="Accept" busy={busyId === p.userId} onPress={() => act(p.userId, () => respondToRequest(p.userId, true), `You and ${p.displayName} are now friends.`)} />
                  <Button title="Decline" variant="secondary" onPress={() => act(p.userId, () => respondToRequest(p.userId, false))} />
                </PersonRow>
              ))}
            </Section>
          ) : null}

          <Section title={`Friends (${friends.length})`}>
            {friends.length ? (
              friends.map((p) => (
                <PersonRow key={p.userId} person={p}>
                  <Button
                    title="Remove"
                    variant="secondary"
                    busy={busyId === p.userId}
                    onPress={() =>
                      confirm(`Remove ${p.displayName}?`, () => act(p.userId, () => removeFriend(p.userId)), 'Remove', 'You won’t see each other’s fits any more.')
                    }
                  />
                  <Button
                    title="Block"
                    variant="danger"
                    onPress={() =>
                      confirm(
                        `Block ${p.displayName}?`,
                        () => act(p.userId, () => blockUser(p.userId).then(() => track('friend_blocked'))),
                        'Block',
                        'You’ll stop being friends and they can’t send you requests. They aren’t told.',
                      )
                    }
                  />
                </PersonRow>
              ))
            ) : (
              <Text style={ui.muted}>No friends yet. Send a request or share your invite.</Text>
            )}
          </Section>

          {outgoing.length ? (
            <Section title="Waiting for them">
              {outgoing.map((p) => (
                <PersonRow key={p.userId} person={p}>
                  <Button title="Cancel" variant="secondary" busy={busyId === p.userId} onPress={() => act(p.userId, () => removeFriend(p.userId))} />
                </PersonRow>
              ))}
            </Section>
          ) : null}

          {blocked.length ? (
            <Section title="Blocked">
              {blocked.map((p) => (
                <PersonRow key={p.userId} person={p}>
                  <Button title="Unblock" variant="secondary" busy={busyId === p.userId} onPress={() => act(p.userId, () => unblockUser(p.userId))} />
                </PersonRow>
              ))}
            </Section>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function PersonRow({ person, children }: { person: Person; children: React.ReactNode }) {
  const { ui } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <View style={[ui.row, { gap: 10 }]}>
        <Avatar name={person.displayName} />
        <View style={{ flex: 1 }}>
          <Text style={[ui.body, { fontFamily: font.bodyBold }]} numberOfLines={1}>
            {person.displayName}
          </Text>
          {person.username ? (
            <Text style={ui.muted} numberOfLines={1}>
              @{person.username}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={[ui.row, { gap: 8 }]}>{children}</View>
    </View>
  );
}
