import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ComponentProps, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { Button } from '../components/ui';
import { track } from '../lib/analytics';
import { FEATURE_REASON, type Feature, parsePeriod, PREMIUM_BENEFITS, trialLabel, yearlySavings } from '../lib/plans';
import { devPremiumAllowed, type Plan, purchasesConfigured, usePremium } from '../lib/premium';
import { font, useTheme } from '../lib/theme';

const PRIVACY_URL = 'https://jervis446.github.io/wearday/privacy.html';
const TERMS_URL =
  Platform.OS === 'ios'
    ? 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
    : 'https://jervis446.github.io/wearday/terms.html';
const STORE = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

export default function Paywall() {
  const { colors, ui } = useTheme();
  const { feature } = useLocalSearchParams<{ feature?: Feature }>();
  const premium = usePremium();
  const yearly = premium.plans.find((p) => p.id === 'yearly');
  const monthly = premium.plans.find((p) => p.id === 'monthly');
  const [selected, setSelected] = useState<'yearly' | 'monthly'>('yearly');
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    track('paywall_viewed', { feature: feature ?? 'none' });
  }, [feature]);

  const plan = (selected === 'yearly' ? yearly : monthly) ?? yearly ?? monthly;
  const trial = plan ? trialLabel(parsePeriod(plan.trialPeriod)) : null;
  const savings = yearlySavings(monthly?.price, yearly?.price);

  const buy = async () => {
    if (!plan) return;
    setBusy('buy');
    setMessage(null);
    try {
      const r = await premium.purchase(plan);
      if (r === 'purchased') {
        track('premium_purchased', { plan: plan.id, trial: !!trial, feature: feature ?? 'none' });
        router.back();
      }
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    setBusy('restore');
    setMessage(null);
    try {
      const ok = await premium.restore();
      setMessage(ok ? { text: 'Premium restored. Welcome back!' } : { text: `No Premium subscription found for this ${STORE} account.`, error: true });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(null);
    }
  };

  if (premium.isPremium && premium.source === 'store') {
    return (
      <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { gap: 14, maxWidth: 520, width: '100%', alignSelf: 'center' }]}>
        <Stack.Screen options={{ title: 'Wearday Premium' }} />
        <View style={{ alignItems: 'center', gap: 8, marginTop: 16 }}>
          <Ionicons name="checkmark-circle" size={56} color={colors.accent} />
          <Text style={ui.h1}>You’re Premium</Text>
          {premium.expiresAt ? (
            <Text style={ui.muted}>
              {premium.willRenew ? 'Renews' : 'Ends'} on {new Date(premium.expiresAt).toLocaleDateString()}
            </Text>
          ) : null}
        </View>
        <Benefits />
        {premium.managementURL ? (
          <Button title="Manage subscription" variant="secondary" onPress={() => Linking.openURL(premium.managementURL!)} />
        ) : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { gap: 14, paddingBottom: 40, maxWidth: 520, width: '100%', alignSelf: 'center' }]}>
      <Stack.Screen options={{ title: '' }} />
      <View style={{ gap: 6 }}>
        <Text style={[ui.h1, { fontSize: 40, lineHeight: 42 }]}>
          wearday{'\n'}
          <Text style={{ color: colors.pink }}>premium ✨</Text>
        </Text>
        <Text style={[ui.body, { color: colors.muted }]}>{feature && FEATURE_REASON[feature] ? FEATURE_REASON[feature] : 'Get more out of your wardrobe.'}</Text>
      </View>

      <Benefits />

      {premium.plans.length ? (
        <View style={{ gap: 10 }}>
          {[yearly, monthly].filter((p): p is Plan => !!p).map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              selected={plan?.id === p.id}
              onPress={() => setSelected(p.id)}
              badge={p.id === 'yearly' && savings ? `Save ${savings}%` : undefined}
            />
          ))}
        </View>
      ) : (
        <View style={[ui.card, { padding: 16, gap: 6 }]}>
          {!premium.ready ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={ui.body}>
              {purchasesConfigured
                ? 'Plans couldn’t be loaded. Check your connection and try again.'
                : Platform.OS === 'web'
                  ? 'Premium is available in the Wearday app for Android and iPhone.'
                  : 'Purchases aren’t set up in this build yet.'}
            </Text>
          )}
        </View>
      )}

      {plan ? (
        <Button
          title={busy === 'buy' ? 'Opening…' : trial ? `Start ${trial}` : `Subscribe for ${plan.priceString}/${plan.id === 'yearly' ? 'year' : 'month'}`}
          onPress={busy ? () => {} : buy}
        />
      ) : null}
      {plan ? (
        <Text style={[ui.muted, { textAlign: 'center' }]}>
          {trial ? `${trial}, then ${plan.priceString}/${plan.id === 'yearly' ? 'year' : 'month'}. ` : ''}
          Renews automatically until you cancel. Cancel any time in {STORE}, at least 24 hours before the renewal date.
        </Text>
      ) : null}
      {message ? <Text style={{ color: message.error ? colors.danger : colors.accent, textAlign: 'center' }}>{message.text}</Text> : null}

      <View style={[ui.row, { justifyContent: 'center', gap: 18, flexWrap: 'wrap' }]}>
        {purchasesConfigured ? (
          <Pressable onPress={busy ? undefined : restore} hitSlop={8}>
            <Text style={[ui.body, { color: colors.accent }]}>{busy === 'restore' ? 'Restoring…' : 'Restore purchases'}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8}>
          <Text style={ui.muted}>Terms</Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={8}>
          <Text style={ui.muted}>Privacy</Text>
        </Pressable>
      </View>

      {devPremiumAllowed ? <DevSwitch /> : null}
    </ScrollView>
  );
}

function Benefits() {
  const { colors, ui } = useTheme();
  return (
    <View style={[ui.card, { padding: 16, gap: 14 }]}>
      {PREMIUM_BENEFITS.map((b) => (
        <View key={b.title} style={[ui.row, { gap: 12, alignItems: 'flex-start' }]}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={b.icon as ComponentProps<typeof Ionicons>['name']} size={18} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[ui.body, { fontFamily: font.bodyBold }]}>{b.title}</Text>
            <Text style={ui.muted}>{b.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function PlanCard({ plan, selected, onPress, badge }: { plan: Plan; selected: boolean; onPress: () => void; badge?: string }) {
  const { colors, ui } = useTheme();
  const trial = trialLabel(parsePeriod(plan.trialPeriod));
  const perMonth = plan.id === 'yearly' && plan.pkg?.product.pricePerMonthString;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[
        ui.card,
        { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderColor: selected ? colors.accent : colors.border },
      ]}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: selected ? colors.accent : colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[ui.body, { fontFamily: font.bodyBold }]}>{plan.id === 'yearly' ? 'Yearly' : 'Monthly'}</Text>
        <Text style={ui.muted}>
          {plan.id === 'yearly' ? (perMonth ? `${perMonth}/month, billed yearly` : 'Billed yearly') : 'Billed monthly'}
          {trial ? ` · ${trial}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {badge ? (
          <View style={{ backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: colors.accentText, fontSize: 11, fontFamily: font.bodyBold }}>{badge}</Text>
          </View>
        ) : null}
        <Text style={[ui.body, { fontFamily: font.bodyBold }]}>{plan.priceString}</Text>
      </View>
    </Pressable>
  );
}

function DevSwitch() {
  const { colors, ui } = useTheme();
  const { devPremium, setDevPremium } = usePremium();
  return (
    <View style={[ui.card, { padding: 12, gap: 6, borderStyle: 'dashed' }]}>
      <View style={[ui.row, { justifyContent: 'space-between' }]}>
        <Text style={ui.body}>Developer: simulate Premium</Text>
        <Switch value={devPremium} onValueChange={setDevPremium} trackColor={{ true: colors.accent }} thumbColor={colors.card} />
      </View>
      <Text style={ui.muted}>Only in development builds, for testing. Not shown to users.</Text>
    </View>
  );
}
