import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button, tap } from './ui';
import { logError } from '../lib/diagnostics';
import { buyWithNoha, canAfford, fetchWallet, fetchWeardayProducts, type NohaProduct, type NohaTxn, rupees, type Wallet } from '../lib/noha';
import { usePremium } from '../lib/premium';
import { font, useTheme } from '../lib/theme';

const APP_LABEL: Record<string, string> = { asanoha: 'Asanoha', wearday: 'Wearday' };

function useWallet() {
  const [state, setState] = useState<{ wallet: Wallet; txns: NohaTxn[] } | null>(null);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const load = useCallback(async () => {
    try {
      setState(await fetchWallet());
      setError('');
    } catch (e) {
      // The wallet tables aren't on this server yet: hide Noha Money instead of showing an error.
      if (/PGRST20[25]|could not find|does not exist/i.test(`${(e as { code?: string }).code} ${(e as Error).message}`)) return setUnavailable(true);
      logError('noha wallet', e);
      setError('Couldn’t load Noha Money. Check your connection.');
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads remote state once
    load();
  }, [load]);
  return { ...state, error, unavailable, reload: load };
}

/** The "by asanoha" wordmark, kept small and quiet. */
export function ByAsanoha({ color }: { color?: string }) {
  const { colors } = useTheme();
  return (
    <Text style={{ fontFamily: font.bodyMedium, fontSize: 11, letterSpacing: 1.6, color: color ?? colors.muted, textTransform: 'lowercase' }}>
      by <Text style={{ fontFamily: font.display, letterSpacing: 0.4 }}>asanoha</Text>
    </Text>
  );
}

/** Balance and recent activity (from every Asanoha app) for the account screen. */
export function NohaWalletCard() {
  const { colors, ui } = useTheme();
  const { wallet, txns, error, unavailable } = useWallet();
  if (unavailable) return null;
  return (
    <View style={[ui.card, { padding: 18, gap: 10, marginBottom: 10 }]}>
      <View style={[ui.row, { justifyContent: 'space-between' }]}>
        <Text style={ui.h2}>Noha Money</Text>
        <ByAsanoha />
      </View>
      {error ? <Text style={[ui.muted, { color: colors.danger }]}>{error}</Text> : null}
      {!wallet && !error ? <ActivityIndicator color={colors.accent} /> : null}
      {wallet ? (
        <>
          <Text style={[ui.h1, { fontSize: 36 }]}>{rupees(wallet.total)}</Text>
          <Text style={ui.muted}>
            {wallet.bonus ? `Includes ${rupees(wallet.bonus)} cashback. ` : ''}One wallet for Wearday and Asanoha.
            {wallet.nextExpiry ? ` Some of it expires on ${new Date(wallet.nextExpiry).toLocaleDateString()}.` : ''}
          </Text>
          {txns?.length ? (
            <View style={{ gap: 8, marginTop: 4 }}>
              {txns.slice(0, 6).map((t) => (
                <View key={t.id} style={[ui.row, { gap: 10 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={ui.body} numberOfLines={1}>
                      {t.description}
                    </Text>
                    <Text style={ui.muted}>
                      {APP_LABEL[t.app] ?? t.app} · {new Date(t.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={[ui.body, { fontFamily: font.bodyBold, color: t.amount_paise > 0 ? colors.accent : colors.text }]}>
                    {t.amount_paise > 0 ? '+' : '−'}
                    {rupees(Math.abs(t.amount_paise))}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={ui.muted}>No activity yet.</Text>
          )}
        </>
      ) : null}
    </View>
  );
}

/** "Pay with Noha Money" block on the paywall (only where nohaPayEnabled). */
export function PayWithNoha({ onDone }: { onDone: () => void }) {
  const { colors, ui } = useTheme();
  const { wallet, error, unavailable, reload } = useWallet();
  const { refreshServer } = usePremium();
  const [products, setProducts] = useState<NohaProduct[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetchWeardayProducts().then(setProducts, (e) => logError('noha products', e));
  }, []);

  const buy = async (p: NohaProduct) => {
    setBusy(p.id);
    setMsg('');
    try {
      await buyWithNoha(p.id);
      tap();
      await refreshServer();
      await reload();
      onDone();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!products.length || unavailable) return null;
  return (
    <View style={[ui.card, { padding: 18, gap: 10 }]}>
      <View style={[ui.row, { justifyContent: 'space-between' }]}>
        <Text style={ui.h2}>Pay with Noha Money</Text>
        <ByAsanoha />
      </View>
      <Text style={ui.muted}>
        {wallet ? `Your balance: ${rupees(wallet.total)}. ` : error ? `${error} ` : ''}Cashback can cover up to {products[0].max_bonus_pct}% of the price. No
        auto-renewal: you pay once for the time you choose.
      </Text>
      {products.map((p) => (
        <Button
          key={p.id}
          title={`${p.name.replace('Wearday Premium · ', '')} · ${rupees(p.price_paise)}`}
          variant={wallet && canAfford(wallet, p) ? 'primary' : 'secondary'}
          busy={busy === p.id}
          onPress={() => (busy ? undefined : buy(p))}
        />
      ))}
      {msg ? <Text style={[ui.body, { color: colors.danger }]}>{msg}</Text> : null}
    </View>
  );
}
