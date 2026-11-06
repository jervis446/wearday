import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ItemThumb } from '../../components/ui';
import { useStore, useWearCounts } from '../../lib/store';
import { colors, ui } from '../../lib/theme';
import { CATEGORIES, Item, todayKey } from '../../lib/types';

export default function Stats() {
  const { items, outfits, logs } = useStore();
  const wears = useWearCounts();

  const s = useMemo(() => {
    const owned = items.filter((i) => !i.wishlist);
    const value = owned.reduce((sum, i) => sum + (i.price ?? 0), 0);
    const worn = owned.filter((i) => wears[i.id]);
    const byWear = [...owned].sort((a, b) => (wears[b.id] ?? 0) - (wears[a.id] ?? 0));
    const priced = owned.filter((i) => i.price != null && wears[i.id]);
    const cpw = (i: Item) => (i.price ?? 0) / (wears[i.id] || 1);
    const bestValue = [...priced].sort((a, b) => cpw(a) - cpw(b));
    const perCat = CATEGORIES.map((c) => ({ c, n: owned.filter((i) => i.category === c).length })).filter((x) => x.n);
    return {
      owned,
      value,
      utilisation: owned.length ? Math.round((worn.length / owned.length) * 100) : 0,
      mostWorn: byWear.filter((i) => wears[i.id]).slice(0, 6),
      neverWorn: owned.filter((i) => !wears[i.id]),
      bestValue: bestValue.slice(0, 6),
      cpw,
      perCat,
      logged30: logs.filter((l) => l.date >= thirtyDaysAgo()).length,
    };
  }, [items, logs, wears]);

  const max = Math.max(1, ...s.perCat.map((x) => x.n));

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { gap: 12, maxWidth: 700, width: '100%', alignSelf: 'center' }]}>
      <View style={[ui.row, { gap: 10 }]}>
        <Tile label="Items" value={String(s.owned.length)} />
        <Tile label="Outfits" value={String(outfits.length)} />
        <Tile label="Closet value" value={s.value.toFixed(0)} />
      </View>
      <View style={[ui.row, { gap: 10 }]}>
        <Tile label="Items worn" value={`${s.utilisation}%`} />
        <Tile label="Logged (30d)" value={String(s.logged30)} />
        <Tile label="Never worn" value={String(s.neverWorn.length)} />
      </View>

      <Section title="By category">
        {s.perCat.map(({ c, n }) => (
          <View key={c} style={[ui.row, { gap: 10, marginBottom: 6 }]}>
            <Text style={[ui.body, { width: 92 }]}>{c}</Text>
            <View style={{ flex: 1, height: 10, backgroundColor: colors.chip, borderRadius: 5 }}>
              <View style={{ width: `${(n / max) * 100}%`, height: 10, backgroundColor: colors.accent, borderRadius: 5 }} />
            </View>
            <Text style={[ui.muted, { width: 28, textAlign: 'right' }]}>{n}</Text>
          </View>
        ))}
        {!s.perCat.length ? <Text style={ui.muted}>Add items to see a breakdown.</Text> : null}
      </Section>

      <Strip title="Most worn" items={s.mostWorn} label={(i) => `${wears[i.id]}×`} />
      <Strip title="Best cost per wear" items={s.bestValue} label={(i) => s.cpw(i).toFixed(2)} />
      <Strip title="Never worn — wear or donate?" items={s.neverWorn.slice(0, 12)} />
    </ScrollView>
  );
}

function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return todayKey(d);
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={[ui.card, { flex: 1, padding: 12 }]}>
      <Text style={ui.h2}>{value}</Text>
      <Text style={ui.muted}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={[ui.card, { padding: 14 }]}>
      <Text style={[ui.h2, { marginBottom: 10 }]}>{title}</Text>
      {children}
    </View>
  );
}

function Strip({ title, items, label }: { title: string; items: Item[]; label?: (i: Item) => string }) {
  return (
    <Section title={title}>
      {items.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {items.map((i) => (
            <Pressable key={i.id} onPress={() => router.push(`/item/${i.id}`)}>
              <ItemThumb item={i} size={76} badge={label?.(i)} />
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Text style={ui.muted}>Nothing here yet — log some outfits.</Text>
      )}
    </Section>
  );
}
