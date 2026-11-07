import { router } from 'expo-router';
import { FlatList, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { OutfitCanvas } from '../../components/OutfitCanvas';
import { Button, Empty } from '../../components/ui';
import { useStore } from '../../lib/store';
import { useTheme } from '../../lib/theme';

export default function Outfits() {
  const { ui } = useTheme();
  const { outfits, items, logs } = useStore();
  const { width } = useWindowDimensions();
  const size = Math.floor((Math.min(width, 700) - 16 * 2 - 12) / 2);

  const timesWorn = (id: string) => logs.filter((l) => l.outfitId === id).length;

  return (
    <View style={ui.screen}>
      <FlatList
        data={outfits}
        numColumns={2}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 700, width: '100%', alignSelf: 'center' }}
        columnWrapperStyle={{ gap: 12 }}
        ListHeaderComponent={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="✨ Suggest" onPress={() => router.push('/suggest')} style={{ flex: 1 }} />
            <Button title="+ Create" variant="secondary" onPress={() => router.push('/outfit/new')} style={{ flex: 1 }} />
          </View>
        }
        ListEmptyComponent={
          <Empty title="No outfits yet" hint="Combine pieces from your wardrobe on a canvas, or tap Suggest for an idea." />
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
