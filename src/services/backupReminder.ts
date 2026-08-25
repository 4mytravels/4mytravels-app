// Backup reminders (MVP scope §2.2).
//
// Android: local notification (expo-notifications — no GMS/FCM, §2.4) that
// fires every 14 days until the user creates a backup.
// Web/PWA: notifications are unreliable (iOS needs an installed PWA + opt-in),
// so we expose `shouldNudgeBackup()` and the Settings tab shows an in-app
// reminder card instead — the documented fallback (§7 open question).
//
// Reminder state lives in app_settings: last_backup_at / next_reminder_at.

import { Platform } from 'react-native';
import { getStorageAdapter } from '../db/index';

const LAST_BACKUP_KEY = 'last_backup_at';
const NEXT_REMINDER_KEY = 'next_reminder_at';

// Every 14 days.
export const REMINDER_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

async function getSetting(key: string): Promise<string | null> {
  try {
    const rows = await getStorageAdapter().query<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      [key],
    );
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

async function setSetting(key: string, value: string): Promise<void> {
  await getStorageAdapter().exec(
    'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
    [key, value],
  );
}

/** Record that a backup was just created + schedule the next reminder. */
export async function markBackupDone(now = Date.now()): Promise<void> {
  await setSetting(LAST_BACKUP_KEY, new Date(now).toISOString());
  await setSetting(NEXT_REMINDER_KEY, String(now + REMINDER_INTERVAL_MS));
}

/** True when the in-app reminder card should be shown (web fallback). */
export async function shouldNudgeBackup(now = Date.now()): Promise<boolean> {
  const next = await getSetting(NEXT_REMINDER_KEY);
  if (!next) return true; // never backed up → nudge
  return now >= parseInt(next, 10);
}

/**
 * Schedule the recurring local notification on native. Best-effort: a missing
 * permission or unlinked module must never block the app. Returns true when a
 * (re)schedule happened.
 */
export async function scheduleBackupReminder(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return false; // web uses the in-app fallback
    // expo-notifications is NOT in the bundle right now (removed while
    // bisecting the build-#9 startup crash). When it is re-added as a
    // dependency, this guard lets the same code work unchanged: the optional
    // native-module probe skips old/missing builds silently and the dynamic
    // import keeps the package out of the Metro graph until then.
    const { requireOptionalNativeModule } = await import('expo-modules-core');
    if (!requireOptionalNativeModule('ExpoNotificationScheduler')) return false;
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const Notifications = await (new Function('return import("expo-notifications")'))() as any;
    // Re-schedule unconditionally (idempotent — replaces the previous one).
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return false;

    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
    // First trigger one interval from now, repeating weekly-ish via seconds
    // (Android supports repeating time intervals for alarms without FCM).
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: {
        title: 'Time to back up your trips',
        body: 'Create an encrypted backup so your travel data is safe.',
        sound: false,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.floor(REMINDER_INTERVAL_MS / 1000), repeats: true } as never,
    });
    return true;
  } catch {
    return false;
  }
}

const REMINDER_ID = 'backup-reminder';
