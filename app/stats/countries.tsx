import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTripStore } from '../../src/store/tripStore';
import { loadExpensesForList } from '../../src/db/expenseRepo';
import { groupByCountry, searchCountries, sortCountries, summarizeStats, type CountrySort } from '../../src/utils/countryStats';
import { getPeriodRange, periodLabel, type PeriodPreset } from '../../src/utils/periods';
import { pruneTripIds } from '../../src/utils/tripFilter';
import { categoryIcon } from '../../src/utils/categoryIcons';
import { formatMoney } from '../../src/utils/currency';
import { colors, fontFamily, fontSize, radius, spacing } from '../../src/theme/theme';
import { PickerSheet, PickerRow } from '../../src/components/PickerSheet';
import type { Expense } from '../../src/types';

const PRESETS: PeriodPreset[] = ['all', 'ytd', 'last12', 'custom'];
// Sort options live in a sheet behind ONE chip ("Highest spend ▾") — the mock's
// layout. Labels match the mock's wording.
const SORTS: CountrySort[] = ['high', 'low', 'az'];
const SORT_LABEL: Record<CountrySort, string> = { high: 'Highest spend', low: 'Lowest spend', az: 'A-Z' };

/** Subtitle of the summary block: "From 4 trips and 231 days". */
function scopePhrase(trips: number, days: number): string {
  return `From ${trips} ${trips === 1 ? 'trip' : 'trips'} and ${days} ${days === 1 ? 'day' : 'days'}`;
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function CountriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const trips = useTripStore((s) => s.trips);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [query, setQuery] = useState('');
  const [preset, setPreset] = useState<PeriodPreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showFrom, setShowFrom] = useState(false);
  const [showTo, setShowTo] = useState(false);
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [tripFilter, setTripFilter] = useState<string[]>([]);
  const [sort, setSort] = useState<CountrySort>('high');

  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [sortPickerOpen, setSortPickerOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    loadExpensesForList().then((list) => { if (alive) setExpenses(list); });
    return () => { alive = false; };
  }, []));

  const activeTripIds = useMemo(() => pruneTripIds(tripFilter, trips), [tripFilter, trips]);
  const range = useMemo(() => getPeriodRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const rows = useMemo(() => {
    // No COUNTRY filter here: this screen IS the country breakdown — picking a
    // country out of a list of countries is a filter on itself (user request:
    // "selectie menu met countries is niet echt nodig — verwijder deze").
    const grouped = groupByCountry(expenses, {
      tripIds: activeTripIds,
      range,
      categories: categoryFilter,
    });
    return sortCountries(searchCountries(grouped, query), sort);
  }, [expenses, activeTripIds, range, categoryFilter, query, sort]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);
  const max = rows.length ? Math.max(...rows.map((r) => r.amount)) : 1;

  // Subtitle scope: trips + days over the FILTERED set (trip / period /
  // category). Deliberately NOT the search box — a lookup should not rewrite the
  // block's context. Both numbers are DISTINCT, so a travel day with expenses in
  // two countries is one day (see `summarizeStats`).
  const scope = useMemo(
    () => summarizeStats(expenses, { tripIds: activeTripIds, range, categories: categoryFilter }),
    [expenses, activeTripIds, range, categoryFilter],
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

  // Chip labels in the mock's "Label: value" shape ("Trip: All", "Category: All").
  const tripChipLabel =
    activeTripIds.length === 0
      ? 'Trip: All'
      : activeTripIds.length === 1
        ? `Trip: ${trips.find((t) => t.id === activeTripIds[0])?.name ?? '1 trip'}`
        : `Trip: ${activeTripIds.length} trips`;
  const categoryChipLabel =
    categoryFilter.length === 0
      ? 'Category: All'
      : categoryFilter.length === 1
        ? `Category: ${categoryFilter[0]}`
        : `Category: ${categoryFilter.length} categories`;
  const sortChipLabel = SORT_LABEL[sort];

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
          <Text style={styles.screenTitle}>Countries</Text>
          <View style={{ width: 22 }} />
        </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search country"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query !== '' && (
          <Pressable hitSlop={8} onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      <View style={styles.chipRow}>
        {PRESETS.map((p) => (
          <Pressable
            key={p}
            style={[styles.chip, preset === p && styles.chipActive]}
            onPress={() => setPreset(p)}
          >
            <Text style={[styles.chipText, preset === p && styles.chipTextActive]}>{periodLabel(p)}</Text>
          </Pressable>
        ))}
      </View>

      {preset === 'custom' && (
        <View style={styles.customRange}>
          <Pressable style={styles.rangeButton} onPress={() => setShowFrom(true)}>
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <Text style={styles.rangeButtonText}>{customFrom || 'From'}</Text>
          </Pressable>
          <Text style={styles.rangeDash}>–</Text>
          <Pressable style={styles.rangeButton} onPress={() => setShowTo(true)}>
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <Text style={styles.rangeButtonText}>{customTo || 'To'}</Text>
          </Pressable>
        </View>
      )}
      {showFrom && (
        <DateTimePicker
          value={fromDate ?? new Date()}
          onChange={(_, d) => { setShowFrom(false); if (d) { setFromDate(d); setCustomFrom(formatYmd(d)); } }}
          style={{ alignSelf: 'stretch' }}
        />
      )}
      {showTo && (
        <DateTimePicker
          value={toDate ?? new Date()}
          onChange={(_, d) => { setShowTo(false); if (d) { setToDate(d); setCustomTo(formatYmd(d)); } }}
          style={{ alignSelf: 'stretch' }}
        />
      )}

      {/* Filter chips in the mock's layout: a label + the current value, with a
          chevron-down caret so it reads as a dropdown. One row (horizontally
          scrollable, no wrap) so it never becomes two lines. Tapping opens the
          matching sheet. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRowScroll}
        contentContainerStyle={styles.filterRow}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.filterButton} onPress={() => setTripPickerOpen(true)}>
          <Ionicons name="airplane-outline" size={15} color={colors.primary} />
          <Text style={[styles.filterButtonText, activeTripIds.length > 0 && styles.filterButtonTextOn]}>
            {tripChipLabel}
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
        <Pressable style={styles.filterButton} onPress={() => setSortPickerOpen(true)}>
          <Ionicons name="swap-vertical-outline" size={15} color={colors.primary} />
          <Text style={styles.filterButtonText}>{sortChipLabel}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
        </Pressable>
      </ScrollView>

      {/* Summary block (user request: "een blok met Countries • €… Total").
          Same information that used to be a bare line under the title, now a
          card with the active period spelled out. */}
      <View style={styles.summaryCard}>
        <Ionicons name="globe-outline" size={26} color={colors.primary} />
        <View style={styles.summaryTextWrap}>
          <Text style={styles.summaryMain}>
            {rows.length} {rows.length === 1 ? 'country' : 'countries'} • {formatMoney(total, 'EUR')} total
          </Text>
          <Text style={styles.summarySub}>{scopePhrase(scope.trips, scope.days)}</Text>
        </View>
        <Ionicons name="bar-chart-outline" size={22} color={colors.mutedForeground} />
      </View>

      {rows.length === 0 ? (
        <Text style={styles.emptyText}>No countries match this filter.</Text>
      ) : (
        rows.map((r, idx) => (
          <View key={r.code} style={styles.rowCard}>
            <Text style={styles.rank}>{idx + 1}</Text>
            <Text style={styles.flag}>{r.flag}</Text>
            <View style={styles.rowCenter}>
              <Text style={styles.rowName} numberOfLines={1}>{r.name}</Text>
              <Text style={styles.rowMeta}>{r.trips} trips · {r.days} days</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${(r.amount / max) * 100}%` }]} />
              </View>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowAmount}>{formatMoney(r.amount, 'EUR')}</Text>
              <Text style={styles.rowPct}>{Math.round(r.pct * 100)}%</Text>
            </View>
          </View>
        ))
      )}

      {/* Filter sheets: SAME build-up as the Statistics trip filter — title,
          plain rows (icon + label + checkmark), Done. NO search field: these
          lists are short, and a search bar in a 3-option list is noise
          (user request: "de zoekbalk mag verwijderd worden").
          There is deliberately NO country filter here — this screen already IS
          the country breakdown, so a "Filter by country" sheet only hides the
          other countries. It stays on Over time, where it does filter a series. */}
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

      {/* Sort sheet — opened by the "Highest spend ▾" chip. Single choice, so
          picking one applies it immediately and closes the sheet. */}
      <PickerSheet
        visible={sortPickerOpen}
        onClose={() => setSortPickerOpen(false)}
        title="Sort by"
        maxListHeight={240}
      >
        {SORTS.map((s) => (
          <PickerRow
            key={s}
            icon="swap-vertical-outline"
            label={SORT_LABEL[s]}
            active={sort === s}
            onPress={() => { setSort(s); setSortPickerOpen(false); }}
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
  // Summary block (globe + "N countries • €X total" + subtitle + chart icon).
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.secondary,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: fontSize.md,
    fontFamily: fontFamily.sans,
    paddingVertical: spacing.md,
  },
  chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
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
  customRange: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  rangeInput: {
    flex: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rangeDash: { color: colors.mutedForeground, fontSize: fontSize.sm },
  rangeButton: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.secondary, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  rangeButtonText: { color: colors.foreground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  // One horizontally scrollable chip row (filters + sort options on a single
  // line). The negative margin + matching content padding lets the chips scroll
  // edge-to-edge instead of stopping at the screen's own inset.
  filterRowScroll: { marginBottom: spacing.lg, marginHorizontal: -spacing.xl },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
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
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rank: {
    width: 18,
    color: colors.mutedForeground,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
  },
  flag: { fontSize: 22, lineHeight: 26 },
  rowCenter: { flex: 1, minWidth: 0 },
  rowName: { color: colors.foreground, fontSize: fontSize.md, fontFamily: fontFamily.sans, fontWeight: '600' },
  rowMeta: { color: colors.mutedForeground, fontSize: fontSize.xs, fontFamily: fontFamily.sans, marginTop: 2 },
  barTrack: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 8,
  },
  barFill: { height: '100%', borderRadius: 4, backgroundColor: colors.primary },
  rowRight: { alignItems: 'flex-end', minWidth: 78 },
  rowAmount: { color: colors.foreground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, fontWeight: '700' },
  rowPct: { color: colors.mutedForeground, fontSize: fontSize.xs, fontFamily: fontFamily.sans },
});
