import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput } from 'react-native';

import { Button, ChipRow, ItemThumb } from '../../components/ui';
import { track } from '../../lib/analytics';
import { chooseImage } from '../../lib/images';
import { shareFit, SocialError } from '../../lib/social/api';
import { preparePhotoForSharing } from '../../lib/social/photo';
import { CAPTION_MAX, cleanItemNames, cleanText, MAX_FIT_ITEMS } from '../../lib/social/rules';
import { useStore } from '../../lib/store';
import { useTheme } from '../../lib/theme';
import { CATEGORIES, dayLabel, inCloset } from '../../lib/types';

const RECENT_SELFIES = 6;

/** Share an outfit photo with your friends. */
export default function ShareFit() {
  const { colors, ui } = useTheme();
  const { items, logs, itemsOfLog } = useStore();
  const [photoUri, setPhotoUri] = useState<string>();
  const [caption, setCaption] = useState('');
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [cat, setCat] = useState<string>('Tops');
  const [status, setStatus] = useState<'idle' | 'preparing' | 'uploading'>('idle');
  const [error, setError] = useState('');
  const submitting = useRef(false);

  // Recent outfit selfies from the diary, with the clothes logged that day.
  const selfies = useMemo(
    () =>
      logs
        .filter((l) => l.selfieUri)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, RECENT_SELFIES),
    [logs],
  );
  const owned = items.filter((i) => inCloset(i) && i.category === cat);
  const names = cleanItemNames(itemIds.map((id) => items.find((i) => i.id === id)?.name ?? ''));

  const pick = async () => {
    setError('');
    const uri = await chooseImage(false);
    if (uri) setPhotoUri(uri);
  };

  const toggleItem = (id: string) =>
    setItemIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length < MAX_FIT_ITEMS ? [...ids, id] : ids));

  const share = async () => {
    if (!photoUri || submitting.current) return;
    submitting.current = true;
    setError('');
    try {
      setStatus('preparing');
      const bytes = await preparePhotoForSharing(photoUri);
      setStatus('uploading');
      await shareFit(bytes, { caption: cleanText(caption, CAPTION_MAX), itemNames: names });
      track('fit_shared', { items: names.length, caption: !!caption.trim() });
      router.back();
    } catch (e) {
      setError(e instanceof SocialError ? e.message : 'Couldn’t share your fit. Please try again.');
      setStatus('idle');
      submitting.current = false;
    }
  };

  const busy = status !== 'idle';

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={[ui.pad, { gap: 6, paddingBottom: 60, maxWidth: 600, width: '100%', alignSelf: 'center' }]}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        onPress={pick}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={photoUri ? 'Change photo' : 'Take or choose a photo'}
        style={[ui.card, { aspectRatio: 3 / 4, width: '70%', alignSelf: 'center', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }]}
      >
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <Text style={[ui.muted, { textAlign: 'center', padding: 16 }]}>📸{'\n'}Tap to take or choose your outfit photo</Text>
        )}
      </Pressable>

      {selfies.length ? (
        <>
          <Text style={ui.label}>Or use a diary selfie</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {selfies.map((log) => (
              <Pressable
                key={log.id}
                disabled={busy}
                onPress={() => {
                  setPhotoUri(log.selfieUri);
                  setItemIds(itemsOfLog(log).filter((id) => items.some((i) => i.id === id)).slice(0, MAX_FIT_ITEMS));
                }}
                accessibilityRole="button"
                accessibilityLabel={`Use your selfie from ${dayLabel(log.date)}`}
                style={{ borderRadius: 14, borderWidth: 2, borderColor: photoUri === log.selfieUri ? colors.accent : 'transparent', overflow: 'hidden' }}
              >
                <Image source={{ uri: log.selfieUri }} style={{ width: 66, height: 88 }} resizeMode="cover" />
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      <Text style={ui.label}>Caption</Text>
      <TextInput
        style={[ui.input, { minHeight: 70, textAlignVertical: 'top' }]}
        value={caption}
        onChangeText={setCaption}
        placeholder="First day at the new job 💼"
        placeholderTextColor={colors.muted}
        maxLength={CAPTION_MAX}
        multiline
        editable={!busy}
        accessibilityLabel="Caption"
      />
      <Text style={[ui.muted, { textAlign: 'right' }]}>
        {caption.length}/{CAPTION_MAX}
      </Text>

      <Text style={ui.label}>
        What are you wearing? ({itemIds.length}/{MAX_FIT_ITEMS}, optional)
      </Text>
      <ChipRow options={CATEGORIES} selected={[cat]} onToggle={setCat} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
        {owned.length ? (
          owned.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => toggleItem(item.id)}
              disabled={busy}
              accessibilityRole="checkbox"
              accessibilityLabel={item.name}
              accessibilityState={{ checked: itemIds.includes(item.id) }}
            >
              <ItemThumb item={item} size={72} badge={itemIds.includes(item.id) ? '✓' : undefined} />
            </Pressable>
          ))
        ) : (
          <Text style={[ui.muted, { padding: 12 }]}>No {cat.toLowerCase()} in your closet.</Text>
        )}
      </ScrollView>
      {names.length ? <Text style={ui.muted}>Friends will see: {names.join(' · ')}</Text> : null}

      <Text style={[ui.muted, { marginTop: 14 }]}>Only your friends can see this fit. You can delete it at any time.</Text>
      {error ? (
        <Text style={{ color: colors.danger, marginTop: 6 }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button
        title={status === 'preparing' ? 'Preparing photo…' : status === 'uploading' ? 'Sharing…' : 'Share with friends'}
        busy={busy}
        disabled={!photoUri || busy}
        onPress={share}
        style={{ marginTop: 12 }}
      />
    </ScrollView>
  );
}
