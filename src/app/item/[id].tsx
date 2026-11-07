import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Image, ScrollView, Text, TextInput, View } from 'react-native';

import { Button, ChipRow, confirm, Empty } from '../../components/ui';
import { useStore, useWearCounts } from '../../lib/store';
import { useTheme } from '../../lib/theme';
import { STATUS_LABEL, STATUSES } from '../../lib/types';

export default function ItemDetail() {
  const { colors, ui } = useTheme();
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
      <View style={[ui.card, { aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.photo }]}>
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

      {!item.wishlist ? (
        <View style={[ui.card, { padding: 14, gap: 10 }]}>
          <Text style={ui.h2}>Status</Text>
          <ChipRow
            options={STATUSES.map((s) => STATUS_LABEL[s])}
            selected={[STATUS_LABEL[item.status ?? 'available']]}
            onToggle={(label) => {
              const status = STATUSES.find((s) => STATUS_LABEL[s] === label)!;
              saveItem({
                ...item,
                status: status === 'available' ? undefined : status,
                lentTo: status === 'lent' ? item.lentTo : undefined,
              });
            }}
            scroll={false}
          />
          {item.status === 'lent' ? (
            <TextInput
              style={ui.input}
              placeholder="Lent to (name)"
              placeholderTextColor={colors.muted}
              value={item.lentTo ?? ''}
              onChangeText={(lentTo) => saveItem({ ...item, lentTo })}
            />
          ) : null}
          {item.status === 'sold' || item.status === 'donated' ? (
            <Text style={ui.muted}>Archived: hidden from your closet, stats and suggestions. Wear history is kept.</Text>
          ) : item.status === 'laundry' || item.status === 'lent' ? (
            <Text style={ui.muted}>Skipped by outfit suggestions until it’s available again.</Text>
          ) : null}
        </View>
      ) : null}

      {item.wishlist ? (
        <Button title="I bought it — move to closet" onPress={() => saveItem({ ...item, wishlist: false })} />
      ) : !item.status || item.status === 'available' ? (
        <Button title="Wear today" onPress={() => router.push({ pathname: '/log', params: { itemId: item.id } })} />
      ) : null}
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
  const { ui } = useTheme();
  return (
    <View style={[ui.card, { flex: 1, padding: 12, alignItems: 'center' }]}>
      <Text style={ui.h2}>{value}</Text>
      <Text style={ui.muted}>{label}</Text>
    </View>
  );
}
