import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppLogo } from '../../src/components/AppLogo';
import { useTripStore } from '../../src/store/tripStore';
import { useExpenses, useExpenseStore } from '../../src/store/expenseStore';
import { colors, fontFamily, radius, fontSize, spacing, donutPalette } from '../../src/theme/theme';
import { Pill } from '../../src/components/ui';
import { NavFadeScrim } from '../../src/components/FadeScrim';
import { WebNotices } from '../../src/components/WebNotices';
import { TimeChart } from '../../src/components/TimeChart';
import { formatMoney } from '../../src/utils/currency';
import { filterExpensesByTrips, pruneTripIds } from '../../src/utils/tripFilter';
import { TripFilter } from '../../src/components/TripFilter';
import { WIDE_BREAKPOINT } from '../../src/theme/layout';
import { useTripFilterStore } from '../../src/store/tripFilterStore';
import { groupByTime } from '../../src/utils/timeStats';
import { computeBreakdown, pickDisplayCurrency, quickFacts } from '../../src/utils/stats/breakdown';
import { DonutChart } from '../../src/components/stats/DonutChart';
import { CategoryLegend } from '../../src/components/stats/CategoryLegend';
import { Bar, Empty, Section, SeeAll, SplitPaymentBar } from '../../src/components/stats/blocks';

// G3: the Stats overview is now layout only. Every number comes from
// src/utils/stats/breakdown.ts (tested in scripts/test-stats-utils.mjs), the
// charts/blocks from src/components/stats/*. Donut palette unchanged.
export default function StatisticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // M11: AppFrame widens this screen to WIDE_MAX_WIDTH from WIDE_BREAKPOINT.
  const twoCol = useWindowDimensions().width >= WIDE_BREAKPOINT;
  const trips = useTripStore((s) => s.trips);
  // M1 shared store; Q8: spinner until the first load, then ONE empty card.
  const { expenses, loaded } = useExpenses();
  const [refreshing, setRefreshing] = useState(false);
  // Trip filter: empty = every trip. M10: shared with Countries / Over time.
  const tripFilter = useTripFilterStore((s) => s.selected);

  const displayCurrency = useMemo(() => pickDisplayCurrency(trips), [trips]);
  // Drop trips that no longer exist (deleted while a filter was active).
  const activeTripIds = useMemo(() => pruneTripIds(tripFilter, trips), [tripFilter, trips]);
  const filteredExpenses = useMemo(
    () => filterExpensesByTrips(expenses, activeTripIds),
    [expenses, activeTripIds],
  );
  // Over time preview: the SAME chart as /stats/over-time, last 12 months.
  const chartRows = useMemo(
    () => groupByTime(filteredExpenses, { period: 'month' }).slice(-12),
    [filteredExpenses],
  );
  const facts = useMemo(() => quickFacts(filteredExpenses), [filteredExpenses]);
  // Q6: all breakdowns in one memo.
  const { catEntries, slices, total, maxCountry, topCountries, cardValue, cashValue } = useMemo(
    () => computeBreakdown(filteredExpenses, expenses, activeTripIds, donutPalette),
    [filteredExpenses, expenses, activeTripIds],
  );

  // M1: the shared store loads once; pull-to-refresh re-reads storage.
  const onRefresh = async () => {
    setRefreshing(true);
    await useExpenseStore.getState().reload();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <AppLogo size={36} />
          <Text style={styles.appTitle}>4 My Travels</Text>
        </View>
      </View>
      <View style={styles.titleWrap}>
        <View style={styles.titleTextWrap}>
          <Text style={styles.screenTitle}>Stats</Text>
        </View>
        {/* M10: the shared TripFilter (text label + filter icon). */}
        <TripFilter
          trips={trips}
          selected={activeTripIds}
          onToggle={useTripFilterStore.getState().toggle}
          onClear={useTripFilterStore.getState().clear}
        />
      </View>

      {/* Web/PWA notices (storage health + install nudge) under the screen title. */}
      <WebNotices />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 106 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!loaded ? (
          <ActivityIndicator color={colors.primaryText} style={{ marginTop: spacing['3xl'] }} accessibilityLabel="Loading stats" />
        ) : filteredExpenses.length === 0 ? (
          /* Q8: one empty-state card. The sub-page links stay reachable (pattern 54). */
          <View style={styles.emptyCard}>
            <Ionicons name="pie-chart-outline" size={40} color={colors.mutedForeground} />
            <Text style={styles.emptyCardTitle}>No expenses to analyse yet</Text>
            <Text style={styles.emptyCardBody}>
              {activeTripIds.length > 0
                ? 'The selected trips have no expenses. Change the trip filter or log an expense.'
                : 'Log an expense on a trip and your spending breakdown appears here.'}
            </Text>
            <SeeAll label="By country" onPress={() => router.push('/stats/countries')} />
            <SeeAll label="Over time" onPress={() => router.push('/stats/over-time')} />
          </View>
        ) : (<>
          {/* G1 (N8): the quick facts that used to sit on Home; each pill opens
              the page that explains it. */}
          <View style={styles.quickFacts}>
            <Pressable onPress={() => router.push('/stats/countries')} accessibilityRole="button">
              <Pill icon="location-outline" text={`${facts.countries} ${facts.countries === 1 ? 'country' : 'countries'}`} />
            </Pressable>
            <Pressable onPress={() => router.push('/stats/over-time')} accessibilityRole="button">
              <Pill icon="calendar-outline" text={`${facts.days} ${facts.days === 1 ? 'day' : 'days'}`} />
            </Pressable>
            <Pill icon="wallet-outline" text={`${formatMoney(total, displayCurrency)} spent`} />
          </View>
          {/* M11: two columns from WIDE_BREAKPOINT — charts left, breakdowns right. */}
          <View style={twoCol ? styles.cols : undefined}>
            <View style={twoCol ? styles.col : undefined}>
              <View style={styles.donutSection}>
                <DonutChart slices={slices} total={total} size={280} innerRadius={80} />
              </View>
              <CategoryLegend slices={slices} catEntries={catEntries} total={total} displayCurrency={displayCurrency} />
            </View>
            <View style={twoCol ? styles.col : undefined}>
              <Section title="By country">
                {topCountries.length === 0 ? (
                  <Empty text="No countries tagged yet." />
                ) : (
                  topCountries.map((c) => (
                    <Bar key={c.code} label={c.name} value={c.amount} max={maxCountry} displayCurrency={displayCurrency} color={colors.accent} flag={c.flag} />
                  ))
                )}
                <SeeAll onPress={() => router.push('/stats/countries')} />
              </Section>

              {/* Over time — the SAME chart as the Over time page (TimeChart),
                  last 12 months. The link is unconditional (pattern 54). */}
              <Section title="Over time">
                {chartRows.length === 0 ? <Empty /> : <TimeChart rows={chartRows} period="month" plotH={140} />}
                <SeeAll onPress={() => router.push('/stats/over-time')} />
              </Section>

              {/* By payment — last of the preview blocks. Export lives in
                  Settings and the trip ⋯ menu only (G1). */}
              <Section title="By payment">
                <SplitPaymentBar cardValue={cardValue} cashValue={cashValue} displayCurrency={displayCurrency} />
              </Section>
            </View>
          </View>
        </>)}
      </ScrollView>

      {/* Content fades out under the floating nav. */}
      <NavFadeScrim />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  cols: { flexDirection: 'row', gap: spacing.xl, alignItems: 'flex-start' },
  col: { flex: 1, minWidth: 0 },
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  appTitle: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '700', fontFamily: fontFamily.heading },
  titleWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  screenTitle: { color: colors.foreground, fontSize: fontSize['4xl'], fontWeight: '800', fontFamily: fontFamily.heading },
  titleTextWrap: { flex: 1 },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: 40 },
  donutSection: { alignItems: 'center', marginVertical: spacing.lg },
  // G1: quick-fact pills (moved from Home); wraps on narrow screens.
  quickFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },
  emptyCard: {
    marginTop: spacing.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyCardTitle: {
    color: colors.foreground,
    fontSize: fontSize.lg,
    fontWeight: '700',
    fontFamily: fontFamily.heading,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  emptyCardBody: {
    color: colors.mutedForeground,
    fontSize: fontSize.md,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
});
