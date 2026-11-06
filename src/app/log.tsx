import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { OutfitCanvas } from '../components/OutfitCanvas';
import { Button, ChipRow, confirm, ItemThumb } from '../components/ui';
import { chooseImage } from '../lib/images';
import { useStore } from '../lib/store';
import { colors, ui } from '../lib/theme';
import { CATEGORIES, todayKey } from '../lib/types';

/** Log what was worn on a day: a saved outfit and/or individual items, plus an outfit selfie. */
export default function LogOutfit() {
  const params = useLocalSearchParams<{ date?: string; itemId?: string; logId?: string }>();
  const { items, outfits, logs, saveLog, deleteLog } = useStore();
  const existing = params.logId
    ? logs.find((l) => l.id === params.logId)
    : logs.find((l) => l.date === (params.date ?? todayKey()));

  const [date] = useState(existing?.date ?? params.date ?? todayKey());
  const [outfitId, setOutfitId] = useState(existing?.outfitId);
  const [itemIds, setItemIds] = useState<string[]>(
    existing?.itemIds ?? (params.itemId ? [params.itemId] : []),
  );
  const [selfieUri, setSelfieUri] = useState(existing?.selfieUri);
  const [note, setNote] = useState(existing?.note ?? '');
  const [cat, setCat] = useState('Tops');

  const toggleItem = (id: string) =>
    setItemIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const save = () => {
    saveLog({ id: existing?.id, date, outfitId, itemIds, selfieUri, note: note.trim() || undefined });
    router.back();
  };

  const owned = items.filter((i) => !i.wishlist && i.category === cat);

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { paddingBottom: 60, maxWidth: 600, width: '100%', alignSelf: 'center' }]}>
      <Stack.Screen options={{ title: `Outfit for ${date}` }} />

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
