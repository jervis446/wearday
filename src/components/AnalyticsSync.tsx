import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { identifyUser, resetAnalytics, setAnalyticsEnabled, track, trackScreen } from '../lib/analytics';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';

/** Applies the analytics setting, links sign-ins to the anonymous account id, and records screens. */
export function AnalyticsSync() {
  const { settings, ready } = useSettings();
  const { session } = useAuth();
  const pathname = usePathname();
  const lastUser = useRef<string | null>(null);

  useEffect(() => {
    if (ready) setAnalyticsEnabled(settings.analytics);
  }, [ready, settings.analytics]);

  useEffect(() => {
    const uid = session?.user.id ?? null;
    if (uid && uid !== lastUser.current) {
      identifyUser(uid);
      if (lastUser.current === null) track('signed_in', { method: String(session?.user.app_metadata?.provider ?? 'email') });
    } else if (!uid && lastUser.current) {
      resetAnalytics();
    }
    lastUser.current = uid;
  }, [session]);

  useEffect(() => {
    if (ready && settings.analytics) trackScreen(pathname);
  }, [pathname, ready, settings.analytics]);

  return null;
}
