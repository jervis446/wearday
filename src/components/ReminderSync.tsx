import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';

import { syncReminders } from '../lib/reminders';
import { useSettings } from '../lib/settings';
import { useStore } from '../lib/store';

/**
 * Keeps scheduled reminders in step with the settings and the calendar (a day you've logged
 * gets no reminder), and opens "Log outfit" when a reminder is tapped. Renders nothing.
 */
export function ReminderSync() {
  const { settings, ready } = useSettings();
  const { logs, ready: storeReady } = useStore();
  const { enabled, hour, minute } = settings.reminder;
  const dates = useMemo(() => logs.map((l) => l.date).sort().join(','), [logs]);

  useEffect(() => {
    if (!ready || !storeReady) return;
    const run = () => syncReminders({ enabled, hour, minute }, new Set(dates ? dates.split(',') : []));
    const timer = setTimeout(run, 500);
    // Re-plan when the app comes back, so the 14-day window keeps rolling forward.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [ready, storeReady, enabled, hour, minute, dates]);

  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (response?.notification.request.content.data?.kind === 'reminder') {
      router.push('/log');
      Notifications.clearLastNotificationResponse?.();
    }
  }, [response]);

  return null;
}
