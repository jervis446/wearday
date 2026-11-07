import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { OutfitCanvas } from '../../components/OutfitCanvas';
import { Button, ChipRow, confirm, Empty } from '../../components/ui';
import { canAddCollection } from '../../lib/plans';
import { usePremium } from '../../lib/premium';
import { useStore } from '../../lib/store';
import { useTheme } from '../../lib/theme';
import { openPaywall } from '../../lib/usePaywall';

const ALL = 'All outfits';
const NEW = '+ New collection';

export default function Outfits() {
  const { colors, ui } = useTheme();
  const { outfits, items, logs, collections, saveCollection, deleteCollection } = useStore();
  const { width } = useWindowDimensions();
  const { isPremium } = usePremium();
  const size = Math.floor((Math.min(width, 700) - 16 * 2 - 12) / 2);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<{ mode: 'new' | 'rename'; text: string } | null>(null);

  const selected = collections.find((c) => c.id === selectedId);
  const shown = selected ? outfits.filter((o) => selected.outfitIds.includes(o.id)) : outfits;
  const timesWorn = (id: string) => logs.filter((l) => l.outfitId === id).length;
  const byName = [...collections].sort((a, b) => a.name.localeCompare(b.name));

  const submitName = () => {
    const name = nameDraft?.text.trim();
    const renaming = nameDraft?.mode === 'rename' ? selected?.id : undefined;
    const clash = collections.find((c) => c.name.toLowerCase() === name?.toLowerCase() && c.id !== renaming);
    if (name && clash) {
      // Names must be unique; jump to the existing one instead.
      setSelectedId(clash.id);
    } else if (name) {
      if (nameDraft!.mode === 'rename' && selected) saveCollection({ ...selected, name });
      else setSelectedId(saveCollection({ name, outfitIds: [] }).id);
    }
    setNameDraft(null);
  };

  return (
    <View style={ui.screen}>
      <FlatList
        data={shown}
        numColumns={2}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 700, width: '100%', alignSelf: 'center' }}
        columnWrapperStyle={{ gap: 12 }}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="✨ Suggest" onPress={() => router.push('/suggest')} style={{ flex: 1 }} />
              <Button title="+ Create" variant="secondary" onPress={() => router.push('/outfit/new')} style={{ flex: 1 }} />
            </View>
            <ChipRow
              options={[ALL, ...byName.map((c) => c.name), NEW]}
              selected={[selected?.name ?? ALL]}
              onToggle={(label) => {
                if (label === NEW) {
                  if (!canAddCollection(isPremium, collections.length)) return openPaywall('collections');
                  return setNameDraft({ mode: 'new', text: '' });
                }
                setNameDraft(null);
                setSelectedId(label === ALL ? null : (byName.find((c) => c.name === label)?.id ?? null));
              }}
            />
            {nameDraft ? (
              <View style={[ui.row, { gap: 8 }]}>
                <TextInput
                  autoFocus
                  style={[ui.input, { flex: 1 }]}
                  value={nameDraft.text}
                  onChangeText={(text) => setNameDraft({ ...nameDraft, text })}
                  onSubmitEditing={submitName}
                  placeholder="Collection name, e.g. Office"
                  placeholderTextColor={colors.muted}
                />
                <Button title="Save" onPress={submitName} />
              </View>
            ) : selected ? (
              <View style={[ui.row, { gap: 16 }]}>
                <Text style={[ui.muted, { flex: 1 }]}>
                  {selected.outfitIds.length} outfit{selected.outfitIds.length === 1 ? '' : 's'} · add more from an outfit’s page
                </Text>
                <Pressable onPress={() => setNameDraft({ mode: 'rename', text: selected.name })} hitSlop={8}>
                  <Text style={[ui.body, { color: colors.accent }]}>Rename</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    confirm(`Delete the “${selected.name}” collection? The outfits themselves are kept.`, () => {
                      deleteCollection(selected.id);
                      setSelectedId(null);
                    })
                  }
                  hitSlop={8}
                >
                  <Text style={[ui.body, { color: colors.danger }]}>Delete</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          selected ? (
            <Empty title="This collection is empty" hint="Open an outfit and tap this collection’s name to add it." />
          ) : (
            <Empty title="No outfits yet" hint="Combine pieces from your wardrobe on a canvas, or tap Suggest for an idea." />
          )
        }
        renderItem={({ item: o }) => (
          <Pressable onPress={() => router.push(`/outfit/${o.id}`)} style={{ width: size }}>
            <View pointerEvents="none">
              <OutfitCanvas pieces={o.pieces} items={items} size={size} />
            </View>
            <Text numberOfLines={1} style={[ui.body, { marginTop: 6, fontWeight: '600' }]}>
              {o.name}
            </Text>
            <Text style={ui.muted}>
              {o.pieces.length} pieces · worn {timesWorn(o.id)}×
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}
