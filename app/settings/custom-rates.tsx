// Custom exchange rates — own sub-screen so Settings stays compact when the
// rate list grows. Reached from Settings → "Manual exchange rates".
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, fontFamily, radius, fontSize, spacing } from '../../src/theme/theme';
import { Card, SectionTitle } from '../../src/components/ui';
import { useSettingsStore } from '../../src/store/settingsStore';
import { loadRateCache, type RateCache } from '../../src/services/rateCache';

const RATE_CURRENCIES = ['USD', 'GBP', 'JPY', 'CHF', 'THB', 'TRY', 'IDR'];

export default function CustomRatesScreen() {
  const { homeCurrency: hcParam } = useLocalSearchParams<{ homeCurrency?: string }>();
  const manualRates = useSettingsStore((s) => s.manualRates);
  const setManualRate = useSettingsStore((s) => s.setManualRate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const homeCurrency = hcParam ?? 'EUR';
  const [rateFrom, setRateFrom] = useState<string | null>(null);
  const [cache, setCache] = useState<RateCache | null>(null);

  useEffect(() => {
    void hydrateSettings();
    void loadRateCache(homeCurrency).then(setCache);
  }, [hydrateSettings, homeCurrency]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={styles.title}>Manual exchange rates</Text>
      </View>
      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 + spacing.xl }} showsVerticalScrollIndicator={false}>
        <SectionTitle title="Latest ECB rates" />
        <Card>
          {cache && Object.keys(cache.rates).length > 0 ? (
            <>
              <Text style={styles.note}>
                Fetched automatically when the app opens (ECB via Frankfurter). Used as fallback
                when a live fetch fails. Publication date: {cache.date}.
              </Text>
              <View style={styles.cacheGrid}>
                {RATE_CURRENCIES.filter((c) => c !== homeCurrency).map((c) => {
                  const r = cache.rates[c];
                  return (
                    <View key={c} style={styles.cacheRow}>
                      <Text style={styles.cacheLabel}>{c} → {homeCurrency}</Text>
                      <Text style={styles.cacheValue}>
                        {r ? (1 / r).toPrecision(6) : '—'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          ) : (
            <Text style={styles.note}>
              No cached rates yet. Open the app with an internet connection once — rates are then
              fetched at startup and stored encrypted on-device.
            </Text>
          )}
        </Card>

        <SectionTitle title={`Manual rates → ${homeCurrency}`} />
        <Card>
          <Text style={styles.note}>
            Optional. One fixed rate per currency → {homeCurrency}, applied to all trips and every
            new expense (overrides the live rate). Leave empty to fetch the daily rate.
          </Text>
          {RATE_CURRENCIES.filter((c) => c !== homeCurrency).map((c) => {
            const open = rateFrom === c;
            const current = manualRates[`${c}_${homeCurrency}`];
            return (
              <View key={c} style={styles.rateRow}>
                <Text style={styles.rateLabel}>
                  {c} → {homeCurrency}
                  {current != null ? ` = ${current}` : ''}
                </Text>
                {open ? (
                  <TextInput
                    style={styles.rateInput}
                    autoFocus
                    keyboardType="decimal-pad"
                    placeholder="rate"
                    placeholderTextColor={colors.mutedForeground}
                    onSubmitEditing={(ev) => {
                      const n = parseFloat(ev.nativeEvent.text.replace(',', '.'));
                      if (!Number.isNaN(n) && n > 0) {
                        void setManualRate(c, homeCurrency, n);
                      }
                      setRateFrom(null);
                    }}
                    onEndEditing={() => setRateFrom(null)}
                  />
                ) : (
                  <Pressable style={styles.rateBtn} onPress={() => setRateFrom(c)}>
                    <Text style={styles.rateBtnText}>{current != null ? 'Edit' : 'Set'}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  backBtn: { padding: spacing.xs, marginLeft: -spacing.xs },
  title: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '700', fontFamily: fontFamily.heading, flex: 1 },
  body: { flex: 1, paddingHorizontal: spacing.xl },
  note: { color: colors.mutedForeground, fontSize: fontSize.md, fontFamily: fontFamily.sans, lineHeight: 22, marginBottom: spacing.lg },
  cacheGrid: { gap: spacing.xs },
  cacheRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  cacheLabel: { color: colors.foreground, fontSize: fontSize.md, fontFamily: fontFamily.sans },
  cacheValue: { color: colors.primary, fontSize: fontSize.md, fontWeight: '700', fontFamily: fontFamily.sans },
  rateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
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
