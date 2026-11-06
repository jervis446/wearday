import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { Button, ChipRow } from '../../components/ui';
import { chooseImage } from '../../lib/images';
import { useStore } from '../../lib/store';
import { colors, ui } from '../../lib/theme';
import { CATEGORIES, Category, Season, SEASONS } from '../../lib/types';

export default function EditItem() {
  const params = useLocalSearchParams<{ id?: string; wishlist?: string }>();
  const { items, saveItem } = useStore();
  const existing = params.id ? items.find((i) => i.id === params.id) : undefined;

  const [imageUri, setImageUri] = useState(existing?.imageUri ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [category, setCategory] = useState<Category>(existing?.category ?? 'Tops');
  const [brand, setBrand] = useState(existing?.brand ?? '');
  const [color, setColor] = useState(existing?.color ?? '');
  const [size, setSize] = useState(existing?.size ?? '');
  const [price, setPrice] = useState(existing?.price != null ? String(existing.price) : '');
  const [seasons, setSeasons] = useState<Season[]>(existing?.seasons ?? []);
  const [tags, setTags] = useState(existing?.tags.join(', ') ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [wishlist, setWishlist] = useState(existing?.wishlist ?? params.wishlist === '1');
  const [error, setError] = useState('');

  const save = () => {
    if (!imageUri) return setError('Add a photo first.');
    const parsedPrice = parseFloat(price.replace(',', '.'));
    saveItem({
      id: existing?.id,
      imageUri,
      name: name.trim() || category.replace(/s$/, ''),
      category,
      brand: brand.trim() || undefined,
      color: color.trim() || undefined,
      size: size.trim() || undefined,
      price: Number.isFinite(parsedPrice) ? parsedPrice : undefined,
      seasons,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      notes: notes.trim() || undefined,
      wishlist,
    });
    router.back();
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { paddingBottom: 60, maxWidth: 600, width: '100%', alignSelf: 'center' }]}>
      <Pressable
        onPress={async () => {
          const uri = await chooseImage(true);
          if (uri) {
            setImageUri(uri);
            setError('');
          }
        }}
        style={[ui.card, { aspectRatio: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }]}
      >
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={{ width: '90%', height: '90%' }} resizeMode="contain" />
        ) : (
          <Text style={ui.muted}>Tap to take or choose a photo</Text>
        )}
      </Pressable>
      {error ? <Text style={{ color: colors.danger, marginTop: 8 }}>{error}</Text> : null}

      <Text style={ui.label}>Name</Text>
      <TextInput style={ui.input} value={name} onChangeText={setName} placeholder="e.g. White linen shirt" />

      <Text style={ui.label}>Category</Text>
      <ChipRow options={CATEGORIES} selected={[category]} onToggle={(c) => setCategory(c as Category)} scroll={false} />

      <View style={[ui.row, { gap: 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={ui.label}>Brand</Text>
          <TextInput style={ui.input} value={brand} onChangeText={setBrand} placeholder="e.g. Uniqlo" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={ui.label}>Color</Text>
          <TextInput style={ui.input} value={color} onChangeText={setColor} placeholder="e.g. Navy" />
        </View>
      </View>
      <View style={[ui.row, { gap: 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={ui.label}>Size</Text>
          <TextInput style={ui.input} value={size} onChangeText={setSize} placeholder="e.g. M" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={ui.label}>Price</Text>
          <TextInput style={ui.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0.00" />
        </View>
      </View>

      <Text style={ui.label}>Seasons</Text>
      <ChipRow
        options={SEASONS}
        selected={seasons}
        onToggle={(v) =>
          setSeasons((s) => (s.includes(v as Season) ? s.filter((x) => x !== v) : [...s, v as Season]))
        }
        scroll={false}
      />

      <Text style={ui.label}>Tags (comma separated)</Text>
      <TextInput style={ui.input} value={tags} onChangeText={setTags} placeholder="work, casual, favourite" />

      <Text style={ui.label}>Notes</Text>
      <TextInput style={[ui.input, { minHeight: 70 }]} value={notes} onChangeText={setNotes} multiline />

      <View style={[ui.row, { justifyContent: 'space-between', marginTop: 16 }]}>
        <Text style={ui.body}>On wishlist (not owned yet)</Text>
        <Switch value={wishlist} onValueChange={setWishlist} />
      </View>

      <Button title={existing ? 'Save changes' : 'Add to wardrobe'} onPress={save} style={{ marginTop: 24 }} />
    </ScrollView>
  );
}
