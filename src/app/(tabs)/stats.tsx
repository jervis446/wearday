import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ItemThumb } from '../../components/ui';
import { colorBreakdown, declutterCandidates, logStreak, monthlySpend } from '../../lib/insights';
import { formatDay } from '../../lib/packing';
import { useMoney } from '../../lib/settings';
import { useStore, useWearCounts } from '../../lib/store';
import { useTheme } from '../../lib/theme';
import { CATEGORIES, inCloset, Item, todayKey } from '../../lib/types';

export default function Stats() {
  const { colors, ui } = useTheme();
  const { items, outfits, logs, itemsOfLog } = useStore();
  const wears = useWearCounts();
  const money = useMoney();

  const s = useMemo(() => {
    const owned = items.filter(inCloset);
    const value = owned.reduce((sum, i) => sum + (i.price ?? 0), 0);
    const worn = owned.filter((i) => wears[i.id]);
    const byWear = [...owned].sort((a, b) => (wears[b.id] ?? 0) - (wears[a.id] ?? 0));
    const priced = owned.filter((i) => i.price != null && wears[i.id]);
    const cpw = (i: Item) => (i.price ?? 0) / (wears[i.id] || 1);
    const bestValue = [...priced].sort((a, b) => cpw(a) - cpw(b));
    const perCat = CATEGORIES.map((c) => ({ c, n: owned.filter((i) => i.category === c).length })).filter((x) => x.n);
    const lastWorn: Record<string, string> = {};
    for (const l of logs) for (const id of itemsOfLog(l)) if (!lastWorn[id] || l.date > lastWorn[id]) lastWorn[id] = l.date;
    const today = todayKey();
    return {
      colors: colorBreakdown(owned),
      months: monthlySpend(owned, new Date()),
      declutter: declutterCandidates(owned, lastWorn, today, nowMs()),
      streak: logStreak(new Set(logs.map((l) => l.date)), today),
      owned,
      value,
      utilisation: owned.length ? Math.round((worn.length / owned.length) * 100) : 0,
      mostWorn: byWear.filter((i) => wears[i.id]).slice(0, 6),
      neverWorn: owned.filter((i) => !wears[i.id]),
      bestValue: bestValue.slice(0, 6),
      cpw,
      perCat,
    };
  }, [items, logs, wears, itemsOfLog]);

  const max = Math.max(1, ...s.perCat.map((x) => x.n));
  const maxColor = Math.max(1, ...s.colors.map((x) => x.count));

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { gap: 12, maxWidth: 700, width: '100%', alignSelf: 'center' }]}>
      <View style={[ui.row, { gap: 10 }]}>
        <Tile label="Items" value={String(s.owned.length)} />
        <Tile label="Outfits" value={String(outfits.length)} />
        <Tile label="Closet value" value={money.format(s.value, true)} />
      </View>
      <View style={[ui.row, { gap: 10 }]}>
        <Tile label="Items worn" value={`${s.utilisation}%`} />
        <Tile label="Day streak" value={s.streak ? `${s.streak} 🔥` : '0'} />
        <Tile label="Never worn" value={String(s.neverWorn.length)} />
      </View>

      <Section title="By category">
        {s.perCat.map(({ c, n }) => (
          <HBar key={c} label={c} value={n} max={max} />
        ))}
        {!s.perCat.length ? <Text style={ui.muted}>Add items to see a breakdown.</Text> : null}
      </Section>

      <Section title="By colour">
        {s.colors.slice(0, 8).map((r) => (
          <HBar key={r.name} label={r.name} value={r.count} max={maxColor} swatch={r.swatch ?? null} />
        ))}
        {s.colors.length > 8 ? <Text style={ui.muted}>+ {s.colors.length - 8} more colours</Text> : null}
        {!s.colors.length ? <Text style={ui.muted}>Add items to see your colours.</Text> : null}
      </Section>

      <MonthlySpend months={s.months} format={money.format} />

      <Section title="Declutter">
        {s.declutter.length ? (
          <View style={{ gap: 10 }}>
            <Text style={ui.muted}>
              {s.declutter.length} item{s.declutter.length === 1 ? '' : 's'} not worn in 6 months or more. Wear, sell or donate?
            </Text>
            {s.declutter.slice(0, 8).map(({ item, lastWorn }) => (
              <Pressable key={item.id} onPress={() => router.push(`/item/${item.id}`)} style={[ui.row, { gap: 10 }]}>
                <ItemThumb item={item} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={ui.body} numberOfLines={1}>
                    {item.brand ? `${item.brand} · ` : ''}
                    {item.name}
                  </Text>
                  <Text style={ui.muted}>{lastWorn ? `Last worn ${formatDay(lastWorn, false)}` : 'Never worn'}</Text>
                </View>
                <Text style={[ui.muted, { color: colors.accent }]}>›</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={ui.muted}>Nothing to declutter — everything you’ve owned for 6 months has been worn recently.</Text>
        )}
      </Section>

      <Strip title="Most worn" items={s.mostWorn} label={(i) => `${wears[i.id]}×`} />
      <Strip title="Best cost per wear" items={s.bestValue} label={(i) => money.format(s.cpw(i), true)} />
    </ScrollView>
  );
}

/** Current time; read via a helper so the memoised stats stay a plain calculation. */
function nowMs() {
  return Date.now();
}

function Tile({ label, value }: { label: string; value: string }) {
  const { ui } = useTheme();
  return (
    <View style={[ui.card, { flex: 1, padding: 12 }]}>
      <Text style={ui.h2}>{value}</Text>
      <Text style={ui.muted}>{label}</Text>
    </View>
  );
}

/** Horizontal bar: label (optionally with a colour swatch), bar anchored at the left, value in text ink. */
function HBar({ label, value, max, swatch }: { label: string; value: number; max: number; swatch?: string | null }) {
  const { colors, ui } = useTheme();
  return (
    <View style={[ui.row, { gap: 10, marginBottom: 8 }]} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={[ui.row, { width: 110, gap: 6 }]}>
        {swatch !== undefined ? (
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: swatch ?? 'transparent',
              borderWidth: 1,
              // A visible ring so dark swatches (black, navy) still show on a dark card, and white on a light one.
              borderColor: colors.muted,
              borderStyle: swatch ? 'solid' : 'dashed',
            }}
          />
        ) : null}
        <Text style={[ui.body, { flexShrink: 1 }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={{ flex: 1, height: 10, backgroundColor: colors.chip, borderRadius: 2 }}>
        <View
          style={{
            width: `${(value / max) * 100}%`,
            height: 10,
            backgroundColor: colors.accent,
            borderTopRightRadius: 4,
            borderBottomRightRadius: 4,
          }}
        />
      </View>
      <Text style={[ui.muted, { width: 28, textAlign: 'right' }]}>{value}</Text>
    </View>
  );
}

type Month = { key: string; label: string; total: number; count: number };

/** One column per month; tap a column to see its exact amount. The biggest month is shown by default. */
function MonthlySpend({ months, format }: { months: Month[]; format: (n: number, compact?: boolean) => string }) {
  const { colors, ui } = useTheme();
  const max = Math.max(...months.map((m) => m.total));
  const peak = months.find((m) => m.total === max && max > 0)?.key;
  const [picked, setPicked] = useState<string | undefined>();
  const current = picked ?? peak;
  const shown = months.find((m) => m.key === current);
  const H = 110;
  return (
    <Section title="Spending, last 6 months">
      {max > 0 ? (
        <>
          <Text style={[ui.body, { marginBottom: 8 }]}>
            {shown ? `${shown.label}: ${format(shown.total, true)} · ${shown.count} item${shown.count === 1 ? '' : 's'} added` : ' '}
          </Text>
          <View style={[ui.row, { alignItems: 'flex-end', height: H + 24, gap: 8 }]}>
            {months.map((m) => {
              const h = m.total ? Math.max(4, (m.total / max) * H) : 0;
              const active = m.key === current;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setPicked(m.key)}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: H + 24 }}
                  accessibilityRole="button"
                  accessibilityLabel={`${m.label}: ${format(m.total, true)}`}
                >
                  <View
                    style={{
                      width: '70%',
                      height: h,
                      backgroundColor: colors.accent,
                      opacity: active ? 1 : 0.55,
                      borderTopLeftRadius: 4,
                      borderTopRightRadius: 4,
                    }}
                  />
                  <View style={{ height: 1, alignSelf: 'stretch', backgroundColor: colors.border }} />
                  <Text style={[ui.muted, { marginTop: 4, color: active ? colors.text : colors.muted }]}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[ui.muted, { marginTop: 8 }]}>Based on the price and date you added each item. Tap a month for details.</Text>
        </>
      ) : (
        <Text style={ui.muted}>Add prices to your items to see spending over time.</Text>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { ui } = useTheme();
  return (
    <View style={[ui.card, { padding: 14 }]}>
      <Text style={[ui.h2, { marginBottom: 10 }]}>{title}</Text>
      {children}
    </View>
  );
}

function Strip({ title, items, label }: { title: string; items: Item[]; label?: (i: Item) => string }) {
  const { ui } = useTheme();
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
