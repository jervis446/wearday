import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Button, ItemThumb, Section } from '../components/ui';
import { track } from '../lib/analytics';
import { moodByLabel } from '../lib/moods';
import { useSettings } from '../lib/settings';
import { useStore } from '../lib/store';
import { buildStyleProfile, hasStyle } from '../lib/style';
import { font, useTheme } from '../lib/theme';
import { dayLabel, type OutfitRating, RATINGS, type WearLog } from '../lib/types';

const RATING_EMOJI: Record<OutfitRating, string> = { love: '❤️', ok: '🙂', dislike: '👎' };
const SHOWN = 40;

/**
 * "My style": the person adds outfits they've worn before and rates them, and can describe
 * their style in their own words. Suggestions use what's learned here (see lib/style.ts).
 */
export default function StyleScreen() {
  const { colors, ui } = useTheme();
  const { items, logs, outfits, itemsOfLog, saveLog } = useStore();
  const { settings, update } = useSettings();
  const [notes, setNotes] = useState(settings.styleNotes ?? '');

  const profile = useMemo(
    () => buildStyleProfile({ items, logs, outfits, itemsOfLog, notes: settings.styleNotes }),
    [items, logs, outfits, itemsOfLog, settings.styleNotes],
  );
  const history = useMemo(() => [...logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, SHOWN), [logs]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const unrated = logs.filter((l) => !l.rating).length;

  const rate = (log: WearLog, r: OutfitRating) => {
    const next = log.rating === r ? undefined : r;
    saveLog({ ...log, rating: next });
    if (next) track('outfit_rated', { rating: next, from: 'style' });
  };

  const saveNotes = () => {
    const v = notes.trim();
    if (v !== (settings.styleNotes ?? '')) update({ styleNotes: v || undefined });
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { gap: 12, paddingBottom: 60, maxWidth: 600, width: '100%', alignSelf: 'center' }]}>
      <Text style={ui.muted}>
        Add outfits you’ve worn and say how they felt. Wearday learns what you love and uses it every time it suggests an outfit.
      </Text>

      <Button title="＋ Add a past outfit" onPress={() => router.push({ pathname: '/log', params: { past: '1' } })} />

      <Section title="What Wearday has learned">
        {hasStyle(profile) ? (
          <View style={{ gap: 8 }}>
            <Text style={ui.body}>
              From {profile.outfitsLearned} outfit{profile.outfitsLearned === 1 ? '' : 's'}
              {profile.loved ? ` · ${profile.loved} loved` : ''}
              {profile.disliked ? ` · ${profile.disliked} not you` : ''}
            </Text>
            {profile.favoriteColors.length ? <Learned label="Colours you love" values={profile.favoriteColors} /> : null}
            {profile.favoriteTags.length ? <Learned label="Your vibe" values={profile.favoriteTags} /> : null}
            {Object.keys(profile.moodOutfits).length ? (
              <Learned
                label="Moods you’ve dressed for"
                values={Object.keys(profile.moodOutfits).map((m) => `${moodByLabel(m)?.emoji ?? ''} ${m}`.trim())}
              />
            ) : null}
            {unrated ? (
              <Text style={ui.muted}>
                Rate {unrated === 1 ? 'the outfit' : `the ${unrated} outfits`} below without a rating to sharpen this.
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={ui.muted}>Nothing yet. Add a few outfits you’ve worn (and tap ❤️ on the ones you loved) to get started.</Text>
        )}
      </Section>

      <Section title="Describe your style">
        <TextInput
          style={[ui.input, { minHeight: 80, textAlignVertical: 'top' }]}
          value={notes}
          onChangeText={setNotes}
          onBlur={saveNotes}
          onSubmitEditing={saveNotes}
          maxLength={300}
          multiline
          placeholder="e.g. Minimal, earthy tones, love oversized fits, never wear yellow"
          placeholderTextColor={colors.muted}
        />
        <Button title="Save" variant="secondary" onPress={saveNotes} />
        <Text style={ui.muted}>Sent with AI suggestions. Stays on this phone.</Text>
      </Section>

      <Text style={ui.label}>Your outfits</Text>
      {history.length ? (
        history.map((log) => {
          const ids = itemsOfLog(log);
          const mood = moodByLabel(log.mood);
          return (
            <View key={log.id} style={[ui.card, { padding: 12, gap: 10 }]}>
              <Pressable onPress={() => router.push({ pathname: '/log', params: { logId: log.id } })} style={{ gap: 8 }}>
                <View style={[ui.row, { justifyContent: 'space-between' }]}>
                  <Text style={[ui.body, { fontFamily: font.bodyBold }]}>{dayLabel(log.date)}</Text>
                  {mood ? <Text style={ui.muted}>{`${mood.emoji} ${mood.label}`}</Text> : null}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {ids.length ? (
                    ids.map((id) => <ItemThumb key={id} item={byId.get(id)} size={56} />)
                  ) : (
                    <Text style={ui.muted}>No items picked</Text>
                  )}
                </ScrollView>
              </Pressable>
              <View style={[ui.row, { gap: 8 }]}>
                {RATINGS.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => rate(log, r)}
                    accessibilityRole="button"
                    accessibilityLabel={`Rate ${r}`}
                    accessibilityState={{ selected: log.rating === r }}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: log.rating === r ? colors.accent : colors.border,
                      backgroundColor: log.rating === r ? colors.accentSoft : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>{RATING_EMOJI[r]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })
      ) : (
        <Text style={ui.muted}>No outfits yet.</Text>
      )}
    </ScrollView>
  );
}

function Learned({ label, values }: { label: string; values: string[] }) {
  const { colors, ui } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={ui.muted}>{label}</Text>
      <View style={[ui.row, { gap: 6, flexWrap: 'wrap' }]}>
        {values.map((v) => (
          <View key={v} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.accentSoft }}>
            <Text style={[ui.body, { fontSize: 13 }]}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
