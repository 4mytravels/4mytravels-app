import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppLogo } from '../../src/components/AppLogo';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { colors, fontFamily, radius, fontSize, spacing } from '../../src/theme/theme';
import { Card, SectionTitle, Button } from '../../src/components/ui';
import { createBackup, restoreBackup } from '../../src/db/backup';
import { saveTrip, updateTrip } from '../../src/db/tripRepo';
import { saveExpense } from '../../src/db/expenseRepo';
import { useTripStore } from '../../src/store/tripStore';
import { useSettingsStore } from '../../src/store/settingsStore';

// Update these when the repo goes live.
const SOURCE_CODE_URL = 'https://github.com/4mytravels/4mytravels';
const ISSUES_URL = 'https://github.com/4mytravels/4mytravels/issues';

export default function SettingsScreen() {
  const setTrips = useTripStore((s) => s.setTrips);
  const manualRates = useSettingsStore((s) => s.manualRates);
  const setManualRate = useSettingsStore((s) => s.setManualRate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const trips = useTripStore((s) => s.trips);
  const homeCurrency = trips[0]?.homeCurrency ?? 'EUR';
  const [mode, setMode] = useState<null | 'backup' | 'restore'>(null);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void hydrateSettings();
  }, [hydrateSettings]);

  const close = () => {
    setMode(null);
    setPassphrase('');
    setBusy(false);
  };

  const doBackup = async () => {
    if (passphrase.length < 8) {
      Alert.alert('Passphrase too short', 'Use at least 8 characters. This passphrase cannot be recovered.');
      return;
    }
    setBusy(true);
    try {
      const envelope = await createBackup(passphrase);
      const file = new File(Paths.cache, '4mytravels-backup.json');
      await file.write(envelope);
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save encrypted backup' });
      close();
    } catch (e) {
      Alert.alert('Backup failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async () => {
    if (passphrase.length < 8) {
      Alert.alert('Passphrase too short', 'Enter the passphrase used when the backup was created.');
      return;
    }
    setBusy(true);
    try {
      const doc = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (doc.canceled || !('uri' in doc) || typeof doc.uri !== 'string') {
        setBusy(false);
        return;
      }
      const file = new File(doc.uri);
      const envelope = await file.text();
      const { trips, expenses } = await restoreBackup(envelope, passphrase);
      for (const t of trips) await saveTrip(t);
      for (const e of expenses) await saveExpense(e);
      setTrips(trips);
      Alert.alert('Restore complete', `${trips.length} trips and ${expenses.length} expenses restored.`);
      close();
    } catch (e) {
      Alert.alert('Restore failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <AppLogo size={36} />
          <Text style={styles.appTitle}>4 My Travels</Text>
        </View>
      </View>
      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 + spacing.xl }} showsVerticalScrollIndicator={false}>
        <SectionTitle title="Data" />
        <Card>
          <Text style={styles.note}>
            Local encrypted backup. The passphrase is the only key — if you lose it, the backup is unrecoverable.
          </Text>
          <View style={styles.actions}>
            <Button label="Create backup" icon="cloud-upload-outline" onPress={() => setMode('backup')} />
            <View style={{ height: spacing.md }} />
            <Button label="Restore backup" icon="cloud-download-outline" variant="ghost" onPress={() => setMode('restore')} />
          </View>
        </Card>

        <SectionTitle title="Manual exchange rates" />
        <Card>
          <Pressable style={styles.linkRow} onPress={() => router.push({ pathname: '/settings/custom-rates', params: { homeCurrency } })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkRowTitle}>Custom rates</Text>
              <Text style={styles.linkRowSub}>
                {Object.keys(manualRates).length > 0
                  ? `${Object.keys(manualRates).length} manual rate(s) active — overrides the daily rate`
                  : `Set fixed rates per currency → ${homeCurrency}`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
          </Pressable>
        </Card>

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
          <Pressable style={styles.aboutRow} onPress={() => void import('react-native').then(({ Linking }) => Linking.openURL(SOURCE_CODE_URL))}>
            <Text style={styles.aboutLink}>Source code (GitHub)</Text>
            <Ionicons name="open-outline" size={16} color={colors.primary} />
          </Pressable>
          <Pressable style={[styles.aboutRow, { marginBottom: 0 }]} onPress={() => void import('react-native').then(({ Linking }) => Linking.openURL(ISSUES_URL))}>
            <Text style={styles.aboutLink}>Report an issue</Text>
            <Ionicons name="bug-outline" size={16} color={colors.primary} />
          </Pressable>
        </Card>
      </ScrollView>

      <Modal visible={mode !== null} animationType="slide" onRequestClose={close}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{mode === 'backup' ? 'Create encrypted backup' : 'Restore from backup'}</Text>
            <Pressable onPress={close} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <View style={styles.sheetBody}>
            <Text style={styles.note}>
              {mode === 'backup'
                ? 'Choose a passphrase (min 8 chars). It encrypts the backup and is never stored.'
                : 'Enter the passphrase used when this backup was created.'}
            </Text>
            <TextInput
              style={styles.input}
              value={passphrase}
              onChangeText={setPassphrase}
              placeholder="Passphrase"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              autoCapitalize="none"
            />
            {busy ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : (
              <View style={{ marginTop: spacing.xl }}>
                <Button
                  label={mode === 'backup' ? 'Create & share' : 'Choose file & restore'}
                  onPress={mode === 'backup' ? doBackup : doRestore}
                />
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  appTitle: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '700', fontFamily: fontFamily.heading },
  body: { flex: 1, paddingHorizontal: spacing.xl, paddingBottom: 120 },
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
  aboutLink: { color: colors.primary, fontSize: fontSize.md, fontWeight: '600', fontFamily: fontFamily.sans },
  rateLabel: { color: colors.foreground, fontSize: fontSize.md, fontFamily: fontFamily.sans, flex: 1 },
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
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rateBtnText: { color: colors.primaryForeground, fontWeight: '600', fontSize: fontSize.sm },
});
