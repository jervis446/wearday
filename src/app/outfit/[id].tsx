import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { OutfitCanvas } from '../../components/OutfitCanvas';
import { Button, ChipRow, HeaderButton, ItemThumb, confirm } from '../../components/ui';
import { SLOT } from '../../lib/outfitLayout';
import { useStore } from '../../lib/store';
import { useTheme } from '../../lib/theme';
import { CATEGORIES, OutfitPiece, inCloset } from '../../lib/types';

export default function OutfitBuilder() {
  const { colors, ui } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, outfits, saveOutfit, deleteOutfit, collections, saveCollection } = useStore();
  const existing = outfits.find((o) => o.id === id);
  const { width } = useWindowDimensions();
  const canvas = Math.min(width - 32, 520);

  const [name, setName] = useState(existing?.name ?? '');
  const [tags, setTags] = useState(existing?.tags.join(', ') ?? '');
  const [inCollections, setInCollections] = useState<string[]>(
    existing ? collections.filter((c) => c.outfitIds.includes(existing.id)).map((c) => c.id) : [],
  );
  const [pieces, setPieces] = useState<OutfitPiece[]>(existing?.pieces ?? []);
  const [selected, setSelected] = useState<number | null>(null);
  const [cat, setCat] = useState<string>('Tops');

  const owned = items.filter((i) => inCloset(i) && i.category === cat);

  const add = (itemId: string) => {
    const item = items.find((i) => i.id === itemId)!;
    const slot = SLOT[item.category] ?? SLOT.Other;
    setPieces((p) => [...p, { itemId, ...slot, scale: 1 }]);
    setSelected(pieces.length);
  };

  const update = (fn: (p: OutfitPiece) => OutfitPiece) =>
    selected != null && setPieces((ps) => ps.map((p, i) => (i === selected ? fn(p) : p)));

  const save = () => {
    const saved = saveOutfit({
      id: existing?.id,
      name: name.trim() || `Outfit ${outfits.length + 1}`,
      pieces,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
    for (const c of collections) {
      const want = inCollections.includes(c.id);
      const has = c.outfitIds.includes(saved.id);
      if (want && !has) saveCollection({ ...c, outfitIds: [...c.outfitIds, saved.id] });
      if (!want && has) saveCollection({ ...c, outfitIds: c.outfitIds.filter((x) => x !== saved.id) });
    }
    router.back();
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { gap: 12, alignItems: 'center' }]} scrollEnabled={selected == null}>
      <Stack.Screen
        options={{
          title: existing ? 'Edit outfit' : 'New outfit',
          headerRight: existing
            ? () => <HeaderButton title="Share" onPress={() => router.push({ pathname: '/outfit/share', params: { id: existing.id } })} />
            : undefined,
        }}
      />
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
        {collections.length ? (
          <>
            <Text style={ui.label}>Collections</Text>
            <ChipRow
              options={collections.map((c) => c.name)}
              selected={collections.filter((c) => inCollections.includes(c.id)).map((c) => c.name)}
              onToggle={(name) => {
                const cid = collections.find((c) => c.name === name)!.id;
                setInCollections((cur) => (cur.includes(cid) ? cur.filter((x) => x !== cid) : [...cur, cid]));
              }}
              scroll={false}
            />
          </>
        ) : null}

        <Button title="Save outfit" onPress={save} style={{ marginTop: 20, backgroundColor: pieces.length ? colors.accent : colors.chip }} />
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
