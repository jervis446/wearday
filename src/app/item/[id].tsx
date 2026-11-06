import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Image, ScrollView, Text, View } from 'react-native';

import { Button, confirm, Empty } from '../../components/ui';
import { useStore, useWearCounts } from '../../lib/store';
import { ui } from '../../lib/theme';

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, outfits, logs, itemsOfLog, deleteItem, saveItem } = useStore();
  const wears = useWearCounts();
  const item = items.find((i) => i.id === id);
  if (!item) return <Empty title="Item not found" />;

  const count = wears[item.id] ?? 0;
  const cpw = item.price != null ? item.price / Math.max(count, 1) : undefined;
  const lastWorn = logs
    .filter((l) => itemsOfLog(l).includes(item.id))
    .map((l) => l.date)
    .sort()
    .pop();
  const inOutfits = outfits.filter((o) => o.pieces.some((p) => p.itemId === item.id)).length;

  const fields: [string, string | undefined][] = [
    ['Category', item.category],
    ['Brand', item.brand],
    ['Color', item.color],
    ['Size', item.size],
    ['Price', item.price != null ? item.price.toFixed(2) : undefined],
    ['Seasons', item.seasons.join(', ') || undefined],
    ['Tags', item.tags.join(', ') || undefined],
    ['Notes', item.notes],
  ];

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { gap: 12, maxWidth: 600, width: '100%', alignSelf: 'center' }]}>
      <Stack.Screen options={{ title: item.name }} />
      <View style={[ui.card, { aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }]}>
        <Image source={{ uri: item.imageUri }} style={{ width: '90%', height: '90%' }} resizeMode="contain" />
      </View>

      <View style={[ui.row, { gap: 10 }]}>
        <Stat label="Worn" value={`${count}×`} />
        <Stat label="Cost / wear" value={cpw != null ? cpw.toFixed(2) : '—'} />
        <Stat label="In outfits" value={String(inOutfits)} />
      </View>
      <Text style={ui.muted}>{lastWorn ? `Last worn ${lastWorn}` : 'Not worn yet'}</Text>

      <View style={[ui.card, { padding: 14, gap: 8 }]}>
        {fields
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <View key={k} style={[ui.row, { justifyContent: 'space-between', gap: 12 }]}>
              <Text style={ui.muted}>{k}</Text>
              <Text style={[ui.body, { flexShrink: 1, textAlign: 'right' }]}>{v}</Text>
            </View>
          ))}
      </View>

      {item.wishlist ? (
        <Button title="I bought it — move to closet" onPress={() => saveItem({ ...item, wishlist: false })} />
      ) : (
        <Button title="Wear today" onPress={() => router.push({ pathname: '/log', params: { itemId: item.id } })} />
      )}
      <Button title="Edit" variant="secondary" onPress={() => router.push({ pathname: '/item/edit', params: { id: item.id } })} />
      <Button
        title="Delete"
        variant="danger"
        onPress={() =>
          confirm('Delete this item?', () => {
            deleteItem(item.id);
            router.back();
          })
        }
      />
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={[ui.card, { flex: 1, padding: 12, alignItems: 'center' }]}>
      <Text style={ui.h2}>{value}</Text>
      <Text style={ui.muted}>{label}</Text>
    </View>
  );
}
