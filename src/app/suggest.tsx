import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Switch, Text, useWindowDimensions, View } from 'react-native';

import { OutfitCanvas } from '../components/OutfitCanvas';
import { Button, ChipRow } from '../components/ui';
import { track } from '../lib/analytics';
import { autoLayout } from '../lib/outfitLayout';
import { useStore, useWearCounts } from '../lib/store';
import { aiConfigured, Suggestion, suggestOutfit } from '../lib/suggest';
import { useTheme } from '../lib/theme';
import { Item } from '../lib/types';

const OCCASIONS = ['Everyday', 'Work', 'Date night', 'Party', 'Sport', 'Travel'];

export default function Suggest() {
  const { colors, ui } = useTheme();
  const { items, logs, itemsOfLog, saveOutfit } = useStore();
  const wears = useWearCounts();
  const { width } = useWindowDimensions();
  const canvas = Math.min(width - 32, 420);

  const [occasion, setOccasion] = useState('Everyday');
  const [useWeather, setUseWeather] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Suggestion | null>(null);

  const getCoords = async () => {
    if (!useWeather) return undefined;
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return undefined;
      const pos =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
      return pos ? { lat: pos.coords.latitude, lon: pos.coords.longitude } : undefined;
    } catch {
      return undefined;
    }
  };

  const run = async () => {
    setLoading(true);
    setError('');
    try {
      const coords = await getCoords();
      const s = await suggestOutfit({ items, logs, itemsOfLog, wears, occasion, coords, avoidItemIds: result?.itemIds });
      setResult(s);
      track('suggestion_requested', { source: s.source, occasion, weather: !!s.weather, ok: true });
    } catch (e) {
      setError((e as Error).message);
      track('suggestion_requested', { occasion, ok: false });
    } finally {
      setLoading(false);
    }
  };

  const chosen = (result?.itemIds.map((id) => items.find((i) => i.id === id)).filter(Boolean) ?? []) as Item[];

  const save = () => {
    if (!result) return;
    const outfit = saveOutfit({ name: result.name, pieces: autoLayout(chosen), tags: [occasion.toLowerCase()] });
    track('outfit_saved', { pieces: chosen.length, source: 'suggestion' });
    router.replace(`/outfit/${outfit.id}`);
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { gap: 12, maxWidth: 600, width: '100%', alignSelf: 'center' }]}>
      <Text style={ui.label}>Occasion</Text>
      <ChipRow options={OCCASIONS} selected={[occasion]} onToggle={setOccasion} scroll={false} />

      <View style={[ui.row, { justifyContent: 'space-between', marginTop: 8 }]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={ui.body}>Use today’s weather</Text>
          <Text style={ui.muted}>Sends your approximate location (about 1 km) to look up the forecast.</Text>
        </View>
        <Switch value={useWeather} onValueChange={setUseWeather} trackColor={{ true: colors.accent }} thumbColor={colors.card} />
      </View>

      <Button title={loading ? 'Thinking…' : result ? 'Try another' : '✨ Suggest an outfit'} onPress={loading ? () => {} : run} />
      {!aiConfigured ? (
        <Text style={ui.muted}>
          Using basic suggestions. Set EXPO_PUBLIC_SUGGEST_URL to your Cloudflare Worker to turn on AI suggestions.
        </Text>
      ) : null}
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.accent} /> : null}

      {result && !loading ? (
        <View style={{ gap: 10, alignItems: 'center' }}>
          <OutfitCanvas pieces={autoLayout(chosen)} items={items} size={canvas} />
          <Text style={ui.h2}>{result.name}</Text>
          {result.weather ? (
            <Text style={ui.muted}>
              {result.weather.summary} · {result.weather.tempMin}–{result.weather.tempMax}°C · {result.weather.rainChance}% rain
            </Text>
          ) : null}
          {result.reason ? <Text style={[ui.body, { textAlign: 'center' }]}>{result.reason}</Text> : null}
          <View style={[ui.row, { gap: 10, alignSelf: 'stretch' }]}>
            <Button title="Save outfit" variant="secondary" onPress={save} style={{ flex: 1 }} />
            <Button
              title="Wear today"
              onPress={() => router.push({ pathname: '/log', params: { itemIds: result.itemIds.join(',') } })}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
