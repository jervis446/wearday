import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, useWindowDimensions, View } from 'react-native';

import { OutfitCanvas } from '../components/OutfitCanvas';
import { Button, ChipRow } from '../components/ui';
import { aiUsedToday, recordAiUse } from '../lib/aiQuota';
import { track } from '../lib/analytics';
import { moodChip, moodFromChip, MOODS } from '../lib/moods';
import { canUseAi, FREE_LIMITS } from '../lib/plans';
import { usePremium } from '../lib/premium';
import { autoLayout } from '../lib/outfitLayout';
import { useSettings } from '../lib/settings';
import { useStore, useWearCounts } from '../lib/store';
import { buildStyleProfile, hasStyle } from '../lib/style';
import { aiConfigured, Suggestion, suggestOutfit } from '../lib/suggest';
import { font, useTheme } from '../lib/theme';
import { openPaywall } from '../lib/usePaywall';
import { Item } from '../lib/types';

const OCCASIONS = ['Everyday', 'Work', 'Date night', 'Party', 'Sport', 'Travel'];

export default function Suggest() {
  const { colors, ui } = useTheme();
  const { items, logs, outfits, itemsOfLog, saveOutfit } = useStore();
  const { settings } = useSettings();
  const style = useMemo(
    () => buildStyleProfile({ items, logs, outfits, itemsOfLog, notes: settings.styleNotes }),
    [items, logs, outfits, itemsOfLog, settings.styleNotes],
  );
  const wears = useWearCounts();
  const { width } = useWindowDimensions();
  const canvas = Math.min(width - 32, 420);

  const [occasion, setOccasion] = useState('Everyday');
  /** The chosen mood chip ('' = none). */
  const [moodLabel, setMoodLabel] = useState('');
  const mood = moodFromChip(moodLabel);
  const [useWeather, setUseWeather] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Suggestion | null>(null);
  const { isPremium } = usePremium();
  const [aiUsed, setAiUsed] = useState(0);
  const [limitHit, setLimitHit] = useState(false);

  useEffect(() => {
    aiUsedToday().then(setAiUsed);
  }, []);

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

  const run = async (basic = false) => {
    setError('');
    if (aiConfigured && !basic && !canUseAi(isPremium, await aiUsedToday())) {
      setLimitHit(true);
      return;
    }
    setLimitHit(false);
    setLoading(true);
    try {
      const coords = await getCoords();
      const s = await suggestOutfit({ items, logs, itemsOfLog, wears, occasion, coords, avoidItemIds: result?.itemIds, basic, mood, style });
      setResult(s);
      if (s.source === 'ai' && !isPremium) setAiUsed(await recordAiUse());
      track('suggestion_requested', { source: s.source, occasion, mood: mood?.label, styled: hasStyle(style), weather: !!s.weather, ok: true });
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
    const tags = [occasion.toLowerCase(), ...(mood ? [mood.label.toLowerCase()] : [])];
    const outfit = saveOutfit({ name: result.name, pieces: autoLayout(chosen), tags });
    track('outfit_saved', { pieces: chosen.length, source: 'suggestion' });
    router.replace(`/outfit/${outfit.id}`);
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { gap: 12, maxWidth: 600, width: '100%', alignSelf: 'center' }]}>
      <Pressable
        onPress={() => router.push('/style')}
        style={[ui.card, { padding: 14, gap: 4, flexDirection: 'row', alignItems: 'center' }]}
        accessibilityRole="button"
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[ui.body, { fontFamily: font.bodyBold }]}>🎨 Your style</Text>
          <Text style={ui.muted}>
            {hasStyle(style)
              ? `Learned from ${style.outfitsLearned} outfit${style.outfitsLearned === 1 ? '' : 's'}${style.loved ? ` · ${style.loved} loved` : ''}${style.favoriteColors.length ? ` · loves ${style.favoriteColors.slice(0, 2).join(' & ')}` : ''}`
              : 'Add outfits you’ve worn before so suggestions match your style.'}
          </Text>
        </View>
        <Text style={[ui.h2, { color: colors.accent }]}>›</Text>
      </Pressable>

      <Text style={ui.label}>How are you feeling?</Text>
      <ChipRow
        options={MOODS.map(moodChip)}
        selected={[moodLabel]}
        onToggle={(m) => setMoodLabel((cur) => (cur === m ? '' : m))}
        scroll={false}
      />
      {mood ? <Text style={ui.muted}>Going for: {mood.hint}.</Text> : null}

      <Text style={ui.label}>Occasion</Text>
      <ChipRow options={OCCASIONS} selected={[occasion]} onToggle={setOccasion} scroll={false} />

      <View style={[ui.row, { justifyContent: 'space-between', marginTop: 8 }]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={ui.body}>Use today’s weather</Text>
          <Text style={ui.muted}>Sends your approximate location (about 1 km) to look up the forecast.</Text>
        </View>
        <Switch value={useWeather} onValueChange={setUseWeather} trackColor={{ true: colors.accent }} thumbColor={colors.card} />
      </View>

      <Button title={loading ? 'Thinking…' : result ? 'Try another' : '✨ Suggest an outfit'} onPress={loading ? () => {} : () => run()} />
      {aiConfigured && !isPremium && !limitHit ? (
        <Text style={[ui.muted, { textAlign: 'center' }]}>
          {Math.max(0, FREE_LIMITS.aiPerDay - aiUsed)} of {FREE_LIMITS.aiPerDay} free AI suggestion left today
        </Text>
      ) : null}
      {limitHit ? (
        <View style={[ui.card, { padding: 14, gap: 10, backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }]}>
          <Text style={[ui.body, { fontFamily: font.bodyBold }]}>You’ve used today’s free AI suggestion</Text>
          <Text style={ui.muted}>Your free AI suggestion comes back tomorrow. Go Premium for unlimited AI ideas, or get a basic suggestion now (always free).</Text>
          <Button title="✨ Go Premium" onPress={() => openPaywall('ai')} />
          <Button title="Get a basic suggestion" variant="secondary" onPress={() => run(true)} />
        </View>
      ) : null}
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
              onPress={() =>
                router.push({ pathname: '/log', params: { itemIds: result.itemIds.join(','), mood: mood?.label ?? '' } })
              }
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
