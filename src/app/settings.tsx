import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Switch, Text, View } from 'react-native';

import { Button, ChipRow, Section } from '../components/ui';
import { analyticsConfigured, track } from '../lib/analytics';
import { exportBackup, pickBackup, restorePhotos } from '../lib/backup';
import { canRemoveBackground } from '../lib/cutout';
import { CURRENCIES } from '../lib/moneyFormat';
import { shiftTime } from '../lib/reminderPlan';
import { ensureNotificationPermission, remindersSupported } from '../lib/reminders';
import { deviceCurrency, ThemePref, useSettings } from '../lib/settings';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';
import { supabaseConfigured } from '../lib/supabase';
import { useSync } from '../lib/sync/SyncProvider';
import { useTheme } from '../lib/theme';

const THEMES: Record<string, ThemePref> = { 'Match phone': 'system', Light: 'light', Dark: 'dark' };

function ask(title: string, message: string, ok: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(!!globalThis.confirm?.(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export default function SettingsScreen() {
  const { colors, ui } = useTheme();
  const { settings, update, replace } = useSettings();
  const store = useStore();
  const { session } = useAuth();
  const { status: syncStatus } = useSync();
  const [busy, setBusy] = useState<'' | 'export' | 'import'>('');
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [canCutout, setCanCutout] = useState<boolean | null>(null);
  useEffect(() => {
    canRemoveBackground().then(setCanCutout);
  }, []);
  const [notifDenied, setNotifDenied] = useState(false);
  const r = settings.reminder;
  const timeLabel = new Date(2000, 0, 1, r.hour, r.minute).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const setReminder = (patch: Partial<typeof r>) => update({ reminder: { ...r, ...patch } });
  const toggleReminder = async (on: boolean) => {
    if (on && !(await ensureNotificationPermission())) {
      setNotifDenied(true);
      return;
    }
    setNotifDenied(false);
    setReminder({ enabled: on });
  };
  const themeLabel = Object.keys(THEMES).find((k) => THEMES[k] === settings.theme)!;

  const doExport = async () => {
    setBusy('export');
    setStatus(null);
    try {
      const { photos, missing } = await exportBackup(
        { items: store.items, outfits: store.outfits, logs: store.logs, trips: store.trips, collections: store.collections },
        settings,
      );
      update({ lastBackupAt: new Date().toISOString() });
      track('backup_exported', { photos });
      setStatus({
        text: `Backup created with ${photos} photo${photos === 1 ? '' : 's'}.` + (missing ? ` ${missing} photo(s) couldn’t be read and were skipped.` : ''),
      });
    } catch (e) {
      setStatus({ text: (e as Error).message, error: true });
    } finally {
      setBusy('');
    }
  };

  const doImport = async () => {
    setStatus(null);
    try {
      setBusy('import');
      const backup = await pickBackup();
      if (!backup) return;
      const { db, exportedAt } = { db: backup.data.db, exportedAt: backup.data.exportedAt };
      const ok = await ask(
        'Restore this backup?',
        `It has ${db.items.length} items, ${db.outfits.length} outfits and ${db.logs.length} calendar entries from ${exportedAt.slice(0, 10)}. ` +
          'Everything currently in the app will be replaced.',
        'Restore',
      );
      if (!ok) return;
      const restored = await restorePhotos(backup);
      store.replaceAll(restored);
      track('backup_restored', { items: db.items.length });
      replace({ ...backup.data.settings, lastBackupAt: settings.lastBackupAt });
      setStatus({ text: `Restored ${db.items.length} items, ${db.outfits.length} outfits and ${db.logs.length} calendar entries.` });
    } catch (e) {
      setStatus({ text: (e as Error).message, error: true });
    } finally {
      setBusy('');
    }
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { gap: 8, maxWidth: 600, width: '100%', alignSelf: 'center' }]}>
      {supabaseConfigured ? (
        <Section title="Account & sync">
          <Text style={ui.muted}>
            {session
              ? `Signed in as ${session.user.email ?? 'you'} · ${syncStatus.state === 'syncing' ? 'syncing…' : syncStatus.state === 'idle' ? 'up to date' : syncStatus.state === 'off' ? 'starting…' : 'will retry'}`
              : 'Sign in to back up your wardrobe and use it on more than one phone.'}
          </Text>
          <Button title={session ? 'Manage account' : 'Sign in'} variant={session ? 'secondary' : 'primary'} onPress={() => router.push('/account')} />
        </Section>
      ) : null}

      <Section title="Appearance">
        <ChipRow options={Object.keys(THEMES)} selected={[themeLabel]} onToggle={(k) => update({ theme: THEMES[k] })} scroll={false} />
      </Section>

      <Section title="Daily reminder">
        {remindersSupported ? (
          <>
            <View style={[ui.row, { justifyContent: 'space-between', gap: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={ui.body}>Remind me to log my outfit</Text>
                <Text style={ui.muted}>Skipped on days you’ve already logged.</Text>
              </View>
              <Switch value={r.enabled} onValueChange={toggleReminder} trackColor={{ true: colors.accent }} thumbColor={colors.card} />
            </View>
            {r.enabled ? (
              <View style={[ui.row, { gap: 12, justifyContent: 'center' }]}>
                <Button title="−" variant="secondary" onPress={() => setReminder(shiftTime(r.hour, r.minute, -15))} />
                <Text style={[ui.h2, { minWidth: 100, textAlign: 'center' }]}>{timeLabel}</Text>
                <Button title="+" variant="secondary" onPress={() => setReminder(shiftTime(r.hour, r.minute, 15))} />
              </View>
            ) : null}
            {notifDenied ? (
              <Text style={{ color: colors.danger }}>
                Notifications are turned off for Wearday. Turn them on in your phone’s settings, then try again.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={ui.muted}>Reminders work in the phone app, not in the browser.</Text>
        )}
      </Section>

      <Section title="Currency">
        <ChipRow
          options={[`Auto (${deviceCurrency()})`, ...CURRENCIES]}
          selected={[settings.currency === 'auto' ? `Auto (${deviceCurrency()})` : settings.currency]}
          onToggle={(c) => update({ currency: c.startsWith('Auto') ? 'auto' : c })}
          scroll={false}
        />
        <Text style={ui.muted}>Only changes how prices are shown; amounts aren’t converted.</Text>
      </Section>

      <Section title="Photos">
        {canCutout ? (
          <View style={[ui.row, { justifyContent: 'space-between', gap: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={ui.body}>Remove backgrounds automatically</Text>
              <Text style={ui.muted}>Cuts clothes out of new photos, on your phone. You can switch back to the original.</Text>
            </View>
            <Switch
              value={settings.autoRemoveBackground}
              onValueChange={(v) => update({ autoRemoveBackground: v })}
              trackColor={{ true: colors.accent }}
              thumbColor={colors.card}
            />
          </View>
        ) : canCutout === false ? (
          <Text style={ui.muted}>
            Background removal works in the installed app on Android, and on iPhones with iOS 17 or later. It isn’t available
            in Expo Go or the browser.
          </Text>
        ) : null}
      </Section>

      {analyticsConfigured ? (
        <Section title="Privacy">
          <View style={[ui.row, { justifyContent: 'space-between', gap: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={ui.body}>Share anonymous usage data</Text>
              <Text style={ui.muted}>
                Which features get used, so we can improve Wearday. Never your photos, item names or email.
              </Text>
            </View>
            <Switch
              value={settings.analytics}
              onValueChange={(v) => update({ analytics: v })}
              trackColor={{ true: colors.accent }}
              thumbColor={colors.card}
            />
          </View>
        </Section>
      ) : null}

      <Section title="Backup">
        <Text style={ui.muted}>
          Your wardrobe is stored only on this phone. Export a backup now and then and save it to Google Drive, iCloud or
          your computer, so you can restore it on a new phone.
        </Text>
        <Text style={ui.muted}>
          {settings.lastBackupAt ? `Last backup: ${new Date(settings.lastBackupAt).toLocaleDateString()}` : 'No backup yet.'}
        </Text>
        <Button title={busy === 'export' ? 'Creating backup…' : 'Export backup'} onPress={busy ? () => {} : doExport} />
        <Button title={busy === 'import' ? 'Restoring…' : 'Restore from backup'} variant="secondary" onPress={busy ? () => {} : doImport} />
        {busy ? <ActivityIndicator color={colors.accent} /> : null}
        {status ? <Text style={[ui.body, { color: status.error ? colors.danger : colors.text }]}>{status.text}</Text> : null}
      </Section>
    </ScrollView>
  );
}
