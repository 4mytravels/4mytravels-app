// Exchange rates — own sub-screen reached from Settings → "Exchange rates".
// One combined list per currency: the cached ECB rate (fetched at app open)
// plus an optional manual override. Clearing the override falls back to the
// cached rate automatically (the expense form resolves in that same order).
import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, fontFamily, radius, fontSize, spacing } from '../../src/theme/theme';
import { Card, SectionTitle } from '../../src/components/ui';
import { useSettingsStore } from '../../src/store/settingsStore';
import { loadRateCache, type RateCache } from '../../src/services/rateCache';
import { CURRENCIES } from '../../src/data/currencies';

export default function CustomRatesScreen() {
  const { homeCurrency: hcParam } = useLocalSearchParams<{ homeCurrency?: string }>();
  const defaultHomeCurrency = useSettingsStore((s) => s.defaultHomeCurrency);
  const manualRates = useSettingsStore((s) => s.manualRates);
  const setManualRate = useSettingsStore((s) => s.setManualRate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const homeCurrency = hcParam ?? defaultHomeCurrency ?? 'EUR';
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [cache, setCache] = useState<RateCache | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Y-offset of each rate row within the ScrollView content (measured on layout).
  const rowY = useRef<Record<string, number>>({});

  // When the keyboard opens for a row, scroll it well above the keyboard so
  // what you type stays visible.
  const startEdit = (code: string) => {
    setEditing(code);
    setDraft(manualRates[`${code}_${homeCurrency}`] != null ? String(manualRates[`${code}_${homeCurrency}`]) : '');
    // Wait for the input to mount + keyboard to begin appearing.
    setTimeout(() => {
      const y = rowY.current[code];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true });
    }, 250);
  };

  useEffect(() => {
    void hydrateSettings();
    void loadRateCache(homeCurrency).then(setCache);
  }, [hydrateSettings, homeCurrency]);

  const save = async (code: string) => {
    if (draft.trim() === '') {
      // Empty input clears the override → back to cached rate.
      await setManualRate(code, homeCurrency, null);
    } else {
      const n = parseFloat(draft.replace(',', '.'));
      if (!Number.isNaN(n) && n > 0) {
        await setManualRate(code, homeCurrency, n);
      }
    }
    setEditing(null);
    setDraft('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={styles.title}>Exchange rates</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        style={styles.body}
        contentContainerStyle={{ paddingBottom: 40 + spacing.xl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SectionTitle title={`Rates → ${homeCurrency}`} />
        <Card>
          {cache && Object.keys(cache.rates).length > 0 ? (
            <>
              <Text style={styles.note}>
                ECB rates fetched automatically when the app opens ({cache.date}). Every expense
                uses this rate unless you set a custom one below.
              </Text>
              {CURRENCIES.filter((c) => c.code !== homeCurrency).map((c) => {
                const r = cache.rates[c.code];
                const cachedDisplay = r ? (1 / r).toPrecision(6) : null;
                const currentOverride = manualRates[`${c.code}_${homeCurrency}`];
                const isEditing = editing === c.code;
                return (
                  <View
                    key={c.code}
                    style={styles.rateRow}
                    onLayout={(e) => { rowY.current[c.code] = e.nativeEvent.layout.y; }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rateLabel}>{c.flag} {c.code} → {homeCurrency}</Text>
                      <Text style={styles.rateSub}>
                        {currentOverride != null ? (
                          <>
                            <Text style={styles.overrideActive}>custom: {currentOverride}</Text>
                            {' · cached: '}
                            {cachedDisplay ?? '—'}
                          </>
                        ) : (
                          <>ECB: {cachedDisplay ?? '—'}</>
                        )}
                      </Text>
                    </View>
                    {isEditing ? (
                      <TextInput
                        style={styles.rateInput}
                        autoFocus
                        keyboardType="decimal-pad"
                        placeholder="rate"
                        placeholderTextColor={colors.mutedForeground}
                        value={draft}
                        onChangeText={setDraft}
                        onSubmitEditing={() => void save(c.code)}
                        onBlur={() => void save(c.code)}
                      />
                    ) : (
                      <View style={styles.btnRow}>
                        <Pressable
                          style={[styles.rateBtn, currentOverride == null && styles.rateBtnGhost]}
                          onPress={() => startEdit(c.code)}
                        >
                          <Text style={[styles.rateBtnText, currentOverride == null && styles.rateBtnTextGhost]}>
                            {currentOverride != null ? 'Edit' : 'Custom'}
                          </Text>
                        </Pressable>
                        {currentOverride != null && (
                          <Pressable
                            style={styles.clearBtn}
                            hitSlop={8}
                            onPress={() => void setManualRate(c.code, homeCurrency, null)}
                          >
                            <Ionicons name="close-circle" size={22} color={colors.destructive} />
                          </Pressable>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          ) : (
            <Text style={styles.note}>
              No cached rates yet. Open the app once with an internet connection — ECB rates are
              then fetched at startup and stored encrypted on-device.
            </Text>
          )}
        </Card>

        <Text style={styles.footerNote}>
          Custom rates apply to all trips and every new expense. Clearing a custom rate falls back
          to the cached ECB rate automatically.
        </Text>
      </ScrollView>
      </KeyboardAvoidingView>
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
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rateLabel: { color: colors.foreground, fontSize: fontSize.md, fontWeight: '600', fontFamily: fontFamily.sans },
  rateSub: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: 2 },
  overrideActive: { color: colors.primary, fontWeight: '700' },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
  rateBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  rateBtnText: { color: colors.primaryForeground, fontWeight: '600', fontSize: fontSize.sm },
  rateBtnTextGhost: { color: colors.primary },
  clearBtn: { padding: spacing.xs },
  footerNote: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, lineHeight: 20, marginTop: spacing.lg },
});
