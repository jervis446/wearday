import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { Button, ChipRow, Empty, ItemThumb } from '../../components/ui';
import { useStore, useWearCounts } from '../../lib/store';
import { useTheme } from '../../lib/theme';
import { archived, CATEGORIES, inCloset } from '../../lib/types';

const COLS = 3;

export default function Wardrobe() {
  const { colors, ui } = useTheme();
  const { items, saveItem } = useStore();
  const wears = useWearCounts();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  const [view, setView] = useState<'Closet' | 'Wishlist' | 'Archived'>('Closet');
  const [sort, setSort] = useState<'Newest' | 'Most worn' | 'Least worn'>('Newest');

  const size = Math.floor((Math.min(width, 700) - 16 * 2 - 10 * (COLS - 1)) / COLS);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter(
      (i) =>
        (view === 'Closet' ? inCloset(i) : view === 'Wishlist' ? i.wishlist : archived(i)) &&
        (cats.length === 0 || cats.includes(i.category)) &&
        (!q ||
          [i.name, i.brand, i.color, i.category, ...i.tags].some((f) => f?.toLowerCase().includes(q))),
    );
    if (sort === 'Most worn') list.sort((a, b) => (wears[b.id] ?? 0) - (wears[a.id] ?? 0));
    else if (sort === 'Least worn') list.sort((a, b) => (wears[a.id] ?? 0) - (wears[b.id] ?? 0));
    else list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [items, query, cats, view, sort, wears]);
  const inLaundry = items.filter((i) => inCloset(i) && i.status === 'laundry');

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
            <ChipRow options={['Closet', 'Wishlist', 'Archived']} selected={[view]} onToggle={(v) => setView(v as typeof view)} />
            {view === 'Closet' && inLaundry.length ? (
              <View style={[ui.card, ui.row, { padding: 10, gap: 10, backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }]}>
                <Text style={[ui.body, { flex: 1 }]}>
                  🧺 {inLaundry.length} item{inLaundry.length === 1 ? '' : 's'} in the laundry
                </Text>
                <Pressable onPress={() => inLaundry.forEach((i) => saveItem({ ...i, status: undefined }))} hitSlop={8}>
                  <Text style={[ui.body, { color: colors.accent, fontWeight: '600' }]}>Mark all clean</Text>
                </Pressable>
              </View>
            ) : null}
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
            title={view === 'Wishlist' ? 'Wishlist is empty' : view === 'Archived' ? 'Nothing archived' : 'Your closet is empty'}
            hint={
              view === 'Archived'
                ? 'Items you mark as sold or donated move here, with their history kept.'
                : 'Photograph a piece of clothing on a plain background to add it.'
            }
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
