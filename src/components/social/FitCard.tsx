import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native';

import { blockUser, clearRating, type FriendFit, rateFit, reportFit, SocialError } from '../../lib/social/api';
import { cleanText, COMMENT_MAX, REACTIONS, type Reaction, REPORT_REASONS, type ReportReason, timeAgo } from '../../lib/social/rules';
import { track } from '../../lib/analytics';
import { font, useTheme } from '../../lib/theme';
import { Button, confirm } from '../ui';

const message = (e: unknown) => (e instanceof SocialError ? e.message : 'Something went wrong. Please try again.');

/** The photo of a fit, with a placeholder while it loads or if the link has expired. */
export function FitPhoto({ uri, label }: { uri?: string; label: string }) {
  const { colors, ui } = useTheme();
  const [failed, setFailed] = useState(false);
  return (
    <View style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' }}>
      {uri && !failed ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" onError={() => setFailed(true)} accessibilityLabel={label} />
      ) : failed ? (
        <Text style={ui.muted}>Photo unavailable. Pull down to refresh.</Text>
      ) : (
        <ActivityIndicator color={colors.accent} />
      )}
    </View>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.text, fontFamily: font.bodyBold, fontSize: size * 0.42 }}>{(name.trim()[0] ?? '?').toUpperCase()}</Text>
    </View>
  );
}

/**
 * A friend's fit: react with 🔥 / 👍 / 👎, add a comment, or report / block. Only the author
 * sees reactions and comments; friends only see their own.
 */
export function FitCard({
  fit,
  photoUri,
  onChange,
  onRemove,
}: {
  fit: FriendFit;
  photoUri?: string;
  onChange: (fit: FriendFit) => void;
  /** The fit should leave the feed (reported, or its author was blocked). */
  onRemove: (reason: 'reported' | 'blocked') => void;
}) {
  const { colors, ui } = useTheme();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [comment, setComment] = useState(fit.myComment ?? '');
  const [commenting, setCommenting] = useState(false);
  const [menu, setMenu] = useState<'closed' | 'open' | 'report'>('closed');

  const react = async (reaction: Reaction) => {
    if (saving) return;
    const before = fit;
    const removing = fit.myReaction === reaction;
    setError('');
    setSaving(true);
    // Show the change straight away; put it back if saving fails.
    onChange({ ...fit, myReaction: removing ? undefined : reaction, myComment: removing ? undefined : fit.myComment });
    try {
      if (removing) {
        await clearRating(fit.id);
        setComment('');
        setCommenting(false);
      } else {
        await rateFit(fit.id, reaction, fit.myComment);
        track('fit_rated', { reaction, comment: !!fit.myComment });
      }
    } catch (e) {
      onChange(before);
      setError(message(e));
    } finally {
      setSaving(false);
    }
  };

  const sendComment = async () => {
    if (saving || !fit.myReaction) return;
    const text = cleanText(comment, COMMENT_MAX);
    setError('');
    setSaving(true);
    try {
      await rateFit(fit.id, fit.myReaction, text);
      onChange({ ...fit, myComment: text });
      setCommenting(false);
      track('fit_rated', { reaction: fit.myReaction, comment: !!text });
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
    }
  };

  const report = async (reason: ReportReason) => {
    setSaving(true);
    try {
      await reportFit(fit.id, reason);
      track('fit_reported', { reason });
      onRemove('reported');
    } catch (e) {
      setError(message(e));
      setSaving(false);
    }
  };

  const block = () =>
    confirm(
      `Block ${fit.author.displayName}?`,
      async () => {
        setSaving(true);
        try {
          await blockUser(fit.author.userId);
          track('friend_blocked');
          onRemove('blocked');
        } catch (e) {
          setError(message(e));
          setSaving(false);
        }
      },
      'Block',
      'You’ll stop being friends and won’t see each other’s fits. They aren’t told.',
    );

  return (
    <View style={[ui.card, { padding: 14, gap: 12 }]}>
      <View style={[ui.row, { gap: 10 }]}>
        <Avatar name={fit.author.displayName} />
        <View style={{ flex: 1 }}>
          <Text style={[ui.body, { fontFamily: font.bodyBold }]} numberOfLines={1}>
            {fit.author.displayName}
          </Text>
          <Text style={ui.muted} numberOfLines={1}>
            @{fit.author.username} · {timeAgo(fit.createdAt)}
          </Text>
        </View>
        <Pressable
          onPress={() => setMenu((m) => (m === 'closed' ? 'open' : 'closed'))}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="More options"
          accessibilityState={{ expanded: menu !== 'closed' }}
          style={{ paddingHorizontal: 8, paddingVertical: 4 }}
        >
          <Text style={[ui.h2, { color: colors.muted }]}>···</Text>
        </Pressable>
      </View>

      {menu !== 'closed' ? (
        <View style={{ gap: 8, padding: 12, borderRadius: 16, backgroundColor: colors.chip }}>
          {menu === 'open' ? (
            <>
              <Button title="Report this fit" variant="secondary" onPress={() => setMenu('report')} />
              <Button title={`Block ${fit.author.displayName}`} variant="danger" onPress={block} />
              <Button title="Cancel" variant="secondary" onPress={() => setMenu('closed')} />
            </>
          ) : (
            <>
              <Text style={ui.body}>What’s wrong with it? It’s hidden from you straight away, and the author isn’t told who reported it.</Text>
              {REPORT_REASONS.map((r) => (
                <Button key={r.key} title={r.label} variant="secondary" onPress={() => report(r.key)} disabled={saving} />
              ))}
              <Button title="Cancel" variant="secondary" onPress={() => setMenu('closed')} />
            </>
          )}
        </View>
      ) : null}

      <FitPhoto uri={photoUri} label={`Outfit photo shared by ${fit.author.displayName}`} />
      {fit.caption ? <Text style={ui.body}>{fit.caption}</Text> : null}
      {fit.itemNames.length ? (
        <Text style={ui.muted} numberOfLines={2}>
          Wearing: {fit.itemNames.join(' · ')}
        </Text>
      ) : null}

      <View style={[ui.row, { gap: 8 }]} accessibilityRole="radiogroup" accessibilityLabel="Your reaction">
        {REACTIONS.map((r) => {
          const active = fit.myReaction === r.key;
          return (
            <Pressable
              key={r.key}
              onPress={() => react(r.key)}
              disabled={saving}
              accessibilityRole="radio"
              accessibilityLabel={r.label}
              accessibilityState={{ selected: active, disabled: saving }}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 999,
                borderWidth: 1,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 6,
                borderColor: active ? colors.accent : colors.glassBorder,
                backgroundColor: active ? colors.accentSoft : colors.glass,
              }}
            >
              <Text style={{ fontSize: 18 }}>{r.emoji}</Text>
              <Text style={[ui.body, { fontFamily: active ? font.bodyBold : font.body }]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {fit.myReaction ? (
        commenting ? (
          <View style={{ gap: 8 }}>
            <TextInput
              style={[ui.input, { minHeight: 48 }]}
              value={comment}
              onChangeText={setComment}
              placeholder="Say something nice (only they see it)"
              placeholderTextColor={colors.muted}
              maxLength={COMMENT_MAX}
              multiline
              autoFocus
              accessibilityLabel="Comment"
            />
            <View style={[ui.row, { gap: 8 }]}>
              <Button title="Cancel" variant="secondary" onPress={() => setCommenting(false)} style={{ flex: 1 }} />
              <Button title="Send" busy={saving} disabled={saving} onPress={sendComment} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setCommenting(true)} accessibilityRole="button" hitSlop={8}>
            <Text style={[ui.muted, { color: colors.accent }]}>{fit.myComment ? `“${fit.myComment}” · Edit` : '＋ Add a comment'}</Text>
          </Pressable>
        )
      ) : null}

      {error ? (
        <Text style={{ color: colors.danger }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
