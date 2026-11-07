import { todayKey } from './types.ts';

/**
 * Which moments to send the "log your outfit" reminder: the chosen time on each of the
 * next `days` days, skipping days that already have an entry and times already past.
 * Pure, so it can be unit tested.
 */
export function planReminders(now: Date, hour: number, minute: number, logged: Set<string>, days = 14): Date[] {
  const out: Date[] = [];
  for (let d = 0; d < days; d++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, hour, minute, 0, 0);
    if (at.getTime() <= now.getTime() + 30_000) continue;
    if (logged.has(todayKey(at))) continue;
    out.push(at);
  }
  return out;
}

const BODIES = [
  'Log today’s outfit to keep your stats and suggestions sharp.',
  'Snap a quick outfit selfie — future you will love the archive.',
  'What did you pick today? It takes five seconds to log.',
  'Keep your streak going: log today’s outfit.',
];

/** A rotating message so the reminder doesn't feel robotic. */
export function reminderBody(date: Date): string {
  return BODIES[date.getDate() % BODIES.length];
}

/** "08:30" → shifted by `step` minutes, wrapping around midnight. */
export function shiftTime(hour: number, minute: number, step: number): { hour: number; minute: number } {
  const total = (((hour * 60 + minute + step) % 1440) + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}
