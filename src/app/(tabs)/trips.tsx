import { router } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Button, Empty } from '../../components/ui';
import { formatDay, packProgress, tripEnd } from '../../lib/packing';
import { canAddTrip } from '../../lib/plans';
import { usePremium } from '../../lib/premium';
import { useStore } from '../../lib/store';
import { TAB_BAR_SPACE, useTheme } from '../../lib/theme';
import { todayKey, Trip } from '../../lib/types';
import { openPaywall } from '../../lib/usePaywall';

export default function Trips() {
  const { colors, ui } = useTheme();
  const { trips } = useStore();
  const { isPremium } = usePremium();
  const today = todayKey();
  const upcoming = trips.filter((t) => tripEnd(t) >= today).sort((a, b) => a.start.localeCompare(b.start));
  const past = trips.filter((t) => tripEnd(t) < today).sort((a, b) => b.start.localeCompare(a.start));
  const rows: (Trip | string)[] = [...upcoming, ...(past.length ? ['Past trips', ...past] : [])];

  return (
    <View style={ui.screen}>
      <FlatList
        data={rows}
        keyExtractor={(r) => (typeof r === 'string' ? r : r.id)}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: TAB_BAR_SPACE, gap: 12, maxWidth: 700, width: '100%', alignSelf: 'center' }}
        ListHeaderComponent={
          <Button
            title={canAddTrip(isPremium, trips.length) ? '+ Plan a trip' : '+ Plan a trip  ✨ Premium'}
            onPress={() => (canAddTrip(isPremium, trips.length) ? router.push('/trip/new') : openPaywall('trips'))}
          />
        }
        ListEmptyComponent={
          <Empty emoji="🧳" title="No trips yet" hint="Plan a trip to get a packing list made from your own wardrobe." />
        }
        renderItem={({ item: row }) => {
          if (typeof row === 'string') return <Text style={[ui.label, { marginTop: 12 }]}>{row}</Text>;
          const { done, total } = packProgress(row);
          const pct = total ? done / total : 0;
          return (
            <Pressable onPress={() => router.push(`/trip/${row.id}`)} style={[ui.card, { padding: 18, gap: 6 }]}>
              <View style={[ui.row, { justifyContent: 'space-between', gap: 8 }]}>
                <Text style={[ui.h2, { flex: 1 }]} numberOfLines={1}>
                  {row.name}
                </Text>
                <Text style={[ui.muted, { color: done === total && total ? colors.accent : colors.muted }]}>
                  {total ? `${done}/${total} packed` : 'Nothing added'}
                </Text>
              </View>
              <Text style={ui.muted}>
                {row.destination ? `${row.destination} · ` : ''}
                {formatDay(row.start)} – {formatDay(tripEnd(row))} · {row.nights} night{row.nights === 1 ? '' : 's'}
              </Text>
              <View style={{ height: 8, backgroundColor: colors.chip, borderRadius: 4, marginTop: 6, overflow: 'hidden' }}>
                <View style={{ width: `${pct * 100}%`, height: 8, backgroundColor: done === total && total ? colors.lime : colors.accent, borderRadius: 4 }} />
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
