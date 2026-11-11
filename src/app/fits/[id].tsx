import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Avatar, FitPhoto } from '../../components/social/FitCard';
import { Button, confirm } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { markReactionsSeen } from '../../lib/social/activity';
import { deleteFit, type FitRating, loadMyFit, loadRatings, type MyFit, photoLinks, SocialError } from '../../lib/social/api';
import { REACTIONS, reactionOf, timeAgo } from '../../lib/social/rules';
import { font, useTheme } from '../../lib/theme';

const message = (e: unknown) => (e instanceof SocialError ? e.message : 'Something went wrong. Please try again.');

/** One of your fits: who reacted, what they said, and delete. */
export default function MyFitScreen() {
  const { colors, ui } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [fit, setFit] = useState<MyFit | null>();
  const [ratings, setRatings] = useState<FitRating[]>([]);
  const [photo, setPhoto] = useState<string>();
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const found = await loadMyFit(id);
      setFit(found);
      if (!found) return;
      const [list, links] = await Promise.all([loadRatings(id), photoLinks([found.photoPath])]);
      setRatings(list);
      setPhoto(links[found.photoPath]);
      if (session) markReactionsSeen(session.user.id);
      setError('');
    } catch (e) {
      setError(message(e));
    }
  }, [id, session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const remove = () =>
    confirm(
      'Delete this fit?',
      async () => {
        if (!fit) return;
        setDeleting(true);
        try {
          await deleteFit(fit);
          router.back();
        } catch (e) {
          setError(message(e));
          setDeleting(false);
        }
      },
      'Delete',
      'It disappears for your friends, along with their reactions.',
    );

  if (fit === undefined && !error) {
    return (
      <View style={[ui.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <Stack.Screen options={{ title: 'Your fit' }} />
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={[ui.pad, { gap: 12, paddingBottom: 60, maxWidth: 600, width: '100%', alignSelf: 'center' }]}
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
      <Stack.Screen options={{ title: 'Your fit' }} />
      {error ? (
        <Text style={{ color: colors.danger }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {fit === null ? <Text style={ui.body}>This fit was deleted.</Text> : null}

      {fit ? (
        <>
          <View style={{ width: '80%', alignSelf: 'center' }}>
            <FitPhoto uri={photo} label="Your outfit photo" />
          </View>
          <Text style={ui.muted}>Shared {timeAgo(fit.createdAt)} ago · only your friends can see it</Text>
          {fit.caption ? <Text style={ui.body}>{fit.caption}</Text> : null}
          {fit.itemNames.length ? <Text style={ui.muted}>Wearing: {fit.itemNames.join(' · ')}</Text> : null}
          {fit.hidden ? (
            <Text style={{ color: colors.danger }}>
              Friends reported this fit, so it’s hidden while it’s reviewed. If it follows the community guidelines, it comes back.
            </Text>
          ) : null}

          <View style={[ui.card, { padding: 16, gap: 10 }]}>
            <Text style={ui.h2}>Reactions</Text>
            <View style={[ui.row, { gap: 16 }]}>
              {REACTIONS.map((r) => (
                <Text key={r.key} style={[ui.body, { fontFamily: font.bodyBold }]} accessibilityLabel={`${fit.counts[r.key]} ${r.label}`}>
                  {r.emoji} {fit.counts[r.key]}
                </Text>
              ))}
            </View>
            {ratings.length ? (
              ratings.map((r, i) => (
                <View key={`${r.username ?? 'former'}-${i}`} style={[ui.row, { gap: 10, alignItems: 'flex-start' }]}>
                  <Avatar name={r.displayName ?? '?'} size={34} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={ui.body}>
                      <Text style={{ fontFamily: font.bodyBold }}>{r.displayName ?? 'A former friend'}</Text> {reactionOf(r.reaction)?.emoji}
                      <Text style={ui.muted}> · {timeAgo(r.updatedAt)}</Text>
                    </Text>
                    {r.comment ? <Text style={ui.body}>{r.comment}</Text> : null}
                  </View>
                </View>
              ))
            ) : (
              <Text style={ui.muted}>No reactions yet. Your friends see this fit in their feed.</Text>
            )}
          </View>

          <Button title="Delete fit" variant="danger" busy={deleting} disabled={deleting} onPress={remove} style={{ marginTop: 10 }} />
        </>
      ) : null}
    </ScrollView>
  );
}
