import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { Bouncy, Button, ChipRow, Empty, ItemThumb } from '../../components/ui';
import { useStore, useWearCounts } from '../../lib/store';
import { font, TAB_BAR_SPACE, useTheme } from '../../lib/theme';
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

  const size = Math.floor((Math.min(width, 700) - 20 * 2 - 10 * (COLS - 1)) / COLS);

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
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: TAB_BAR_SPACE, gap: 10, maxWidth: 700, width: '100%', alignSelf: 'center' }}
        columnWrapperStyle={{ gap: 10 }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 6 }}>
            <Bouncy onPress={() => router.push('/suggest')}>
              <LinearGradient colors={colors.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 26, padding: 18, gap: 4 }}>
                <View style={[ui.row, { justifyContent: 'space-between' }]}>
                  <Text style={{ fontFamily: font.display, fontSize: 22, color: '#FFFFFF', letterSpacing: -0.6 }}>what should I wear?</Text>
                  <View style={{ backgroundColor: colors.lime, borderRadius: 999, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="arrow-forward" size={18} color={colors.onLime} />
                  </View>
                </View>
                <Text style={{ fontFamily: font.body, fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>
                  {items.length ? `Get a fit from your ${items.length} pieces, styled for today’s weather ✨` : 'Add a few pieces and get outfit ideas for today ✨'}
                </Text>
              </LinearGradient>
            </Bouncy>
            <View style={[ui.row, { gap: 10 }]}>
              <View style={[ui.input, ui.row, { flex: 1, paddingVertical: 0, gap: 8 }]}>
                <Ionicons name="search" size={18} color={colors.muted} />
                <TextInput
                  placeholder="Search your closet"
                  placeholderTextColor={colors.muted}
                  value={query}
                  onChangeText={setQuery}
                  style={{ flex: 1, paddingVertical: 13, fontFamily: font.body, fontSize: 15, color: colors.text }}
                />
              </View>
              <Button
                title="Add"
                icon={<Ionicons name="add" size={20} color="#FFFFFF" />}
                onPress={() => router.push({ pathname: '/item/edit', params: { wishlist: view === 'Wishlist' ? '1' : '' } })}
              />
            </View>
            <ChipRow options={['Closet', 'Wishlist', 'Archived']} selected={[view]} onToggle={(v) => setView(v as typeof view)} />
            {view === 'Closet' && inLaundry.length ? (
              <View style={[ui.card, ui.row, { padding: 14, gap: 10 }]}>
                <Text style={[ui.body, { flex: 1 }]}>
                  🧺 {inLaundry.length} item{inLaundry.length === 1 ? '' : 's'} in the laundry
                </Text>
                <Pressable onPress={() => inLaundry.forEach((i) => saveItem({ ...i, status: undefined }))} hitSlop={8}>
                  <Text style={[ui.body, { color: colors.accent, fontFamily: font.bodyBold }]}>Mark all clean</Text>
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
                <Text style={[ui.muted, { color: colors.text }]}>{sort} ⇅</Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Empty
            emoji={view === 'Wishlist' ? '🛍️' : view === 'Archived' ? '📦' : '👕'}
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
            <Text numberOfLines={1} style={[ui.muted, { marginTop: 6, fontSize: 12 }]}>
              {item.brand ? `${item.brand} · ` : ''}
              {item.name}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}
