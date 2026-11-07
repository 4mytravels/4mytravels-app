import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTripStore } from '../../src/store/tripStore';
import { loadExpensesForList } from '../../src/db/expenseRepo';
import { groupByTime, timeTotal, periodLabelLong, type TimePeriod } from '../../src/utils/timeStats';
import { pruneTripIds } from '../../src/utils/tripFilter';
import { categoryIcon } from '../../src/utils/categoryIcons';
import { formatMoney } from '../../src/utils/currency';
import { countryName } from '../../src/data/countries';
import { colors, fontFamily, fontSize, radius, spacing, navShadow } from '../../src/theme/theme';
import { PickerSheet, PickerRow } from '../../src/components/PickerSheet';
import { TimeChart } from '../../src/components/TimeChart';
import type { Expense } from '../../src/types';

const PERIOD_LABEL: Record<TimePeriod, string> = { month: 'Month', quarter: 'Quarter', year: 'Year' };
const PERIODS: TimePeriod[] = ['month', 'quarter', 'year'];

export default function OverTimeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const trips = useTripStore((s) => s.trips);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [period, setPeriod] = useState<TimePeriod>('month');
  const [tripFilter, setTripFilter] = useState<string[]>([]);
  const [countryFilter, setCountryFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);

  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  useFocusEffect(useCallback(() => {
    let alive = true;
    loadExpensesForList().then((list) => { if (alive) setExpenses(list); });
    return () => { alive = false; };
  }, []));

  const activeTripIds = useMemo(() => pruneTripIds(tripFilter, trips), [tripFilter, trips]);
  const rows = useMemo(
    () => groupByTime(expenses, {
      tripIds: activeTripIds,
      period,
      range: undefined,
      country: countryFilter ?? undefined,
      categories: categoryFilter,
    }),
    [expenses, activeTripIds, period, countryFilter, categoryFilter],
  );

  const total = useMemo(() => timeTotal(rows), [rows]);
  const highest = useMemo(() => (rows.length ? Math.max(...rows.map((r) => r.value)) : 0), [rows]);

  const avgMonthly = useMemo(() => (rows.length ? total / rows.length : 0), [total, rows]);
  // Alle periodes MET uitgaven in de lijst (user-eis: geen top 3 én geen
  // periodes van €0 — een maand zonder expenses is geen "period"), hoogste eerst.
  const topPeriods = useMemo(
    () => rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value),
    [rows],
  );

  const countryOptions = useMemo(
    () => Array.from(new Set(expenses.map((e) => e.country).filter(Boolean) as string[]))
      .map((c) => c.toUpperCase())
      .filter((c, i, a) => a.indexOf(c) === i)
      .sort(),
    [expenses],
  );
  const categoryOptions = useMemo(
    () => Array.from(new Set(expenses.map((e) => e.category))).sort(),
    [expenses],
  );

  const toggleTrip = (id: string) =>
    setTripFilter((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  // Multi-select: several categories = OR. An empty selection means ALL.
  const toggleCategory = (cat: string) =>
    setCategoryFilter((p) => (p.includes(cat) ? p.filter((x) => x !== cat) : [...p, cat]));
  const categoryChipLabel =
    categoryFilter.length === 0
      ? 'All categories'
      : categoryFilter.length === 1
        ? categoryFilter[0]
        : `${categoryFilter.length} categories`;

  const tripLabelTx = activeTripIds.length === 0 ? 'All trips' : `${activeTripIds.length} trips`;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={styles.screenTitle}>Over time</Text>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back" style={{ opacity: 0 }}>
            <Ionicons name="chevron-back" size={22} color={colors.foreground} />
          </Pressable>
        </View>

      {/* Granularity switcher sits directly under the header (was below the
          filter chips) and is deliberately low — it is a control, not content. */}
      <View style={styles.periodNav}>
        {PERIODS.map((p) => (
          <Pressable
            key={p}
            style={[styles.periodItem, period === p && styles.periodItemActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.periodText, period === p && styles.periodTextActive]}>{PERIOD_LABEL[p]}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.filterButton} onPress={() => setTripPickerOpen(true)}>
          <Ionicons name="airplane-outline" size={15} color={colors.primary} />
          <Text style={[styles.filterButtonText, activeTripIds.length > 0 && styles.filterButtonTextOn]}>
            {tripLabelTx}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
        </Pressable>
        <Pressable
          style={[styles.filterButton, countryFilter != null && styles.filterButtonOn]}
          onPress={() => setCountryPickerOpen(true)}
        >
          <Ionicons name="earth-outline" size={15} color={colors.primary} />
          <Text style={[styles.filterButtonText, countryFilter != null && styles.filterButtonTextOn]}>
            {countryFilter ? countryName(countryFilter) : 'All countries'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
        </Pressable>
        <Pressable
          style={[styles.filterButton, categoryFilter.length > 0 && styles.filterButtonOn]}
          onPress={() => setCategoryPickerOpen(true)}
        >
          <Ionicons name="pricetag-outline" size={15} color={colors.primary} />
          <Text style={[styles.filterButtonText, categoryFilter.length > 0 && styles.filterButtonTextOn]}>
            {categoryChipLabel}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
        </Pressable>
      </ScrollView>

      {rows.length === 0 ? (
        <Text style={styles.emptyText}>No data for this filter.</Text>
      ) : (
        <>
          {/* De grafiek is ÉÉN component (src/components/TimeChart.tsx), ook
              gebruikt door het Over time-blok op de Statistics-tab. `key={period}`
              remount de selectie-tooltip bij een periodewissel. */}
          <TimeChart key={period} rows={rows} period={period} />
        </>
      )}

      {/* Totals BELOW the chart: the graph is the subject, the figures are the
          reading of it. */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{formatMoney(total, 'EUR')}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{formatMoney(avgMonthly, 'EUR')}</Text>
          <Text style={styles.statLabel}>Average</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{formatMoney(highest, 'EUR')}</Text>
          <Text style={styles.statLabel}>Highest</Text>
        </View>
      </View>

      {topPeriods.length > 0 && (
        <View style={styles.topSection}>
          <Text style={styles.topTitle}>Top periods</Text>
          {topPeriods.map((r, idx) => (
            <View key={r.key} style={styles.topRow}>
              <Text style={styles.topRank}>{idx + 1}</Text>
              <View style={styles.topCenter}>
                <Text style={styles.topLabel}>{periodLabelLong(r.key, period)}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${(r.value / (highest || 1)) * 100}%` }]} />
                </View>
              </View>
              <Text style={styles.topValue}>{formatMoney(r.value, 'EUR')}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Filter sheets WITHOUT a search bar — same build-up as the Statistics
          trip filter (title, icon+label rows, Done). */}
      <PickerSheet
        visible={tripPickerOpen}
        onClose={() => setTripPickerOpen(false)}
        title="Filter by trip"
        maxListHeight={320}
      >
        <PickerRow icon="apps-outline" label="All trips" active={activeTripIds.length === 0} onPress={() => setTripFilter([])} />
        {trips.map((t) => (
          <PickerRow
            key={t.id}
            icon="airplane-outline"
            label={t.name}
            active={activeTripIds.includes(t.id)}
            onPress={() => toggleTrip(t.id)}
          />
        ))}
      </PickerSheet>

      <PickerSheet
        visible={countryPickerOpen}
        onClose={() => setCountryPickerOpen(false)}
        title="Filter by country"
        maxListHeight={320}
      >
        <PickerRow icon="earth-outline" label="All countries" active={countryFilter == null} onPress={() => setCountryFilter(null)} />
        {countryOptions.map((code) => (
          <PickerRow
            key={code}
            icon="earth-outline"
            label={countryName(code)}
            active={countryFilter === code}
            onPress={() => setCountryFilter((p) => (p === code ? null : code))}
          />
        ))}
      </PickerSheet>

      <PickerSheet
        visible={categoryPickerOpen}
        onClose={() => setCategoryPickerOpen(false)}
        title="Filter by category"
        maxListHeight={320}
      >
        <PickerRow icon="apps-outline" label="All categories" active={categoryFilter.length === 0} onPress={() => setCategoryFilter([])} />
        {categoryOptions.map((cat) => (
          <PickerRow
            key={cat}
            icon={categoryIcon(cat)}
            label={cat}
            active={categoryFilter.includes(cat)}
            onPress={() => toggleCategory(cat)}
          />
        ))}
      </PickerSheet>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  screenTitle: {
    color: colors.foreground,
    fontSize: fontSize['3xl'],
    fontWeight: '800',
    fontFamily: fontFamily.heading,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  statValue: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '800', fontFamily: fontFamily.heading },
  statLabel: { color: colors.mutedForeground, fontSize: fontSize.xs, fontFamily: fontFamily.sans, marginTop: 2 },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.xl,
  },
  summaryTextWrap: { flex: 1, minWidth: 0 },
  summaryMain: {
    color: colors.foreground,
    fontSize: fontSize.md,
    fontWeight: '700',
    fontFamily: fontFamily.heading,
  },
  summarySub: {
    color: colors.mutedForeground,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans,
    marginTop: 2,
  },
  filterRowScroll: { marginBottom: spacing.lg, marginHorizontal: -spacing.xl },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: 'rgba(99,102,241,0.12)', borderColor: 'rgba(99,102,241,0.44)' },
  chipText: { color: colors.foreground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  chipTextActive: { color: colors.primary, fontWeight: '700' },
  periodNav: {
    flexDirection: 'row',
    height: 36,
    padding: 3,
    gap: 3,
    alignSelf: 'stretch',
    borderRadius: radius.full,
    backgroundColor: colors.navSurface,
    borderWidth: 1,
    borderColor: colors.border,
    ...navShadow,
    marginBottom: spacing.md,
  },
  periodItem: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    borderRadius: radius.full,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodItemActive: {
    backgroundColor: colors.primary,
  },
  periodText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    fontFamily: fontFamily.sans,
    color: colors.mutedForeground,
  },
  periodTextActive: {
    color: colors.primaryForeground,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonOn: { backgroundColor: 'rgba(99,102,241,0.12)', borderColor: 'rgba(99,102,241,0.44)' },
  filterButtonText: { color: colors.foreground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  filterButtonTextOn: { color: colors.primary, fontWeight: '700' },
  emptyText: {
    color: colors.mutedForeground,
    fontSize: fontSize.md,
    fontFamily: fontFamily.sans,
    marginTop: spacing.lg,
  },
  topSection: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  topTitle: { color: colors.foreground, fontSize: fontSize.md, fontWeight: '800', fontFamily: fontFamily.heading, marginBottom: spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  topRank: { width: 18, color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, textAlign: 'center' },
  topCenter: { flex: 1, minWidth: 0 },
  topLabel: { color: colors.foreground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, fontWeight: '600' },
  barTrack: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 6,
  },
  barFill: { height: '100%', borderRadius: 4, backgroundColor: colors.primary },
  topValue: { color: colors.foreground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, fontWeight: '700', minWidth: 78, textAlign: 'right' },
});
