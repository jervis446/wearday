import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { Button, ChipRow, Empty, ItemThumb } from '../../components/ui';
import { useStore, useWearCounts } from '../../lib/store';
import { useTheme } from '../../lib/theme';
import { CATEGORIES } from '../../lib/types';

const COLS = 3;

export default function Wardrobe() {
  const { ui } = useTheme();
  const { items } = useStore();
  const wears = useWearCounts();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  const [view, setView] = useState<'Closet' | 'Wishlist'>('Closet');
  const [sort, setSort] = useState<'Newest' | 'Most worn' | 'Least worn'>('Newest');

  const size = Math.floor((Math.min(width, 700) - 16 * 2 - 10 * (COLS - 1)) / COLS);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter(
      (i) =>
        i.wishlist === (view === 'Wishlist') &&
        (cats.length === 0 || cats.includes(i.category)) &&
        (!q ||
          [i.name, i.brand, i.color, i.category, ...i.tags].some((f) => f?.toLowerCase().includes(q))),
    );
    if (sort === 'Most worn') list.sort((a, b) => (wears[b.id] ?? 0) - (wears[a.id] ?? 0));
    else if (sort === 'Least worn') list.sort((a, b) => (wears[a.id] ?? 0) - (wears[b.id] ?? 0));
    else list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [items, query, cats, view, sort, wears]);

  return (
    <View style={ui.screen}>
      <FlatList
        data={shown}
        key={COLS}
        numColumns={COLS}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, gap: 10, maxWidth: 700, width: '100%', alignSelf: 'center' }}
        columnWrapperStyle={{ gap: 10 }}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 6 }}>
            <View style={[ui.row, { gap: 10 }]}>
              <TextInput
                placeholder="Search name, brand, color, tag"
                value={query}
                onChangeText={setQuery}
                style={[ui.input, { flex: 1 }]}
              />
              <Button title="+ Add" onPress={() => router.push({ pathname: '/item/edit', params: { wishlist: view === 'Wishlist' ? '1' : '' } })} />
            </View>
            <ChipRow options={['Closet', 'Wishlist']} selected={[view]} onToggle={(v) => setView(v as typeof view)} />
            <ChipRow
              options={CATEGORIES}
              selected={cats}
              onToggle={(c) => setCats((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))}
            />
            <View style={[ui.row, { justifyContent: 'space-between' }]}>
              <Text style={ui.muted}>
                {shown.length} item{shown.length === 1 ? '' : 's'}
              </Text>
              <Pressable
                onPress={() => setSort((s) => (s === 'Newest' ? 'Most worn' : s === 'Most worn' ? 'Least worn' : 'Newest'))}
              >
                <Text style={ui.muted}>Sort: {sort} ⇅</Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Empty
            title={view === 'Wishlist' ? 'Wishlist is empty' : 'Your closet is empty'}
            hint="Photograph a piece of clothing on a plain background to add it."
          />
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/item/${item.id}`)} style={{ width: size }}>
            <ItemThumb item={item} size={size} badge={wears[item.id] ? `${wears[item.id]}×` : undefined} />
            <Text numberOfLines={1} style={[ui.muted, { marginTop: 4 }]}>
              {item.brand ? `${item.brand} · ` : ''}
              {item.name}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}
