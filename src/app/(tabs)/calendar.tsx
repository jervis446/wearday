import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { OutfitCanvas } from '../../components/OutfitCanvas';
import { Bouncy, Button, ItemThumb } from '../../components/ui';
import { useStore } from '../../lib/store';
import { font, TAB_BAR_SPACE, useTheme } from '../../lib/theme';
import { todayKey, WearLog } from '../../lib/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Calendar() {
  const { colors, ui } = useTheme();
  const { logs, items, outfits, itemsOfLog } = useStore();
  const { width } = useWindowDimensions();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(todayKey());

  const cell = Math.floor((Math.min(width, 600) - 40) / 7);
  const byDate = useMemo(() => Object.fromEntries(logs.map((l) => [l.date, l])) as Record<string, WearLog>, [logs]);

  const days = useMemo(() => {
    const first = (month.getDay() + 6) % 7; // Monday-first offset
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [
      ...Array<null>(first).fill(null),
      ...Array.from({ length: count }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
    ];
  }, [month]);

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const log = byDate[selected];
  const outfit = log?.outfitId ? outfits.find((o) => o.id === log.outfitId) : undefined;
  const logItems = log ? itemsOfLog(log).map((id) => items.find((i) => i.id === id)).filter(Boolean) : [];

  const preview = (l: WearLog) => {
    if (l.selfieUri) return l.selfieUri;
    const first = itemsOfLog(l)[0];
    return items.find((i) => i.id === first)?.imageUri;
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { paddingTop: 4, paddingBottom: TAB_BAR_SPACE, maxWidth: 600, width: '100%', alignSelf: 'center' }]}>
      <View style={[ui.row, { justifyContent: 'space-between', marginBottom: 14 }]}>
        <Text style={ui.h2}>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
        <View style={[ui.row, { gap: 8 }]}>
          {(['chevron-back', 'chevron-forward'] as const).map((name, i) => (
            <Bouncy
              key={name}
              onPress={() => shift(i ? 1 : -1)}
              accessibilityLabel={i ? 'Next month' : 'Previous month'}
              style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder }}
            >
              <Ionicons name={name} size={18} color={colors.text} />
            </Bouncy>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={[ui.muted, { width: cell, textAlign: 'center' }]}>
            {d}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
        {days.map((d, i) => {
          if (!d) return <View key={`b${i}`} style={{ width: cell, height: cell * 1.25 }} />;
          const key = todayKey(d);
          const l = byDate[key];
          const img = l ? preview(l) : undefined;
          const isSel = key === selected;
          return (
            <Pressable key={key} onPress={() => setSelected(key)} style={{ width: cell, height: cell * 1.25, padding: 2 }}>
              <View
                style={{
                  flex: 1,
                  borderRadius: 12,
                  overflow: 'hidden',
                  backgroundColor: l ? colors.card : colors.glass,
                  borderWidth: isSel ? 2 : 1,
                  borderColor: isSel ? colors.pink : key === todayKey() ? colors.lime : colors.glassBorder,
                }}
              >
                {img ? <Image source={{ uri: img }} style={{ flex: 1 }} resizeMode="cover" /> : null}
                <Text style={{ position: 'absolute', top: 3, left: 5, fontSize: 11, fontFamily: font.bodyBold, color: img ? '#FFFFFF' : colors.text, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: img ? 3 : 0 }}>
                  {d.getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: 20, gap: 10 }}>
        <Text style={ui.h2}>
          {new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        {log ? (
          <>
            {log.selfieUri ? (
              <Image source={{ uri: log.selfieUri }} style={{ width: '60%', aspectRatio: 3 / 4, borderRadius: 14, alignSelf: 'center' }} />
            ) : null}
            {outfit ? (
              <View style={{ alignItems: 'center', gap: 4 }}>
                <OutfitCanvas pieces={outfit.pieces} items={items} size={180} />
                <Text style={ui.muted}>{outfit.name}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {logItems.map((it) => (
                <Pressable key={it!.id} onPress={() => router.push(`/item/${it!.id}`)}>
                  <ItemThumb item={it} size={70} />
                </Pressable>
              ))}
            </View>
            {log.note ? <Text style={ui.body}>{log.note}</Text> : null}
            <Button title="Edit entry" variant="secondary" onPress={() => router.push({ pathname: '/log', params: { logId: log.id } })} />
          </>
        ) : (
          <Button title="Log what I wore" onPress={() => router.push({ pathname: '/log', params: { date: selected } })} />
        )}
      </View>
    </ScrollView>
  );
}
