import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { FitCard, FitPhoto } from '../../components/social/FitCard';
import { ProfileSetup } from '../../components/social/ProfileSetup';
import { Button, ChipRow, Empty, HeaderButton } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { markReactionsSeen } from '../../lib/social/activity';
import {
  type FriendFit,
  getMyProfile,
  listConnections,
  loadFeed,
  loadMyFits,
  type MyFit,
  photoLinks,
  type Profile,
  SocialError,
} from '../../lib/social/api';
import { REACTIONS, timeAgo } from '../../lib/social/rules';
import { font, useTheme } from '../../lib/theme';

const TABS = ['Friends’ fits', 'Your fits'] as const;
type Tab = (typeof TABS)[number];

const message = (e: unknown) => (e instanceof SocialError ? e.message : 'Something went wrong. Please try again.');

/** "Rate my fit": your friends' outfit photos to react to, and the reactions to yours. */
export default function FitsScreen() {
  const { colors, ui } = useTheme();
  const { session } = useAuth();
  const uid = session?.user.id;
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('Friends’ fits');
  const [friendCount, setFriendCount] = useState(0);
  const [incoming, setIncoming] = useState(0);
  const [feed, setFeed] = useState<FriendFit[]>([]);
  const [mine, setMine] = useState<MyFit[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [more, setMore] = useState({ feed: false, mine: false });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const loadingMore = useRef(false);

  const addLinks = useCallback(async (paths: string[]) => {
    const fresh = await photoLinks(paths);
    setLinks((l) => ({ ...l, ...fresh }));
  }, []);

  const load = useCallback(async () => {
    try {
      const me = await getMyProfile();
      setProfile(me);
      if (me) {
        const [connections, friendFits, myFits] = await Promise.all([listConnections(), loadFeed(), loadMyFits()]);
        setFriendCount(connections.filter((c) => c.relation === 'friend').length);
        setIncoming(connections.filter((c) => c.relation === 'incoming').length);
        setFeed(friendFits.fits);
        setMine(myFits.fits);
        setMore({ feed: friendFits.more, mine: myFits.more });
        await addLinks([...friendFits.fits, ...myFits.fits].map((f) => f.photoPath));
      }
      setError('');
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [addLinks]);

  // Reload whenever the screen comes back into view (after sharing, or managing friends).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const loadMore = async () => {
    const isFeed = tab === 'Friends’ fits';
    if (loadingMore.current || !(isFeed ? more.feed : more.mine)) return;
    loadingMore.current = true;
    try {
      if (isFeed) {
        const page = await loadFeed(feed[feed.length - 1]?.createdAt);
        setFeed((f) => [...f, ...page.fits.filter((n) => !f.some((x) => x.id === n.id))]);
        setMore((m) => ({ ...m, feed: page.more }));
        await addLinks(page.fits.map((f) => f.photoPath));
      } else {
        const page = await loadMyFits(mine[mine.length - 1]?.createdAt);
        setMine((f) => [...f, ...page.fits.filter((n) => !f.some((x) => x.id === n.id))]);
        setMore((m) => ({ ...m, mine: page.more }));
        await addLinks(page.fits.map((f) => f.photoPath));
      }
    } catch (e) {
      setError(message(e));
    } finally {
      loadingMore.current = false;
    }
  };

  const showTab = (t: string) => {
    setTab(t as Tab);
    if (t === 'Your fits' && uid) markReactionsSeen(uid);
  };

  const header = (
    <Stack.Screen
      options={{
        title: 'Rate my fit',
        headerRight: profile
          ? () => <HeaderButton title={incoming ? `Friends (${incoming})` : 'Friends'} onPress={() => router.push('/friends')} />
          : undefined,
      }}
    />
  );

  if (profile === undefined) {
    return (
      <View style={[ui.screen, { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }]}>
        {header}
        {error ? (
          <>
            <Text style={[ui.body, { textAlign: 'center' }]}>{error}</Text>
            <Button title="Try again" variant="secondary" onPress={refresh} />
          </>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    );
  }

  if (profile === null) {
    return (
      <ScrollView
        style={ui.screen}
        contentContainerStyle={[ui.pad, { gap: 8, maxWidth: 600, width: '100%', alignSelf: 'center' }]}
        keyboardShouldPersistTaps="handled"
      >
        {header}
        <Text style={ui.h1}>Share your fits with friends</Text>
        <Text style={ui.muted}>
          Post an outfit photo and your friends react with 🔥, 👍 or 👎. Only friends you accept can see your fits, and only you see
          their reactions.
        </Text>
        <ProfileSetup
          onSaved={(p) => {
            setProfile(p);
            router.push('/friends');
          }}
        />
      </ScrollView>
    );
  }

  const isFeed = tab === 'Friends’ fits';
  const top = (
    <View style={{ gap: 12, marginBottom: 12 }}>
      {header}
      <ChipRow options={TABS} selected={[tab]} onToggle={showTab} scroll={false} />
      <Button title="📸 Share a fit" onPress={() => router.push('/fits/new')} />
      {error ? (
        <Text style={{ color: colors.danger }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );

  const empty = loading ? (
    <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
  ) : isFeed ? (
    friendCount ? (
      <Empty emoji="👀" title="No fits yet" hint="When your friends share a fit, it shows up here." />
    ) : (
      <Empty
        emoji="👯"
        title="Add your friends"
        hint="Friends see each other’s fits. Add them by username or send an invite."
        action={<Button title="Add friends" onPress={() => router.push('/friends')} />}
      />
    )
  ) : (
    <Empty emoji="📸" title="Share your first fit" hint="Snap today’s outfit and see what your friends think." />
  );

  return (
    <FlatList<FriendFit | MyFit>
      style={ui.screen}
      contentContainerStyle={[ui.pad, { gap: 14, paddingBottom: 60, maxWidth: 600, width: '100%', alignSelf: 'center' }]}
      data={isFeed ? feed : mine}
      keyExtractor={(f) => f.id}
      ListHeaderComponent={top}
      ListEmptyComponent={empty}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) =>
        isFeed ? (
          <FitCard
            fit={item as FriendFit}
            photoUri={links[item.photoPath]}
            onChange={(next) => setFeed((f) => f.map((x) => (x.id === next.id ? next : x)))}
            onRemove={(why) => {
              const author = (item as FriendFit).author.userId;
              setFeed((f) => (why === 'blocked' ? f.filter((x) => x.author.userId !== author) : f.filter((x) => x.id !== item.id)));
            }}
          />
        ) : (
          <MyFitRow fit={item as MyFit} photoUri={links[item.photoPath]} />
        )
      }
    />
  );
}

function MyFitRow({ fit, photoUri }: { fit: MyFit; photoUri?: string }) {
  const { colors, ui } = useTheme();
  const total = fit.counts.fire + fit.counts.nice + fit.counts.nope;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/fits/[id]', params: { id: fit.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Your fit from ${timeAgo(fit.createdAt)}, ${total} reactions`}
      style={[ui.card, { padding: 12, flexDirection: 'row', gap: 12 }]}
    >
      <View style={{ width: 96 }}>
        <FitPhoto uri={photoUri} label="Your outfit photo" />
      </View>
      <View style={{ flex: 1, gap: 6, justifyContent: 'center' }}>
        <Text style={ui.muted}>{timeAgo(fit.createdAt)}</Text>
        {fit.caption ? (
          <Text style={ui.body} numberOfLines={2}>
            {fit.caption}
          </Text>
        ) : null}
        {fit.hidden ? (
          <Text style={{ color: colors.danger }}>Hidden after reports. It’s being reviewed.</Text>
        ) : (
          <Text style={[ui.body, { fontFamily: font.bodyBold }]}>
            {REACTIONS.map((r) => `${r.emoji} ${fit.counts[r.key]}`).join('   ')}
            {fit.comments ? `   💬 ${fit.comments}` : ''}
          </Text>
        )}
        {!total && !fit.hidden ? <Text style={ui.muted}>No reactions yet</Text> : null}
      </View>
    </Pressable>
  );
}
