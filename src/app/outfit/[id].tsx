import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { OutfitCanvas } from '../../components/OutfitCanvas';
import { Button, ChipRow, confirm, ItemThumb } from '../../components/ui';
import { useStore } from '../../lib/store';
import { colors, ui } from '../../lib/theme';
import { CATEGORIES, OutfitPiece } from '../../lib/types';

/** Default spot on the canvas for each category, so new pieces land roughly where they'd be worn. */
const SLOT: Record<string, { x: number; y: number }> = {
  Tops: { x: 0.35, y: 0.28 },
  Outerwear: { x: 0.68, y: 0.28 },
  Dresses: { x: 0.4, y: 0.4 },
  Bottoms: { x: 0.35, y: 0.66 },
  Shoes: { x: 0.68, y: 0.8 },
  Bags: { x: 0.75, y: 0.58 },
  Accessories: { x: 0.8, y: 0.12 },
  Other: { x: 0.5, y: 0.5 },
};

export default function OutfitBuilder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, outfits, saveOutfit, deleteOutfit } = useStore();
  const existing = outfits.find((o) => o.id === id);
  const { width } = useWindowDimensions();
  const canvas = Math.min(width - 32, 520);

  const [name, setName] = useState(existing?.name ?? '');
  const [tags, setTags] = useState(existing?.tags.join(', ') ?? '');
  const [pieces, setPieces] = useState<OutfitPiece[]>(existing?.pieces ?? []);
  const [selected, setSelected] = useState<number | null>(null);
  const [cat, setCat] = useState<string>('Tops');

  const owned = items.filter((i) => !i.wishlist && i.category === cat);

  const add = (itemId: string) => {
    const item = items.find((i) => i.id === itemId)!;
    const slot = SLOT[item.category] ?? SLOT.Other;
    setPieces((p) => [...p, { itemId, ...slot, scale: 1 }]);
    setSelected(pieces.length);
  };

  const update = (fn: (p: OutfitPiece) => OutfitPiece) =>
    selected != null && setPieces((ps) => ps.map((p, i) => (i === selected ? fn(p) : p)));

  const save = () => {
    saveOutfit({
      id: existing?.id,
      name: name.trim() || `Outfit ${outfits.length + 1}`,
      pieces,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
    router.back();
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { gap: 12, alignItems: 'center' }]} scrollEnabled={selected == null}>
      <Stack.Screen options={{ title: existing ? 'Edit outfit' : 'New outfit' }} />
      <OutfitCanvas
        pieces={pieces}
        items={items}
        size={canvas}
        onChange={setPieces}
        selected={selected}
        onSelect={setSelected}
      />

      {selected != null ? (
        <View style={[ui.row, { gap: 8, flexWrap: 'wrap', justifyContent: 'center' }]}>
          <Button title="−" variant="secondary" onPress={() => update((p) => ({ ...p, scale: Math.max(0.3, p.scale - 0.15) }))} />
          <Button title="+" variant="secondary" onPress={() => update((p) => ({ ...p, scale: Math.min(2.5, p.scale + 0.15) }))} />
          <Button
            title="To front"
            variant="secondary"
            onPress={() => {
              setPieces((ps) => [...ps.filter((_, i) => i !== selected), ps[selected]]);
              setSelected(pieces.length - 1);
            }}
          />
          <Button
            title="Remove"
            variant="danger"
            onPress={() => {
              setPieces((ps) => ps.filter((_, i) => i !== selected));
              setSelected(null);
            }}
          />
          <Button title="Done" variant="secondary" onPress={() => setSelected(null)} />
        </View>
      ) : (
        <Text style={ui.muted}>Tap clothes below to add · drag to arrange · tap a piece to resize</Text>
      )}

      <View style={{ width: canvas }}>
        <ChipRow options={CATEGORIES} selected={[cat]} onToggle={setCat} />
        <FlatList
          horizontal
          data={owned}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
          ListEmptyComponent={<Text style={[ui.muted, { padding: 12 }]}>No {cat.toLowerCase()} in your closet yet.</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => add(item.id)}>
              <ItemThumb item={item} size={76} />
            </Pressable>
          )}
        />

        <Text style={ui.label}>Name</Text>
        <TextInput style={ui.input} value={name} onChangeText={setName} placeholder="e.g. Office Monday" />
        <Text style={ui.label}>Tags</Text>
        <TextInput style={ui.input} value={tags} onChangeText={setTags} placeholder="work, summer, date night" />

        <Button title="Save outfit" onPress={save} style={{ marginTop: 20, backgroundColor: pieces.length ? colors.accent : colors.muted }} />
        {existing ? (
          <Button
            title="Delete outfit"
            variant="danger"
            style={{ marginTop: 10 }}
            onPress={() =>
              confirm('Delete this outfit?', () => {
                deleteOutfit(existing.id);
                router.back();
              })
            }
          />
        ) : null}
      </View>
    </ScrollView>
  );
}
