import { useLayoutEffect, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, View } from 'react-native';

import { colors } from '../lib/theme';
import { Item, OutfitPiece } from '../lib/types';

/** Base size of a piece as a fraction of canvas width, before its own scale. */
const BASE = 0.42;

/**
 * Collage of outfit pieces. Read-only unless onChange is given; then pieces can be
 * dragged and tapped to select. Later pieces in the array render on top.
 */
export function OutfitCanvas({
  pieces,
  items,
  size,
  onChange,
  selected,
  onSelect,
}: {
  pieces: OutfitPiece[];
  items: Item[];
  size: number;
  onChange?: (pieces: OutfitPiece[]) => void;
  selected?: number | null;
  onSelect?: (index: number | null) => void;
}) {
  return (
    <Pressable
      onPress={() => onSelect?.(null)}
      style={{
        width: size,
        height: size,
        backgroundColor: colors.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      {pieces.map((p, i) => {
        const item = items.find((it) => it.id === p.itemId);
        if (!item) return null;
        return (
          <Piece
            key={`${p.itemId}-${i}`}
            piece={p}
            item={item}
            canvas={size}
            editable={!!onChange}
            selected={selected === i}
            onSelect={() => onSelect?.(i)}
            onMove={(x, y) => onChange?.(pieces.map((q, j) => (j === i ? { ...q, x, y } : q)))}
          />
        );
      })}
    </Pressable>
  );
}

function Piece({
  piece,
  item,
  canvas,
  editable,
  selected,
  onSelect,
  onMove,
}: {
  piece: OutfitPiece;
  item: Item;
  canvas: number;
  editable: boolean;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
}) {
  const dim = canvas * BASE * piece.scale;
  const left = piece.x * canvas - dim / 2;
  const top = piece.y * canvas - dim / 2;

  // Keep latest values in a ref so the PanResponder (created once) sees fresh props.
  const latest = useRef({ piece, canvas, onMove, onSelect });
  useLayoutEffect(() => {
    latest.current = { piece, canvas, onMove, onSelect };
  });

  // The ref is only read inside gesture callbacks, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [panHandlers] = useState(() => {
    let start = { x: 0, y: 0 };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        start = { x: latest.current.piece.x, y: latest.current.piece.y };
        latest.current.onSelect();
      },
      onPanResponderMove: (_, g) => {
        const { canvas: c, onMove: move } = latest.current;
        const clamp = (v: number) => Math.min(1, Math.max(0, v));
        move(clamp(start.x + g.dx / c), clamp(start.y + g.dy / c));
      },
    }).panHandlers;
  });

  return (
    <View
      {...(editable ? panHandlers : {})}
      style={{
        position: 'absolute',
        left,
        top,
        width: dim,
        height: dim,
        borderWidth: selected ? 2 : 0,
        borderColor: colors.accent,
        borderStyle: 'dashed',
        borderRadius: 8,
      }}
    >
      <Image source={{ uri: item.imageUri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
    </View>
  );
}
