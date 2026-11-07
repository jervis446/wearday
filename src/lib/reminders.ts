import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { planReminders, reminderBody } from './reminderPlan';

/** Daily "log your outfit" reminders, scheduled as local notifications (nothing is sent to a server). */

export const remindersSupported = Platform.OS !== 'web';
const PREFIX = 'wearday-reminder-';
const CHANNEL = 'reminders';

if (remindersSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

/** Asks for notification permission if needed. Returns whether reminders can be shown. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!remindersSupported) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Daily outfit reminder',
      importance: AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/**
 * Replaces all scheduled reminders with the next 14 days at the chosen time,
 * skipping days that are already logged. Safe to call often.
 */
export async function syncReminders(
  reminder: { enabled: boolean; hour: number; minute: number },
  loggedDates: Set<string>,
): Promise<number> {
  if (!remindersSupported) return 0;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled.filter((n) => n.identifier.startsWith(PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
    if (!reminder.enabled) return 0;
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return 0;

    const dates = planReminders(new Date(), reminder.hour, reminder.minute, loggedDates);
    for (const date of dates) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${PREFIX}${date.toISOString().slice(0, 10)}`,
        content: { title: 'What are you wearing today? 👕', body: reminderBody(date), data: { kind: 'reminder' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL },
      });
    }
    return dates.length;
  } catch {
    return 0;
  }
}
