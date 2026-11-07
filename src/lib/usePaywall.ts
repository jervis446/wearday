import { router } from 'expo-router';

import type { Feature } from './plans';

/** Opens the paywall, explaining which feature led there. */
export function openPaywall(feature?: Feature) {
  router.push({ pathname: '/paywall', params: feature ? { feature } : {} });
}
