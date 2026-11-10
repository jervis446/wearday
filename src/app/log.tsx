import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { OutfitCanvas } from '../components/OutfitCanvas';
import { Button, ChipRow, confirm, ItemThumb } from '../components/ui';
import { track } from '../lib/analytics';
import { chooseImage } from '../lib/images';
import { moodByLabel, moodChip, moodFromChip, MOODS } from '../lib/moods';
import { useStore } from '../lib/store';
import { font, useTheme } from '../lib/theme';
import { CATEGORIES, dayLabel, daysAgoKey, inCloset, OutfitRating, RATING_LABEL, RATINGS, todayKey } from '../lib/types';

const MAX_DAYS_BACK = 365;

/**
 * Log what was worn on a day: a saved outfit and/or individual items, plus an outfit selfie,
 * how it felt and the mood. With `past=1` it starts on yesterday and lets you pick an earlier
 * day, to add outfits worn before (they teach suggestions your style, see lib/style.ts).
 */
export default function LogOutfit() {
  const { colors, ui } = useTheme();
  const params = useLocalSearchParams<{ date?: string; itemId?: string; itemIds?: string; logId?: string; past?: string; mood?: string }>();
  const { items, outfits, logs, saveLog, deleteLog } = useStore();
  const past = params.past === '1';
  const startDate = params.date ?? (past ? daysAgoKey(1) : todayKey());
  const [existing] = useState(() =>
    params.logId ? logs.find((l) => l.id === params.logId) : past ? undefined : logs.find((l) => l.date === startDate),
  );

  const [daysBack, setDaysBack] = useState(past ? 1 : 0);
  const date = existing?.date ?? (past ? daysAgoKey(daysBack) : startDate);
  // Adding a past outfit on a day that already has one: add to that day's entry.
  const sameDay = existing ? undefined : logs.find((l) => l.date === date);
  const [rating, setRating] = useState<OutfitRating | undefined>(existing?.rating);
  const [mood, setMood] = useState<string | undefined>(existing?.mood ?? (moodByLabel(params.mood) ? params.mood : undefined));
  const [outfitId, setOutfitId] = useState(existing?.outfitId);
  const [itemIds, setItemIds] = useState<string[]>(
    params.itemIds
      ? [...new Set([...(existing?.itemIds ?? []), ...params.itemIds.split(',').filter(Boolean)])]
      : (existing?.itemIds ?? (params.itemId ? [params.itemId] : [])),
  );
  const [selfieUri, setSelfieUri] = useState(existing?.selfieUri);
  const [note, setNote] = useState(existing?.note ?? '');
  const [cat, setCat] = useState('Tops');

  const toggleItem = (id: string) =>
    setItemIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const save = () => {
    const base = existing ?? sameDay;
    saveLog({
      id: base?.id,
      date,
      outfitId: outfitId ?? sameDay?.outfitId,
      itemIds: sameDay ? [...new Set([...sameDay.itemIds, ...itemIds])] : itemIds,
      selfieUri: selfieUri ?? sameDay?.selfieUri,
      note: note.trim() || sameDay?.note || undefined,
      rating: rating ?? sameDay?.rating,
      mood: mood ?? sameDay?.mood,
    });
    if (!existing) track('outfit_logged', { items: itemIds.length, outfit: !!outfitId, selfie: !!selfieUri, past: date !== todayKey(), mood: mood ?? '' });
    if (rating && rating !== existing?.rating) track('outfit_rated', { rating, past: date !== todayKey() });
    router.back();
  };

  const owned = items.filter((i) => inCloset(i) && i.category === cat);

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { paddingBottom: 60, maxWidth: 600, width: '100%', alignSelf: 'center' }]}>
      <Stack.Screen options={{ title: past && !existing ? 'Add a past outfit' : `Outfit for ${dayLabel(date)}` }} />

      {past && !existing ? (
        <>
          <Text style={ui.label}>When did you wear it?</Text>
          <View style={[ui.row, { gap: 10 }]}>
            <Button
              title="‹"
              variant="secondary"
              style={{ width: 52 }}
              onPress={() => setDaysBack((d) => Math.min(MAX_DAYS_BACK, d + 1))}
            />
            <Text style={[ui.body, { flex: 1, textAlign: 'center', fontFamily: font.bodyBold }]}>{dayLabel(date)}</Text>
            <Button
              title="›"
              variant="secondary"
              style={{ width: 52, opacity: daysBack <= 1 ? 0.4 : 1 }}
              onPress={() => setDaysBack((d) => Math.max(1, d - 1))}
            />
          </View>
          <ChipRow
            options={['1 week ago', '2 weeks ago', '1 month ago']}
            selected={[]}
            onToggle={(o) => setDaysBack(o.startsWith('1 week') ? 7 : o.startsWith('2') ? 14 : 30)}
          />
          {sameDay ? <Text style={ui.muted}>You already logged this day: what you pick is added to it.</Text> : null}
        </>
      ) : null}

      <Text style={ui.label}>Outfit selfie</Text>
      <Pressable
        onPress={async () => {
          const uri = await chooseImage(false);
          if (uri) setSelfieUri(uri);
        }}
        style={[ui.card, { aspectRatio: 3 / 4, width: '60%', alignSelf: 'center', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }]}
      >
        {selfieUri ? (
          <Image source={{ uri: selfieUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <Text style={[ui.muted, { textAlign: 'center', padding: 12 }]}>Tap to add a mirror selfie</Text>
        )}
      </Pressable>

      <Text style={ui.label}>Saved outfit</Text>
      <FlatList
        horizontal
        data={outfits}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ gap: 8 }}
        ListEmptyComponent={<Text style={ui.muted}>No saved outfits — pick items below instead.</Text>}
        renderItem={({ item: o }) => (
          <Pressable
            onPress={() => setOutfitId((cur) => (cur === o.id ? undefined : o.id))}
            style={{ borderWidth: 2, borderRadius: 18, borderColor: outfitId === o.id ? colors.accent : 'transparent' }}
          >
            <View pointerEvents="none">
              <OutfitCanvas pieces={o.pieces} items={items} size={110} />
            </View>
            <Text numberOfLines={1} style={[ui.muted, { width: 110, textAlign: 'center' }]}>{o.name}</Text>
          </Pressable>
        )}
      />

      <Text style={ui.label}>Individual items ({itemIds.length} selected)</Text>
      <ChipRow options={CATEGORIES} selected={[cat]} onToggle={setCat} />
      <FlatList
        horizontal
        data={owned}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
        ListEmptyComponent={<Text style={[ui.muted, { padding: 12 }]}>No {cat.toLowerCase()} yet.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => toggleItem(item.id)}>
            <ItemThumb item={item} size={76} badge={itemIds.includes(item.id) ? '✓' : undefined} />
          </Pressable>
        )}
      />

      <Text style={ui.label}>How did it feel?</Text>
      <ChipRow
        options={RATINGS.map((r) => RATING_LABEL[r])}
        selected={rating ? [RATING_LABEL[rating]] : []}
        onToggle={(label) => {
          const r = RATINGS.find((x) => RATING_LABEL[x] === label);
          setRating((cur) => (cur === r ? undefined : r));
        }}
        scroll={false}
      />
      <Text style={ui.muted}>Ratings teach Wearday your style, so suggestions get more like the outfits you love.</Text>

      <Text style={ui.label}>Mood</Text>
      <ChipRow
        options={MOODS.map(moodChip)}
        selected={mood ? [moodChip(moodByLabel(mood) ?? MOODS[0])] : []}
        onToggle={(chip) => {
          const m = moodFromChip(chip)?.label;
          setMood((cur) => (cur === m ? undefined : m));
        }}
        scroll={false}
      />

      <Text style={ui.label}>Note</Text>
      <TextInput style={ui.input} value={note} onChangeText={setNote} placeholder="Where did you go? How did it feel?" />

      <Button title="Save" onPress={save} style={{ marginTop: 24 }} />
      {existing ? (
        <Button
          title="Delete entry"
          variant="danger"
          style={{ marginTop: 10 }}
          onPress={() =>
            confirm('Delete this day’s entry?', () => {
              deleteLog(existing.id);
              router.back();
            })
          }
        />
      ) : null}
    </ScrollView>
  );
}
