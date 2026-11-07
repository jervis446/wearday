import { Stack, useLocalSearchParams } from 'expo-router';
import { ComponentRef, useRef, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { OutfitCanvas } from '../../components/OutfitCanvas';
import { Button, Empty } from '../../components/ui';
import { track } from '../../lib/analytics';
import { shareViewAsImage } from '../../lib/shareImage';
import { useStore } from '../../lib/store';
import { light, useTheme } from '../../lib/theme';

/** Preview of the outfit card, then share it as an image. The card always uses the light brand look. */
export default function ShareOutfit() {
  const { colors, ui } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { outfits, items } = useStore();
  const outfit = outfits.find((o) => o.id === id);
  const { width } = useWindowDimensions();
  const cardRef = useRef<ComponentRef<typeof View>>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  if (!outfit) return <Empty title="Outfit not found" />;
  const card = Math.min(width - 32, 400);
  const canvas = card - 32;
  const pieces = outfit.pieces.map((p) => items.find((i) => i.id === p.itemId)).filter(Boolean);

  const share = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const how = await shareViewAsImage(cardRef, outfit.name);
      track('outfit_shared', { how });
      if (how === 'downloaded') setMessage({ text: 'Image downloaded.' });
    } catch (e) {
      setMessage({ text: (e as Error).message || 'Couldn’t create the image.', error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { gap: 16, alignItems: 'center' }]}>
      <Stack.Screen options={{ title: 'Share outfit' }} />
      <View
        ref={cardRef}
        collapsable={false}
        style={{ width: card, backgroundColor: light.bg, borderRadius: 20, padding: 16, gap: 12 }}
      >
        <OutfitCanvas pieces={outfit.pieces} items={items} size={canvas} />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: light.text }} numberOfLines={2}>
              {outfit.name}
            </Text>
            <Text style={{ fontSize: 13, color: light.muted }} numberOfLines={2}>
              {pieces.map((i) => (i!.brand ? `${i!.brand} ${i!.name}` : i!.name)).join(' · ')}
            </Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '800', color: light.accent }}>Wearday</Text>
        </View>
      </View>
      <Button title={busy ? 'Preparing…' : 'Share image'} onPress={busy ? () => {} : share} style={{ alignSelf: 'stretch', maxWidth: 400, width: '100%' }} />
      {message ? <Text style={{ color: message.error ? colors.danger : colors.muted }}>{message.text}</Text> : null}
    </ScrollView>
  );
}
