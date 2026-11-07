import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { CustomerInfo, LOG_LEVEL, PurchasesPackage } from 'react-native-purchases';

import { useAuth } from './auth';

/**
 * Premium status and purchases via RevenueCat (Google Play Billing + Apple In-App Purchase).
 * Set EXPO_PUBLIC_REVENUECAT_ANDROID_KEY / EXPO_PUBLIC_REVENUECAT_IOS_KEY (public SDK keys).
 * When signed in, purchases are tied to the Supabase user id so Premium follows the account.
 */
const ENTITLEMENT = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT || 'premium';
const apiKey = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  default: undefined,
});

export const purchasesConfigured = !!apiKey;

/** Development only: sample prices so the paywall layout can be checked where the store isn't available. */
const PREVIEW_PLANS: Plan[] =
  __DEV__ && process.env.EXPO_PUBLIC_PAYWALL_PREVIEW === '1' && !apiKey
    ? [
        { id: 'yearly', pkg: null, priceString: '₹599.00', price: 599, trialPeriod: 'P7D' },
        { id: 'monthly', pkg: null, priceString: '₹99.00', price: 99, trialPeriod: null },
      ]
    : [];
/** Development builds only: lets you try Premium features without paying. */
export const devPremiumAllowed = __DEV__;
const DEV_KEY = 'wearday/dev-premium';

export type Plan = {
  id: 'monthly' | 'yearly';
  pkg: PurchasesPackage | null;
  priceString: string;
  price: number;
  /** ISO period of the free trial, e.g. "P7D", if any. */
  trialPeriod: string | null;
};

type Ctx = {
  ready: boolean;
  isPremium: boolean;
  /** Why the user is premium: a store purchase or the dev switch. */
  source: 'store' | 'dev' | null;
  expiresAt: string | null;
  willRenew: boolean;
  managementURL: string | null;
  plans: Plan[];
  purchase: (plan: Plan) => Promise<'purchased' | 'cancelled'>;
  restore: () => Promise<boolean>;
  setDevPremium: (on: boolean) => void;
  devPremium: boolean;
};

const PremiumCtx = createContext<Ctx | null>(null);
let configured = false;

function planFrom(pkg: PurchasesPackage): Plan | null {
  const id = pkg.packageType === 'MONTHLY' ? 'monthly' : pkg.packageType === 'ANNUAL' ? 'yearly' : null;
  if (!id) return null;
  const p = pkg.product;
  const trial =
    p.introPrice && p.introPrice.price === 0
      ? `P${p.introPrice.periodNumberOfUnits}${p.introPrice.periodUnit[0]}`
      : (p.defaultOption?.freePhase?.billingPeriod?.iso8601 ?? null);
  return { id, pkg, priceString: p.priceString, price: p.price, trialPeriod: trial };
}

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [info, setInfo] = useState<CustomerInfo | null>(null);
  const [plans, setPlans] = useState<Plan[]>(PREVIEW_PLANS);
  const [ready, setReady] = useState(!purchasesConfigured);
  const [devPremium, setDevPremiumState] = useState(false);

  useEffect(() => {
    if (!devPremiumAllowed) return;
    AsyncStorage.getItem(DEV_KEY).then((v) => setDevPremiumState(v === '1'));
  }, []);

  // Configure once, then keep the identity in step with sign-in.
  useEffect(() => {
    if (!purchasesConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        if (!configured) {
          if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
          Purchases.configure({ apiKey: apiKey!, appUserID: uid ?? undefined });
          configured = true;
          Purchases.addCustomerInfoUpdateListener((ci) => setInfo(ci));
        } else if (uid) {
          await Purchases.logIn(uid);
        } else if (!(await Purchases.isAnonymous())) {
          await Purchases.logOut();
        }
        const [ci, offerings] = await Promise.all([Purchases.getCustomerInfo(), Purchases.getOfferings()]);
        if (cancelled) return;
        setInfo(ci);
        setPlans((offerings.current?.availablePackages ?? []).map(planFrom).filter((p): p is Plan => !!p));
      } catch {
        // Offline or store unavailable: keep the last known state; purchases show an error when tried.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const entitlement = info?.entitlements.active[ENTITLEMENT];
  const storePremium = !!entitlement;
  const isPremium = storePremium || (devPremiumAllowed && devPremium);

  const purchase = useCallback(async (plan: Plan) => {
    if (!plan.pkg) throw new Error('This plan isn’t available right now.');
    try {
      const { customerInfo } = await Purchases.purchasePackage(plan.pkg);
      setInfo(customerInfo);
      return customerInfo.entitlements.active[ENTITLEMENT] ? 'purchased' : 'cancelled';
    } catch (e) {
      if ((e as { userCancelled?: boolean }).userCancelled) return 'cancelled';
      throw new Error((e as Error).message || 'The purchase didn’t go through. You haven’t been charged.');
    }
  }, []);

  const restore = useCallback(async () => {
    const ci = await Purchases.restorePurchases();
    setInfo(ci);
    return !!ci.entitlements.active[ENTITLEMENT];
  }, []);

  const setDevPremium = useCallback((on: boolean) => {
    setDevPremiumState(on);
    AsyncStorage.setItem(DEV_KEY, on ? '1' : '0').catch(() => {});
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      ready,
      isPremium,
      source: storePremium ? 'store' : isPremium ? 'dev' : null,
      expiresAt: entitlement?.expirationDate ?? null,
      willRenew: !!entitlement?.willRenew,
      managementURL: info?.managementURL ?? null,
      plans,
      purchase,
      restore,
      setDevPremium,
      devPremium,
    }),
    [ready, isPremium, storePremium, entitlement, info, plans, purchase, restore, setDevPremium, devPremium],
  );
  return <PremiumCtx.Provider value={value}>{children}</PremiumCtx.Provider>;
}

export function usePremium() {
  const ctx = useContext(PremiumCtx);
  if (!ctx) throw new Error('usePremium must be used inside PremiumProvider');
  return ctx;
}
