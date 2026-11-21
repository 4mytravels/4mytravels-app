import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NavFadeScrim } from '../../src/components/FadeScrim';
import { WebNotices } from '../../src/components/WebNotices';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { colors, fontFamily, radius, fontSize, spacing, themedStyles } from '../../src/theme/theme';
import { Card, SectionTitle, Button, IconButton, FilterChip } from '../../src/components/ui';
import { useThemeMode } from '../../src/theme/ThemeProvider';
import { THEME_MODES, THEME_MODE_LABEL } from '../../src/theme/themeMode';
import {
  createBackup,
  parseBackupEnvelope,
  decryptBackup,
  InvalidBackupFileError,
  BackupPassphraseError,
  MIN_PASSPHRASE_LENGTH,
  type BackupEnvelope,
} from '../../src/db/backup';
import { saveBackup } from '../../src/services/saveBackup';
import { markBackupDone, shouldNudgeBackup, scheduleBackupReminder } from '../../src/services/backupReminder';
import { saveTrip } from '../../src/db/tripRepo';
import type { Expense } from '../../src/types';
import { saveExpense, loadExpensesForList } from '../../src/db/expenseRepo';
import { useExpenseStore } from '../../src/store/expenseStore';
import { syncCoverThumbs } from '../../src/utils/coverThumbs';
import { readPickedDocumentText } from '../../src/utils/readPickedDocument';
import { showStatus } from '../../src/utils/statusDialog';
import {
  disableBiometric,
  isBiometricAvailable,
  isBiometricEnrolled,
} from '../../src/db/web/biometric';
import { enrollBiometricForSession } from '../../src/db/web/biometricSession';
import {
  DEVICE_AUTH_SUPPORTED,
  authenticateDevice,
  getDeviceAuthCapability,
  readAppLockEnabled,
  writeAppLockEnabled,
} from '../../src/services/deviceAuth';
import { lockUnavailableReason } from '../../src/utils/appLock';
import { useTripStore } from '../../src/store/tripStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { CURRENCIES as SHARED_CURRENCIES } from '../../src/data/currencies';
import { expensesToCsv } from '../../src/services/csv';
// AUTO_TRIP = "import without choosing a trip, create it from the file".
// It lives in the shared import service so this screen and the web share-target
// path can never disagree about what the sentinel means.
import { AUTO_TRIP, importExpensesFromCsv } from '../../src/services/csvImport';

// Repository links for Source code and Report an issue in Settings → About.
const SOURCE_CODE_URL = 'https://github.com/4mytravels/4mytravels-app';
const ISSUES_URL = 'https://github.com/4mytravels/4mytravels-app/issues';
// Privacy statement lives on the marketing site, not in the PWA bundle, so a
// change to the statement never requires an app release. /privacy redirects to
// /privacy/ on the site (nginx auto-index), so the short form is safe.
const PRIVACY_URL = 'https://4mytravels.app/privacy';
const WEBSITE_URL = 'https://4mytravels.app';

const CURRENCIES = SHARED_CURRENCIES;

export default function SettingsScreen() {
  // The floating nav overlaps the bottom of this screen, so the scroll content
  // must clear it: nav height (60) + nav gap (18) + breathing room.
  const insets = useSafeAreaInsets();
  const { mode: themeMode, setMode: setThemeMode } = useThemeMode();
  const setTrips = useTripStore((s) => s.setTrips);
  const manualRates = useSettingsStore((s) => s.manualRates);
  const setManualRate = useSettingsStore((s) => s.setManualRate);
  const defaultHomeCurrency = useSettingsStore((s) => s.defaultHomeCurrency);
  const setDefaultHomeCurrency = useSettingsStore((s) => s.setDefaultHomeCurrency);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const trips = useTripStore((s) => s.trips);
  const homeCurrency = trips[0]?.homeCurrency ?? 'EUR';
  const [mode, setMode] = useState<null | 'backup' | 'restore'>(null);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  // Restore: the picked + validated file, kept across wrong-passphrase retries.
  const [restoreFile, setRestoreFile] = useState<{ envelope: BackupEnvelope; name: string } | null>(null);
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importTargetTrip, setImportTargetTrip] = useState<string | null>(null);
  // 'auto' = no trip selected: a trip is created from the dates in the file
  // (name from the export's trip_name, otherwise "import-trip1").
  const importAuto = importTargetTrip === AUTO_TRIP;
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  // Web only: biometric unlock (WebAuthn PRF).
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnrolled, setBioEnrolled] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setBioEnrolled(isBiometricEnrolled());
    void isBiometricAvailable().then(setBioAvailable);
  }, []);
  const toggleBiometric = async () => {
    if (bioEnrolled) {
      disableBiometric();
      setBioEnrolled(false);
      return;
    }
    try {
      await enrollBiometricForSession();
      setBioEnrolled(true);
    } catch (e) {
      showStatus(
        'Biometric unlock unavailable',
        e instanceof Error && e.name === 'BiometricUnsupported'
          ? e.message
          : 'Setup was cancelled. You can try again.',
      );
    }
  };
  // Native only: app lock via expo-local-authentication (biometrics or device
  // PIN/password). NOT a passkey. UI lock; the Keystore DB key is unchanged.
  const [appLockOn, setAppLockOn] = useState(false);
  useEffect(() => {
    if (!DEVICE_AUTH_SUPPORTED) return;
    void readAppLockEnabled().then(setAppLockOn).catch(() => {});
  }, []);
  const toggleAppLock = async () => {
    if (appLockOn) {
      // Turning it off also requires the owner, or anyone holding the unlocked phone could.
      if (!(await authenticateDevice('Confirm to turn off the app lock'))) return;
      await writeAppLockEnabled(false);
      setAppLockOn(false);
      return;
    }
    const reason = lockUnavailableReason(await getDeviceAuthCapability());
    if (reason) { showStatus('App lock unavailable', reason); return; }
    if (!(await authenticateDevice('Confirm to turn on the app lock'))) {
      showStatus('App lock not enabled', 'Authentication was cancelled. You can try again.');
      return;
    }
    await writeAppLockEnabled(true);
    setAppLockOn(true);
  };
  const [currencyQuery, setCurrencyQuery] = useState('');

  useEffect(() => {
    void hydrateSettings();
    // Schedule the recurring local notification on native (no-op on web) and
    // evaluate the in-app nudge fallback.
    void scheduleBackupReminder();
    void shouldNudgeBackup().then(setNudge);
  }, [hydrateSettings]);

  const close = () => {
    setMode(null);
    setPassphrase('');
    setPassphraseError(null);
    setRestoreFile(null);
    setBusy(false);
  };

  // ---- CSV export: one trip, or everything as multiple per-trip files ----
  const shareCsv = async (csv: string, filename: string) => {
    const file = new File(Paths.cache, filename);
    await file.write(csv);
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export expenses' });
  };

  const exportSingleTrip = async (tripId: string) => {
    const trip = trips.find((t) => t.id === tripId);
    if (!trip) return;
    try {
      const list = await loadExpensesForList(tripId);
      if (list.length === 0) {
        showStatus('Nothing to export', 'This trip has no expenses yet.');
        return;
      }
      const csv = expensesToCsv(list, { [trip.id]: trip.name });
      const safeName = trip.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      await shareCsv(csv, `4mt-expenses-${safeName || 'trip'}.csv`);
      setExportOpen(false);
    } catch (e) {
      showStatus('Export failed', e instanceof Error ? e.message : String(e));
    }
  };

  const exportAllTrips = async () => {
    try {
      // ONE share sheet, ONE file. The old loop fired one system share dialog
      // per trip, so "all trips" meant picking N files one by one. All trips
      // are combined into a single CSV — the format already carries
      // trip_id + trip_name per row, so nothing is lost.
      const all: Array<{ trip: (typeof trips)[number]; list: Expense[] }> = [];
      for (const t of trips) {
        const list = await loadExpensesForList(t.id);
        if (list.length > 0) all.push({ trip: t, list });
      }
      if (all.length === 0) {
        showStatus('Nothing to export', 'No trips with expenses found.');
        setExportOpen(false);
        return;
      }
      const merged = all.flatMap(({ trip, list }) => list);
      const names: Record<string, string> = {};
      for (const { trip } of all) names[trip.id] = trip.name;
      const csv = expensesToCsv(merged, names);
      await shareCsv(csv, `4mt-expenses-all-${all.length}-trips.csv`);
      setExportOpen(false);
    } catch (e) {
      showStatus('Export failed', e instanceof Error ? e.message : String(e));
    }
  };

  // ---- CSV import: own format or TravelSpend, with or without a target trip ----
  // The parsing + trip resolution + saving all live in src/services/csvImport.ts
  // so this path and the web share-target path (Delen → 4MyTravels) cannot drift.
  const doCsvImport = async () => {
    if (!importTargetTrip) return;
    setBusy(true);
    try {
      // 'text/csv' alone misses many file managers / downloads (Android mime
      // matching is unreliable); accept the common CSV variants explicitly.
      // SDK 57 result shape: { canceled, assets: [{ uri, ... }] } — the old
      // top-level `uri` no longer exists, which silently aborted imports.
      const doc = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'application/vnd.ms-excel', 'text/plain', '*/*'],
        copyToCacheDirectory: false,
      });
      const picked = doc.canceled ? null : doc.assets?.[0];
      if (!picked || typeof picked.uri !== 'string') { setBusy(false); return; }
      // Cross-platform read: web uses the picker's original File object
      // (asset.file) because a blob: URL is not fetchable under COEP; native
      // uses expo-file-system. See src/utils/readPickedDocument.ts.
      //
      // KNOWN LIMIT (2026-10-28): on Android a file picked from a CLOUD provider
      // (Proton Drive, Dropbox, …) is a content:// PROXY that Chrome cannot
      // read — every read path throws NotReadableError. No code change fixes
      // that; the file must be shared instead ("Delen → 4MyTravels", handled by
      // the service worker + SharedImportHost).
      const text = await readPickedDocumentText(picked);
      const target = importAuto ? null : importTargetTrip;
      const { count, tripName, skippedNote } = await importExpensesFromCsv(text, {
        targetTripId: target,
      });
      // M1: bulk write → re-read the shared expense list once.
      await useExpenseStore.getState().reload();
      showStatus(
        'Import complete',
        `${count} expense(s) imported into "${tripName}"${skippedNote}.`,
      );
      setImportOpen(false);
      setImportTargetTrip(null);
    } catch (e) {
      showStatus('Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doBackup = async () => {
    if (passphrase.length < 8) {
      showStatus('Passphrase too short', 'Use at least 8 characters. This passphrase cannot be recovered.');
      return;
    }
    setBusy(true);
    setBusyLabel('Reading your data…');
    try {
      // Phases yield to the event loop, so the spinner + label keep painting.
      const envelope = await createBackup(passphrase, undefined, {
        onPhase: (phase) => {
          if (phase === 'serialize') setBusyLabel('Deriving encryption key…');
          else if (phase === 'kdf') setBusyLabel('Encrypting…');
          else if (phase === 'encrypt') setBusyLabel('Preparing file…');
        },
      });
      // Saved to a user-picked location (folder picker / save dialog), never
      // the share sheet. Cancel = quiet: no message, reminder clock untouched.
      const outcome = await saveBackup(envelope);
      if (outcome.kind === 'cancelled') return;
      await markBackupDone(); // reset the reminder clock (§2.2 backup reminders)
      close();
      if (outcome.kind === 'saved') {
        showStatus('Backup saved', outcome.location
          ? `Saved as ${outcome.name} in "${outcome.location}".`
          : `Saved as ${outcome.name}.`);
      } else {
        showStatus('Backup downloaded', `Saved as ${outcome.name} in your browser's download folder.`);
      }
    } catch (e) {
      showStatus('Backup failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  };

  // Restore order: choose file → validate (no passphrase) → passphrase → restore.
  // Step 1+2: pick and structurally validate the file. An invalid file is
  // reported here and the passphrase sheet never opens.
  const startRestore = async () => {
    try {
      const doc = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: false });
      const picked = doc.canceled ? null : doc.assets?.[0];
      if (!picked || typeof picked.uri !== 'string') return; // cancelled
      // Same cross-platform read as the CSV import (web: asset.file; a blob:
      // URL is not fetchable under COEP — see src/utils/readPickedDocument.ts).
      const text = await readPickedDocumentText(picked);
      const envelope = parseBackupEnvelope(text);
      openRestoreFor(envelope, picked.name ?? 'backup file');
    } catch (e) {
      showStatus(
        e instanceof InvalidBackupFileError ? 'Not a valid backup' : 'Could not read file',
        e instanceof Error ? e.message : String(e),
      );
    }
  };

  // Entry point once the file is known (also the hook for a future
  // "open with"/share-intent handler: it only needs the envelope).
  const openRestoreFor = (envelope: BackupEnvelope, fileName: string) => {
    setRestoreFile({ envelope, name: fileName });
    setPassphrase('');
    setPassphraseError(null);
    setMode('restore');
  };

  // Step 3+4: decrypt with the passphrase. Wrong passphrase → inline error,
  // file selection kept so the user can retry.
  const doRestore = async () => {
    if (!restoreFile) return;
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      setPassphraseError(`Passphrase is at least ${MIN_PASSPHRASE_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    setPassphraseError(null);
    try {
      // Async Argon2id: yields every ~10 ms so the spinner keeps animating.
      const { trips, expenses } = await decryptBackup(restoreFile.envelope, passphrase);
      setPassphrase(''); // never keep the passphrase after use
      for (const t of trips) await saveTrip(t);
      for (const e of expenses) await saveExpense(e);
      setTrips(trips);
      // M1: bulk write → re-read the shared expense list once.
      await useExpenseStore.getState().reload();
      // M4: the backup carries only full covers → build card thumbnails.
      void syncCoverThumbs();
      close();
      showStatus('Restore complete', `${trips.length} trips and ${expenses.length} expenses restored.`);
    } catch (e) {
      setPassphrase('');
      if (e instanceof BackupPassphraseError) {
        setPassphraseError('Wrong passphrase. Try again, or cancel.');
      } else {
        close();
        showStatus('Restore failed', e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Settings</Text>
      </View>
      {/* Web/PWA notices (storage health + install nudge) under the app title. */}
      <WebNotices />

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: insets.bottom + 106 }}
        showsVerticalScrollIndicator={false}
      >
        {Platform.OS === 'web' && bioAvailable && (
          <View style={styles.section}>
            <SectionTitle title="Security" />
            <Card>
              <Text style={styles.note}>
                Unlock with fingerprint or face (a passkey stored by this browser) instead of
                typing your passphrase. The passphrase stays your recovery key for new devices or
                a reset browser.
              </Text>
              <View style={styles.actions}>
                <Button
                  label={bioEnrolled ? 'Disable passkey unlock' : 'Enable passkey unlock'}
                  icon="finger-print-outline"
                  variant={bioEnrolled ? 'ghost' : 'primary'}
                  onPress={toggleBiometric}
                />
              </View>
            </Card>
          </View>
        )}

        {Platform.OS !== 'web' && DEVICE_AUTH_SUPPORTED && (
          <View style={styles.section}>
            <SectionTitle title="Security" />
            <Card>
              <Text style={styles.note}>
                Lock the app with your fingerprint, face or device PIN. Asked at start and when you
                return after more than a minute away. Your data stays encrypted either way.
              </Text>
              <View style={styles.actions}>
                <Button
                  label={appLockOn ? 'Disable unlock with biometrics' : 'Enable unlock with biometrics'}
                  icon={appLockOn ? 'lock-open-outline' : 'finger-print-outline'}
                  variant={appLockOn ? 'ghost' : 'primary'}
                  onPress={() => void toggleAppLock()}
                />
              </View>
            </Card>
          </View>
        )}

        {/* Q14: one "Data" card. No cloud-* icons — nothing leaves the device
            except through the share sheet the user picks. */}
        <View style={styles.section}>
          <SectionTitle title="Data" />
          <Card>
            <Text style={styles.note}>
              Local encrypted backup. The passphrase is the only key — if you lose it, the backup is unrecoverable.
            </Text>
            {nudge && (
              <Text style={[styles.note, { color: colors.accent, marginBottom: spacing.md }]}>
                It's been a while since your last backup — your trips exist only on this device.
              </Text>
            )}
            <View style={styles.actions}>
              <Button label="Create backup" icon="archive-outline" onPress={() => setMode('backup')} />
              <View style={{ height: spacing.md }} />
              <Button label="Restore backup" icon="arrow-undo-outline" variant="ghost" onPress={startRestore} />
            </View>
            <View style={[styles.actions, { marginTop: spacing.lg }]}>
              <Button label="Export CSV" icon="document-text-outline" onPress={() => setExportOpen(true)} />
              <View style={{ height: spacing.md }} />
              <Button label="Import CSV" icon="document-attach-outline" variant="ghost" onPress={() => setImportOpen(true)} />
            </View>
            <Text style={[styles.note, { marginTop: spacing.md, marginBottom: 0 }]}>
              Export one trip as a single CSV, or every trip as separate files. Import supports
              4MyTravels and other travel expense apps.
            </Text>
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Preferences" />
          <Card>
            {/* G5: appearance. System follows the OS light/dark setting. */}
            <Text style={styles.themeLabel}>Appearance</Text>
            <View style={styles.themeRow} accessibilityRole="radiogroup" accessibilityLabel="Appearance">
              {THEME_MODES.map((m) => (
                <FilterChip
                  key={m}
                  label={THEME_MODE_LABEL[m]}
                  icon={m === 'system' ? 'phone-portrait-outline' : m === 'light' ? 'sunny-outline' : 'moon-outline'}
                  selected={themeMode === m}
                  onPress={() => setThemeMode(m)}
                  accessibilityLabel={`Appearance: ${THEME_MODE_LABEL[m]}`}
                />
              ))}
            </View>
            <View style={styles.themeDivider} />
            <View style={styles.rateRow}>
              <Text style={styles.rateLabel}>Default home currency</Text>
              <Pressable
                style={styles.currencyPill}
                onPress={() => setCurrencyPickerOpen(true)}
              >
                <Text style={styles.currencyPillText}>{defaultHomeCurrency}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
              </Pressable>
            </View>
            <Text style={[styles.note, { marginTop: spacing.md, marginBottom: 0 }]}>
              Used as the home currency for new trips. A single trip can override it under Advanced in the trip editor.
            </Text>
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Exchange rates" />
          <Card>
            <Pressable style={styles.linkRow} onPress={() => router.push({ pathname: '/settings/exchange-rates', params: { homeCurrency: defaultHomeCurrency } })}>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkRowTitle}>Exchange rates</Text>
                <Text style={styles.linkRowSub}>
                  {Object.keys(manualRates).length > 0
                    ? `Latest ECB rates cached at startup · ${Object.keys(manualRates).length} custom rate(s) active`
                    : 'Latest ECB rates, fetched when the app opens'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
            </Pressable>
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle title="About" />
          <Card>
            <Text style={styles.note}>
              4 My Travels — privacy-first travel spend tracker. Local-first, no account required. Client is open
              source (GPL-3.0). © 2026.
            </Text>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Version</Text>
              <Text style={styles.aboutValue}>{Constants.expoConfig?.version ?? '1.0.0'}</Text>
            </View>
            <Pressable style={styles.aboutRow} onPress={() => void import('react-native').then(({ Linking }) => Linking.openURL(WEBSITE_URL))}>
              <Text style={styles.aboutLink}>Website</Text>
              <Ionicons name="globe-outline" size={16} color={colors.primaryText} />
            </Pressable>
            <Pressable style={styles.aboutRow} onPress={() => void import('react-native').then(({ Linking }) => Linking.openURL(SOURCE_CODE_URL))}>
              <Text style={styles.aboutLink}>Source code (GitHub)</Text>
              <Ionicons name="open-outline" size={16} color={colors.primaryText} />
            </Pressable>
            <Pressable style={styles.aboutRow} onPress={() => void import('react-native').then(({ Linking }) => Linking.openURL(ISSUES_URL))}>
              <Text style={styles.aboutLink}>Report an issue</Text>
              <Ionicons name="bug-outline" size={16} color={colors.primaryText} />
            </Pressable>
            <Pressable style={[styles.aboutRow, { marginBottom: 0 }]} onPress={() => void import('react-native').then(({ Linking }) => Linking.openURL(PRIVACY_URL))}>
              <Text style={styles.aboutLink}>Privacy statement</Text>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.primaryText} />
            </Pressable>
          </Card>
        </View>
      </ScrollView>

      {/* Settings content fades out under the floating nav. */}
      <NavFadeScrim />

      {/* Default home currency picker */}
      <Modal visible={currencyPickerOpen} transparent animationType="fade" onRequestClose={() => setCurrencyPickerOpen(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setCurrencyPickerOpen(false)}>
          <View style={styles.pickerSheet}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <Text style={styles.pickerTitle}>Default home currency</Text>
              <Pressable onPress={() => setCurrencyPickerOpen(false)}>
                <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: fontSize.md }}>Done</Text>
              </Pressable>
            </View>
            <TextInput
              style={[styles.input, { marginBottom: spacing.md, paddingVertical: spacing.md }]}
              value={currencyQuery}
              onChangeText={setCurrencyQuery}
              placeholder="Search currency"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
            />
            <ScrollView style={{ maxHeight: 380 }}>
              {CURRENCIES.filter(
                (c) =>
                  c.code.toLowerCase().includes(currencyQuery.toLowerCase()) ||
                  c.name.toLowerCase().includes(currencyQuery.toLowerCase()),
              ).map((c) => {
                const active = c.code === defaultHomeCurrency;
                return (
                  <Pressable
                    key={c.code}
                    style={[styles.pickerRow, active && styles.pickerRowActive]}
                    onPress={() => { void setDefaultHomeCurrency(c.code); setCurrencyPickerOpen(false); setCurrencyQuery(''); }}
                  >
                    <Text style={[styles.pickerRowText, active && { color: colors.primaryText, fontWeight: '700' }]}>
                      {c.flag} {c.code} — {c.name}
                    </Text>
                    {active && <Ionicons name="checkmark" size={18} color={colors.primaryText} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={mode !== null} animationType="slide" onRequestClose={close}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{mode === 'backup' ? 'Create encrypted backup' : 'Restore from backup'}</Text>
            <IconButton icon="close" label="Close" variant="plain" size={24} color={colors.mutedForeground} onPress={close} />
          </View>
          <View style={styles.sheetBody}>
            <Text style={styles.note}>
              {mode === 'backup'
                ? 'Choose a passphrase (min 8 chars). It encrypts the backup and is never stored.'
                : `File: ${restoreFile?.name ?? ''}\nEnter the passphrase used when this backup was created.`}
            </Text>
            <TextInput
              style={styles.input}
              value={passphrase}
              onChangeText={(t) => {
                setPassphrase(t);
                if (passphraseError) setPassphraseError(null);
              }}
              onSubmitEditing={mode === 'backup' ? doBackup : doRestore}
              placeholder="Passphrase"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              autoCapitalize="none"
            />
            {mode === 'restore' && passphraseError ? (
              <Text style={[styles.note, { color: colors.destructive, marginTop: spacing.sm }]}>{passphraseError}</Text>
            ) : null}
            {busy ? (
              <View style={{ marginTop: spacing.xl, alignItems: 'center', gap: spacing.sm }}>
                <ActivityIndicator size="large" color={colors.primaryText} />
                {busyLabel ? <Text style={styles.note}>{busyLabel}</Text> : null}
              </View>
            ) : (
              <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
                <Button
                  label={mode === 'backup' ? 'Create & save' : 'Restore'}
                  onPress={mode === 'backup' ? doBackup : doRestore}
                />
                {mode === 'restore' ? <Button label="Cancel" variant="ghost" onPress={close} /> : null}
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>
      {/* Export picker: single trip or all trips */}
      <Modal visible={exportOpen} transparent animationType="fade" onRequestClose={() => setExportOpen(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setExportOpen(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Export expenses</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {trips.map((t) => (
                <Pressable key={t.id} style={styles.pickerRow} onPress={() => exportSingleTrip(t.id)}>
                  <Ionicons name="airplane-outline" size={18} color={colors.primaryText} />
                  <Text style={styles.pickerRowText}>{t.name}</Text>
                  <Ionicons name="download-outline" size={18} color={colors.mutedForeground} />
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ marginTop: spacing.lg }}>
              <Button
                label={`Export ALL trips (${trips.length} CSV files)`}
                icon="layers-outline"
                variant="ghost"
                onPress={exportAllTrips}
              />
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Import: choose target trip, then pick a CSV file */}
      <Modal visible={importOpen} transparent animationType="fade" onRequestClose={() => setImportOpen(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setImportOpen(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Import into which trip?</Text>
            <Text style={[styles.note, { marginBottom: spacing.md }]}>
              Pick a trip, or let the app create one from the dates in the file.
              Existing entries with the same id are updated.
            </Text>
            <Pressable
              style={[styles.pickerRow, importAuto && styles.pickerRowActive]}
              onPress={() => setImportTargetTrip(AUTO_TRIP)}
            >
              <Ionicons
                name={importAuto ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={importAuto ? colors.primary : colors.mutedForeground}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.pickerRowText, importAuto && { color: colors.primaryText, fontWeight: '700' }]}>
                  New trip from file dates
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans }}>
                  Auto-detects start/end date and trip name
                </Text>
              </View>
            </Pressable>
            <ScrollView style={{ maxHeight: 320 }}>
              {trips.map((t) => (
                <Pressable
                  key={t.id}
                  style={[styles.pickerRow, t.id === importTargetTrip && styles.pickerRowActive]}
                  onPress={() => {
                    if (!importTargetTrip) { setImportTargetTrip(t.id); return; }
                    if (t.id === importTargetTrip) { setImportTargetTrip(null); return; }
                    setImportTargetTrip(t.id);
                  }}
                >
                  <Ionicons
                    name={t.id === importTargetTrip ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={t.id === importTargetTrip ? colors.primary : colors.mutedForeground}
                  />
                  <Text style={styles.pickerRowText}>{t.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ marginTop: spacing.lg }}>
              <Button
                label={busy ? 'Importing…' : 'Choose CSV file'}
                icon="folder-open-outline"
                disabled={!importTargetTrip || busy}
                onPress={doCsvImport}
              />
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  screenTitle: { color: colors.foreground, fontSize: fontSize['4xl'], fontWeight: '800', fontFamily: fontFamily.heading },
  // Padding-bottom lives on the ScrollView's contentContainer (insets.bottom +
  // 106, sized to the floating nav) — never here as well.
  body: { flex: 1, paddingHorizontal: spacing.xl },
  section: { marginBottom: spacing.lg },
  note: { color: colors.mutedForeground, fontSize: fontSize.md, fontFamily: fontFamily.sans, lineHeight: 22, marginBottom: spacing.lg },
  actions: { marginTop: spacing.sm },

  sheet: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing['2xl'], paddingTop: spacing.xl },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  sheetTitle: { color: colors.foreground, fontSize: fontSize['2xl'], fontWeight: '700', fontFamily: fontFamily.heading, flex: 1 },
  closeBtn: { padding: spacing.xs },
  sheetBody: { flex: 1 },
  input: {
    backgroundColor: colors.secondary,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    fontSize: fontSize.lg,
    color: colors.foreground,
    fontFamily: fontFamily.sans,
  },
  rateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  linkRowTitle: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '600', fontFamily: fontFamily.sans },
  linkRowSub: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: 2 },
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  aboutLabel: { color: colors.mutedForeground, fontSize: fontSize.md, fontFamily: fontFamily.sans },
  aboutValue: { color: colors.foreground, fontSize: fontSize.md, fontWeight: '700', fontFamily: fontFamily.sans },
  aboutLink: { color: colors.primaryText, fontSize: fontSize.md, fontWeight: '600', fontFamily: fontFamily.sans },
  pickerBackdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    padding: spacing.xl,
  },
  pickerTitle: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '700', fontFamily: fontFamily.heading, marginBottom: spacing.md },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerRowActive: {},
  pickerRowText: { flex: 1, color: colors.foreground, fontSize: fontSize.md, fontFamily: fontFamily.sans },
  rateLabel: { color: colors.foreground, fontSize: fontSize.md, fontFamily: fontFamily.sans, flex: 1 },
  themeLabel: { color: colors.foreground, fontSize: fontSize.md, fontFamily: fontFamily.sans },
  themeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  themeDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  currencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  currencyPillText: { color: colors.foreground, fontSize: fontSize.md, fontWeight: '700', fontFamily: fontFamily.sans },
  rateInput: {
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.foreground,
    width: 110,
    textAlign: 'right',
    fontFamily: fontFamily.sans,
  },
  rateBtn: {
    backgroundColor: colors.primarySolid,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rateBtnText: { color: colors.primaryForeground, fontWeight: '600', fontSize: fontSize.sm },
}));
