// First-start onboarding (blocking, centred). Mounted in app/_layout.tsx only
// once storage is ready — on the PWA that is AFTER the WebUnlockGate — and
// OUTSIDE <ThemedTree>, so picking Light/Dark (which remounts the themed tree)
// does not reset the wizard step.
//
// Step 1: home currency -> useSettingsStore.setDefaultHomeCurrency.
// Step 2: appearance   -> ThemeProvider.setMode (same store as Settings).
// "Get started" writes app_settings.onboarding_done = '1'.
// Existing users (any trip, no flag) get the flag silently, never the dialog.
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getStorageAdapter } from '../db';
import { useTripStore } from '../store/tripStore';
import { useSettingsStore } from '../store/settingsStore';
import { useThemeMode } from '../theme/ThemeProvider';
import { THEME_MODES, THEME_MODE_LABEL } from '../theme/themeMode';
import { CURRENCIES } from '../data/currencies';
import { ONBOARDING_KEY, decideOnboarding, filterCurrencies, setOnboardingOpen } from '../utils/onboarding';
import { colors, fontFamily, fontSize, radius, spacing, themedStyles } from '../theme/theme';
import { Button, FilterChip } from './ui';
import { OnboardingFrame } from './OnboardingFrame';

async function writeFlag(): Promise<void> {
  await getStorageAdapter().exec('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [ONBOARDING_KEY, '1']);
}

export function OnboardingHost() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [query, setQuery] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [saving, setSaving] = useState(false);
  const { mode, setMode } = useThemeMode();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await getStorageAdapter().query<{ value: string }>(
          'SELECT value FROM app_settings WHERE key = ?', [ONBOARDING_KEY],
        );
        const decision = decideOnboarding(rows[0]?.value, useTripStore.getState().trips.length);
        if (decision === 'silent') { await writeFlag(); return; }
        if (decision === 'show' && alive) {
          await useSettingsStore.getState().hydrate();
          if (!alive) return;
          setCurrency(useSettingsStore.getState().defaultHomeCurrency || 'EUR');
          setOnboardingOpen(true);
          setVisible(true);
        }
      } catch {
        // app_settings unreadable: never trap the user behind a dialog.
      }
    })();
    return () => { alive = false; };
  }, []);

  const list = useMemo(() => filterCurrencies(CURRENCIES, query), [query]);

  if (!visible) return null;

  const finish = async () => {
    setSaving(true);
    try {
      await useSettingsStore.getState().setDefaultHomeCurrency(currency);
      await writeFlag();
    } catch {
      /* best effort: the choice applies this session; the dialog returns next start */
    }
    setVisible(false);
    setOnboardingOpen(false);
  };

  return (
    <OnboardingFrame>
      <View style={styles.dialog} accessibilityRole="none" accessibilityLabel="Welcome to 4MyTravels">
        <Text style={styles.stepLabel}>Step {step} of 2</Text>
        {step === 1 ? (
          <>
            <Text style={styles.title}>Your home currency</Text>
            <Text style={styles.message}>Totals and statistics are shown in this currency. You can change it later in Settings.</Text>
            <View style={styles.search}>
              <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search currency"
                placeholderTextColor={colors.mutedForeground}
                style={styles.searchInput}
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel="Search currency"
              />
            </View>
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {list.map((c) => {
                const sel = c.code === currency;
                return (
                  <Pressable
                    key={c.code}
                    onPress={() => setCurrency(c.code)}
                    style={[styles.row, sel && styles.rowSelected]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: sel }}
                    accessibilityLabel={`${c.code} ${c.name}`}
                  >
                    <Text style={styles.flag}>{c.flag}</Text>
                    <Text style={styles.code}>{c.code}</Text>
                    <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                    {sel ? <Ionicons name="checkmark" size={18} color={colors.primaryText} /> : null}
                  </Pressable>
                );
              })}
              {list.length === 0 ? <Text style={styles.empty}>No currency found</Text> : null}
            </ScrollView>
            <Button label="Next" icon="arrow-forward" size="md" onPress={() => setStep(2)} />
          </>
        ) : (
          <>
            <Text style={styles.title}>Appearance</Text>
            <Text style={styles.message}>System follows your device's light/dark setting.</Text>
            <View style={styles.themeRow} accessibilityRole="radiogroup" accessibilityLabel="Appearance">
              {THEME_MODES.map((m) => (
                <FilterChip
                  key={m}
                  label={THEME_MODE_LABEL[m]}
                  icon={m === 'system' ? 'phone-portrait-outline' : m === 'light' ? 'sunny-outline' : 'moon-outline'}
                  selected={mode === m}
                  onPress={() => setMode(m)}
                  accessibilityLabel={`Appearance: ${THEME_MODE_LABEL[m]}`}
                />
              ))}
            </View>
            <View style={styles.actions}>
              <Button label="Back" variant="ghost" size="md" style={{ flex: 1 }} onPress={() => setStep(1)} />
              <Button label="Get started" size="md" style={{ flex: 1 }} loading={saving} onPress={() => void finish()} />
            </View>
          </>
        )}
      </View>
    </OnboardingFrame>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  dialog: {
    width: 380,
    maxWidth: '100%',
    backgroundColor: colors.card,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  stepLabel: { color: colors.mutedForeground, fontFamily: fontFamily.sans, fontSize: fontSize.xs, marginBottom: spacing.xs, textTransform: 'uppercase' },
  title: { color: colors.foreground, fontFamily: fontFamily.heading, fontSize: fontSize.xl, fontWeight: '700', marginBottom: spacing.sm },
  message: { color: colors.mutedForeground, fontFamily: fontFamily.sans, fontSize: fontSize.md, lineHeight: 21, marginBottom: spacing.lg },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.input, borderRadius: radius.full,
    paddingHorizontal: spacing.md, minHeight: 44, marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, minWidth: 0, color: colors.foreground, fontFamily: fontFamily.sans, fontSize: fontSize.md, paddingVertical: spacing.sm },
  list: { maxHeight: 260, marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.lg, minHeight: 44 },
  rowSelected: { backgroundColor: colors.primary12 },
  flag: { fontSize: fontSize.lg, width: 26 },
  code: { color: colors.foreground, fontFamily: fontFamily.sans, fontSize: fontSize.md, fontWeight: '700', width: 44 },
  name: { flex: 1, color: colors.mutedForeground, fontFamily: fontFamily.sans, fontSize: fontSize.md },
  empty: { color: colors.mutedForeground, fontFamily: fontFamily.sans, fontSize: fontSize.sm, padding: spacing.md, textAlign: 'center' },
  themeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },
  actions: { flexDirection: 'row', gap: spacing.md },
}));
