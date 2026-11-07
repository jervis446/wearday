import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { OutfitCanvas } from '../../components/OutfitCanvas';
import { Button, ChipRow, confirm, HeaderButton, ItemThumb } from '../../components/ui';
import { addDays, EXTRA_SUGGESTIONS, formatDay, packProgress, suggestPacking, tripEnd } from '../../lib/packing';
import { useStore, useWearCounts } from '../../lib/store';
import { useTheme } from '../../lib/theme';
import { CATEGORIES, inCloset, Trip, todayKey, uid } from '../../lib/types';

type Draft = Pick<Trip, 'name' | 'destination' | 'start' | 'nights'>;

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { trips, saveTrip } = useStore();
  const trip = trips.find((t) => t.id === id);

  if (id === 'new' || !trip) {
    return (
      <SetupForm
        onCreate={(draft) => {
          const created = saveTrip({ ...draft, itemIds: [], packed: [], extras: [] });
          router.replace(`/trip/${created.id}`);
        }}
      />
    );
  }
  return <TripDetail trip={trip} />;
}

function SetupForm({ onCreate }: { onCreate: (d: Draft) => void }) {
  const { colors, ui } = useTheme();
  const [draft, setDraft] = useState<Draft>({ name: '', destination: '', start: addDays(todayKey(), 1), nights: 3 });
  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { maxWidth: 600, width: '100%', alignSelf: 'center' }]}>
      <Stack.Screen options={{ title: 'Plan a trip' }} />
      <TripFields draft={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
      <Button
        title="Create trip"
        style={{ marginTop: 24 }}
        onPress={() => onCreate({ ...draft, name: draft.name.trim() || (draft.destination?.trim() ? `Trip to ${draft.destination.trim()}` : 'My trip') })}
      />
      <Text style={[ui.muted, { marginTop: 10, color: colors.muted }]}>You can change any of this later.</Text>
    </ScrollView>
  );
}

function TripFields({ draft, onChange }: { draft: Draft; onChange: (p: Partial<Draft>) => void }) {
  const { colors, ui } = useTheme();
  return (
    <View>
      <Text style={ui.label}>Trip name</Text>
      <TextInput style={ui.input} value={draft.name} onChangeText={(name) => onChange({ name })} placeholder="e.g. Goa weekend" placeholderTextColor={colors.muted} />
      <Text style={ui.label}>Destination</Text>
      <TextInput
        style={ui.input}
        value={draft.destination ?? ''}
        onChangeText={(destination) => onChange({ destination })}
        placeholder="Optional"
        placeholderTextColor={colors.muted}
      />
      <Text style={ui.label}>Leaving</Text>
      <Stepper
        label={formatDay(draft.start)}
        onMinus={() => onChange({ start: addDays(draft.start, -1) })}
        onPlus={() => onChange({ start: addDays(draft.start, 1) })}
      />
      <Text style={ui.label}>Nights</Text>
      <Stepper
        label={`${draft.nights} night${draft.nights === 1 ? '' : 's'} · back ${formatDay(tripEnd(draft), false)}`}
        onMinus={() => onChange({ nights: Math.max(0, draft.nights - 1) })}
        onPlus={() => onChange({ nights: Math.min(60, draft.nights + 1) })}
      />
    </View>
  );
}

function Stepper({ label, onMinus, onPlus }: { label: string; onMinus: () => void; onPlus: () => void }) {
  const { ui } = useTheme();
  return (
    <View style={[ui.row, { gap: 10 }]}>
      <Button title="−" variant="secondary" onPress={onMinus} />
      <Text style={[ui.body, { flex: 1, textAlign: 'center', fontWeight: '600' }]}>{label}</Text>
      <Button title="+" variant="secondary" onPress={onPlus} />
    </View>
  );
}

function TripDetail({ trip }: { trip: Trip }) {
  const { colors, ui } = useTheme();
  const { items, outfits, saveTrip, deleteTrip } = useStore();
  const wears = useWearCounts();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<'' | 'items' | 'outfit'>('');
  const [cat, setCat] = useState('Tops');
  const [extraText, setExtraText] = useState('');

  const update = (patch: Partial<Trip>) => saveTrip({ ...trip, ...patch });
  const packed = new Set(trip.packed);
  const tripItems = trip.itemIds.map((iid) => items.find((i) => i.id === iid)).filter((i) => !!i);
  const { done, total } = packProgress(trip);

  const toggleItem = (iid: string) =>
    update(
      trip.itemIds.includes(iid)
        ? { itemIds: trip.itemIds.filter((x) => x !== iid), packed: trip.packed.filter((x) => x !== iid) }
        : { itemIds: [...trip.itemIds, iid] },
    );
  const togglePacked = (iid: string) =>
    update({ packed: packed.has(iid) ? trip.packed.filter((x) => x !== iid) : [...trip.packed, iid] });
  const addExtra = (text: string) => {
    const t = text.trim();
    if (!t || trip.extras.some((e) => e.text.toLowerCase() === t.toLowerCase())) return;
    update({ extras: [...trip.extras, { id: uid(), text: t, packed: false }] });
  };
  const autoFill = () => {
    const picks = suggestPacking(items, trip, wears);
    update({ itemIds: [...new Set([...trip.itemIds, ...picks])] });
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { gap: 12, paddingBottom: 60, maxWidth: 600, width: '100%', alignSelf: 'center' }]}>
      <Stack.Screen
        options={{
          title: trip.name,
          headerRight: () => <HeaderButton title={editing ? 'Done' : 'Edit'} onPress={() => setEditing((e) => !e)} />,
        }}
      />

      {editing ? (
        <View style={[ui.card, { padding: 14 }]}>
          <TripFields draft={trip} onChange={update} />
          <Button
            title="Delete trip"
            variant="danger"
            style={{ marginTop: 16 }}
            onPress={() =>
              confirm('Delete this trip?', () => {
                deleteTrip(trip.id);
                router.back();
              })
            }
          />
        </View>
      ) : (
        <View style={[ui.card, { padding: 14, gap: 6 }]}>
          <Text style={ui.muted}>
            {trip.destination ? `${trip.destination} · ` : ''}
            {formatDay(trip.start)} – {formatDay(tripEnd(trip))} · {trip.nights} night{trip.nights === 1 ? '' : 's'}
          </Text>
          <Text style={ui.h2}>{total ? `${done} of ${total} packed` : 'Nothing on the list yet'}</Text>
          <View style={{ height: 8, backgroundColor: colors.chip, borderRadius: 4 }}>
            <View style={{ width: `${total ? (done / total) * 100 : 0}%`, height: 8, backgroundColor: colors.accent, borderRadius: 4 }} />
          </View>
        </View>
      )}

      <Button title="✨ Suggest what to pack" onPress={autoFill} />
      <View style={[ui.row, { gap: 10 }]}>
        <Button title="+ Clothes" variant="secondary" style={{ flex: 1 }} onPress={() => setAdding(adding === 'items' ? '' : 'items')} />
        <Button title="+ Outfit" variant="secondary" style={{ flex: 1 }} onPress={() => setAdding(adding === 'outfit' ? '' : 'outfit')} />
      </View>

      {adding === 'items' ? (
        <View style={[ui.card, { padding: 12 }]}>
          <ChipRow options={CATEGORIES} selected={[cat]} onToggle={setCat} />
          <FlatList
            horizontal
            data={items.filter((i) => inCloset(i) && i.category === cat)}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
            ListEmptyComponent={<Text style={[ui.muted, { padding: 12 }]}>No {cat.toLowerCase()} in your closet.</Text>}
            renderItem={({ item }) => (
              <Pressable onPress={() => toggleItem(item.id)}>
                <ItemThumb item={item} size={76} badge={trip.itemIds.includes(item.id) ? '✓' : undefined} />
              </Pressable>
            )}
          />
        </View>
      ) : null}

      {adding === 'outfit' ? (
        <FlatList
          horizontal
          data={outfits}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ gap: 8 }}
          ListEmptyComponent={<Text style={ui.muted}>No saved outfits yet.</Text>}
          renderItem={({ item: o }) => (
            <Pressable
              onPress={() => {
                update({ itemIds: [...new Set([...trip.itemIds, ...o.pieces.map((p) => p.itemId)])] });
                setAdding('');
              }}
            >
              <View pointerEvents="none">
                <OutfitCanvas pieces={o.pieces} items={items} size={110} />
              </View>
              <Text numberOfLines={1} style={[ui.muted, { width: 110, textAlign: 'center' }]}>
                {o.name}
              </Text>
            </Pressable>
          )}
        />
      ) : null}

      {CATEGORIES.map((c) => {
        const group = tripItems.filter((i) => i.category === c);
        if (!group.length) return null;
        return (
          <View key={c} style={[ui.card, { padding: 12, gap: 8 }]}>
            <Text style={[ui.label, { marginTop: 0 }]}>
              {c} · {group.filter((i) => packed.has(i.id)).length}/{group.length}
            </Text>
            {group.map((i) => (
              <CheckRow
                key={i.id}
                checked={packed.has(i.id)}
                onToggle={() => togglePacked(i.id)}
                onRemove={() => toggleItem(i.id)}
                left={<ItemThumb item={i} size={44} />}
                label={i.brand ? `${i.brand} · ${i.name}` : i.name}
              />
            ))}
          </View>
        );
      })}

      <View style={[ui.card, { padding: 12, gap: 8 }]}>
        <Text style={[ui.label, { marginTop: 0 }]}>Don’t forget</Text>
        {trip.extras.map((e) => (
          <CheckRow
            key={e.id}
            checked={e.packed}
            label={e.text}
            onToggle={() => update({ extras: trip.extras.map((x) => (x.id === e.id ? { ...x, packed: !x.packed } : x)) })}
            onRemove={() => update({ extras: trip.extras.filter((x) => x.id !== e.id) })}
          />
        ))}
        <View style={[ui.row, { gap: 8 }]}>
          <TextInput
            style={[ui.input, { flex: 1 }]}
            value={extraText}
            onChangeText={setExtraText}
            placeholder="Add something (e.g. Camera)"
            placeholderTextColor={colors.muted}
            onSubmitEditing={() => {
              addExtra(extraText);
              setExtraText('');
            }}
          />
          <Button
            title="Add"
            variant="secondary"
            onPress={() => {
              addExtra(extraText);
              setExtraText('');
            }}
          />
        </View>
        <ChipRow
          options={EXTRA_SUGGESTIONS.filter((s) => !trip.extras.some((e) => e.text === s))}
          selected={[]}
          onToggle={addExtra}
          scroll={false}
        />
      </View>
    </ScrollView>
  );
}

function CheckRow({
  checked,
  label,
  left,
  onToggle,
  onRemove,
}: {
  checked: boolean;
  label: string;
  left?: React.ReactNode;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const { colors, ui } = useTheme();
  return (
    <View style={[ui.row, { gap: 10 }]}>
      <Pressable onPress={onToggle} style={[ui.row, { flex: 1, gap: 10 }]} accessibilityRole="checkbox" accessibilityState={{ checked }}>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: checked ? colors.accent : colors.border,
            backgroundColor: checked ? colors.accent : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {checked ? <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: '800' }}>✓</Text> : null}
        </View>
        {left}
        <Text
          style={[ui.body, { flex: 1, textDecorationLine: checked ? 'line-through' : 'none', color: checked ? colors.muted : colors.text }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>
      <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel={`Remove ${label}`}>
        <Text style={[ui.muted, { fontSize: 16 }]}>✕</Text>
      </Pressable>
    </View>
  );
}
