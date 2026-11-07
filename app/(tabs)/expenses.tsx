import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppLogo } from '../../src/components/AppLogo';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadExpensesForList, loadExpense } from '../../src/db/expenseRepo';
import { useTripStore } from '../../src/store/tripStore';
import type { Expense } from '../../src/types';
import { colors, fontFamily, radius, fontSize, spacing, fabShadow } from '../../src/theme/theme';
import { IconCircle, Button, StatBox } from '../../src/components/ui';
import { ExpenseForm } from '../../src/components/ExpenseForm';
import { ModalHost } from '../../src/components/ModalHost';
import { EXPENSE_CATEGORIES } from '../../src/types';
import { formatMoney, toHomeCurrency } from '../../src/utils/currency';
import { groupByDaySplitAware } from '../../src/utils/days';
import { categoryIcon } from '../../src/utils/categoryIcons';
import { computeTripStats } from '../../src/utils/tripStats';
import { filterExpensesByTrips, pruneTripIds, tripFilterLabel } from '../../src/utils/tripFilter';
import { ExpenseRow } from '../../src/components/ExpenseRow';
import { NavFadeScrim } from '../../src/components/FadeScrim';
import { WebNotices } from '../../src/components/WebNotices';

export default function ExpensesScreen() {
  const params = useLocalSearchParams<{ tripId?: string; add?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const trips = useTripStore((s) => s.trips);
  // Default to the active trip (started, not ended) — most recent first.
  // Falls back to the most recent trip by startDate.
  const defaultTrip = useMemo(() => {
    const now = new Date();
    const active = trips
      .filter((t) => {
        const start = new Date(`${t.startDate}T12:00:00`);
        const ended = t.endDate ? new Date(`${t.endDate}T12:00:00`) < now : false;
        return !isNaN(start.getTime()) && start <= now && !ended;
      })
      .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0];
    return active ?? [...trips].sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0];
  }, [trips]);

  // Trip filter — the SAME multi-select as the Statistics tab (src/utils/tripFilter.ts):
  // an EMPTY selection means every trip, so "All trips" is a real choice here too.
  //
  // STARTUP REQUIREMENT (user): opening the app shows only the CURRENT trip. So
  // the filter is seeded ONCE with the active/most-recent trip (or the deep-link
  // tripId). It must NOT be re-seeded on later renders, or the user could never
  // stay on "All trips". The seeding waits for the trip store to be populated
  // (`trips.length === 0` means "not hydrated yet"), which is why the initial
  // state is empty and the one-shot effect below fills it.
  const [tripFilter, setTripFilter] = useState<string[]>([]);
  const didSeedFilter = useRef(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [catFilter, setCatFilter] = useState<string>('All');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(params.add === '1');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  useEffect(() => {
    if (didSeedFilter.current) return; // seed exactly once
    if (trips.length === 0) return; // wait for the store to hydrate
    didSeedFilter.current = true;
    const seed = params.tripId
      ? [params.tripId]
      : defaultTrip
        ? [defaultTrip.id]
        : [];
    setTripFilter(seed);
  }, [trips, defaultTrip, params.tripId]);

  // Ids that no longer match a trip are dropped (a trip deleted while the filter
  // was active must not blank the list). Empty still means ALL trips.
  const activeTripIds = useMemo(() => pruneTripIds(tripFilter, trips), [tripFilter, trips]);
  const filterLabel = useMemo(() => tripFilterLabel(activeTripIds, trips), [activeTripIds, trips]);

  const toggleTrip = (id: string) =>
    setTripFilter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Which trip a NEW expense belongs to, and which currency the sheet uses.
  // With exactly one trip filtered that trip is unambiguous; with several (or
  // all) the active/most-recent trip is used, which is also the startup default.
  // Without this the FAB would have no tripId at all under "All trips".
  const singleTrip = useMemo(
    () => (activeTripIds.length === 1 ? trips.find((t) => t.id === activeTripIds[0]) : undefined),
    [activeTripIds, trips],
  );
  const formTrip = singleTrip ?? defaultTrip;

  // Display currency: the filtered trip's own home currency when one trip is
  // selected, otherwise the most common one among the shown trips (the same
  // rule the Statistics tab uses for its charts).
  const homeCurrency = useMemo(() => {
    if (activeTripIds.length === 1) {
      return trips.find((t) => t.id === activeTripIds[0])?.homeCurrency ?? 'EUR';
    }
    const scope = activeTripIds.length === 0 ? trips : trips.filter((t) => activeTripIds.includes(t.id));
    const counts: Record<string, number> = {};
    for (const t of scope) counts[t.homeCurrency] = (counts[t.homeCurrency] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'EUR';
  }, [activeTripIds, trips]);

  // ONE load of every expense, filtered in JS. Deliberately NOT re-queried per
  // filter toggle: toggling a trip is instant, and the query is metadata-only
  // (no receipt BLOBs) so it stays cheap even with thousands of rows.
  //
  // Skip one focus event after an incremental delete/save to avoid a full
  // re-fetch.
  const skipNextFocusRef = useRef(false);
  useFocusEffect(() => {
    if (skipNextFocusRef.current) {
      skipNextFocusRef.current = false;
      return;
    }
    let alive = true;
    (async () => {
      const list = await loadExpensesForList();
      if (alive) setExpenses(list);
    })();
    return () => {
      alive = false;
    };
  });

  const filteredExpenses = useMemo(
    () => filterExpensesByTrips(expenses, activeTripIds),
    [expenses, activeTripIds],
  );

  // The list is loaded WITHOUT receipt BLOBs, and saveExpense writes
  // `receiptPhoto` verbatim — so editing MUST get the full row or merely saving
  // would delete the photo. Fetch that one row before opening the form.
  const openExpenseForEdit = async (expense: Expense) => {
    try {
      const full = await loadExpense(expense.id);
      if (!full) {
        Alert.alert('Could not open expense', 'This expense could not be loaded.');
        return;
      }
      setEditingExpense(full);
      setFormOpen(true);
    } catch (e) {
      Alert.alert('Could not open expense', e instanceof Error ? e.message : String(e));
    }
  };

  // Filter by category + search — applied on top of the trip filter.
  const list = useMemo(() => {
    return filteredExpenses.filter(
      (e) =>
        (catFilter === 'All' || e.category === catFilter) &&
        (query.trim() === '' ||
          [e.notes, e.category, e.country, e.location]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(query.trim().toLowerCase()))),
    );
  }, [filteredExpenses, catFilter, query]);

  const totalHome = useMemo(() => list.reduce((sum, e) => sum + toHomeCurrency(e), 0), [list]);

  // Local "today" key (YYYY-MM-DD) for the jump-to-Today affordance.
  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

  // Per-day sections (newest first): header shows a friendly day label
  // (Today / Yesterday / 28 Aug 2026) plus the day's total in home currency.
  // Multi-day-split expenses are expanded: each covered day shows its share
  // and contributes that share to the day total.
  const sections = useMemo(() => {
    return groupByDaySplitAware(list).map((s) => ({
      ...s,
      dayTotal: s.data.reduce(
        (sum, entry) => sum + (entry.splitShare ?? toHomeCurrency(entry.expense)),
        0,
      ),
    }));
  }, [list]);

  // Index of the Today section (sections are newest-first, so Today is usually 0).
  const todayIndex = useMemo(() => sections.findIndex((s) => s.day === todayStr), [sections, todayStr]);

  // Jump-to-Today: always visible when there is a Today section and the user
  // might need to scroll to it (visible on past days, today, and future days).
  const listRef = useRef<SectionList<any, any>>(null);
  const jumpToToday = () => {
    const targetIndex = todayIndex >= 0 ? todayIndex : 0;
    listRef.current?.scrollToLocation({ sectionIndex: targetIndex, itemIndex: 0, viewOffset: 0 });
  };

  // Safety net: SectionList requires onScrollToIndexFailed when scrollToLocation
  // is called without getItemLayout (dynamic section heights).
  const onScrollToIndexFailed = useCallback(() => {
    // Silently swallow — Today section is likely already visible or near top
  }, []);

  // Auto-scroll to Today on open/focus. Only needed when Today is NOT the first
  // section (sections are newest-first, so Today is usually index 0 = visible).
  useEffect(() => {
    if (todayIndex <= 0) return; // Already at top or no Today section
    const timer = setTimeout(() => {
      listRef.current?.scrollToLocation({ sectionIndex: todayIndex, itemIndex: 0, viewOffset: 0 });
    }, 300);
    return () => clearTimeout(timer);
  }, [todayIndex]);

  // Daily average / budget: only meaningful for ONE trip (a budget is per trip),
  // using the SAME shared helper the Trips tab and trip detail use, so the
  // screens can never show different numbers. Under multi-select/"All trips"
  // there is no single budget, so only the total is shown.
  const stats = useMemo(
    () => (singleTrip ? computeTripStats(singleTrip, filteredExpenses) : null),
    [singleTrip, filteredExpenses],
  );
  const dailyAverage = stats?.dailyAverage ?? 0;

  const hasTodaySection = todayIndex >= 0;
  const isAtToday = todayIndex === 0 && sections.length > 0 && sections[0].day === todayStr;
  const showTodayJump = hasTodaySection && !isAtToday;

  const handleSave = async (expense: Expense) => {
    const { saveExpense } = await import('../../src/db/expenseRepo');
    await saveExpense(expense);
    setFormOpen(false);
    skipNextFocusRef.current = true;
    // Incrementeel: voeg toe aan bestaande array (geen volledige herlaad)
    setExpenses((prev) => [expense, ...prev]);
  };


  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <AppLogo size={36} />
          <Text style={styles.appTitle}>4 My Travels</Text>
        </View>
        <Pressable style={styles.settingsIcon} onPress={() => router.push('/settings')}>
          <Ionicons name="settings-outline" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Web/PWA notices (storage health + install nudge) under the app title. */}
      <WebNotices />

      {/* Title row: filter label under the title (same as Statistics), then the
          search + trip-filter actions. */}
      <View style={styles.titleRow}>
        <View style={styles.titleTextWrap}>
          <Text style={styles.screenTitle}>Expenses</Text>
          <Text style={styles.filterLabel} numberOfLines={1}>
            {filterLabel}
          </Text>
        </View>
        <View style={styles.titleActions}>
          {!searchOpen && (
            <Pressable onPress={() => setSearchOpen(true)} style={styles.iconButtonLarge}>
              <Ionicons name="search-outline" size={28} color={colors.mutedForeground} />
            </Pressable>
          )}
          <Pressable
            style={styles.iconButtonLarge}
            onPress={() => setPickerOpen(true)}
            accessibilityLabel="Filter by trip"
          >
            <Ionicons name="airplane-outline" size={26} color={colors.primary} />
            {activeTripIds.length > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeTripIds.length}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* Stats: daily avg / budget only for a single trip (a budget is per trip);
          the total always applies to whatever is currently shown. */}
      {(singleTrip || list.length > 0) && (
        <View style={styles.statsRow}>
          {singleTrip && (
            <StatBox
              label="Daily avg / budget"
              value={`${formatMoney(dailyAverage, homeCurrency)} / ${formatMoney(singleTrip.dailyBudget, homeCurrency)}`}
            />
          )}
          <StatBox label="Total spend" value={formatMoney(totalHome, homeCurrency)} />
        </View>
      )}


      <SectionList
        ref={listRef}
        style={{ flex: 1 }}
        sections={sections}
        keyExtractor={(entry, index) => `${entry.expense.id}@${entry.day}@${index}`}
        onScrollToIndexFailed={onScrollToIndexFailed}
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text style={styles.dayLabel}>{section.label}</Text>
            <Text style={styles.dayTotal}>
              {formatMoney(section.dayTotal, homeCurrency)}
            </Text>
          </View>
        )}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 80 }]}
        ListHeaderComponent={
          <>
            {searchOpen && (
              <View style={styles.searchBar}>
                <Ionicons name="search" size={18} color={colors.mutedForeground} />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search notes, places, categories"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoFocus
                />
                {query !== '' && (
                  <Pressable hitSlop={8} onPress={() => setQuery('')}>
                    <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
                  </Pressable>
                )}
                <Pressable onPress={() => { setQuery(''); setSearchOpen(false); }}>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: fontSize.sm }}>Cancel</Text>
                </Pressable>
              </View>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chips}>
              {['All', ...EXPENSE_CATEGORIES].map((c) => {
                const active = catFilter === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCatFilter(c)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Ionicons
                      name={c === 'All' ? 'apps-outline' : categoryIcon(c)}
                      size={14}
                      color={active ? colors.foreground : colors.mutedForeground}
                    />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        }
        renderItem={({ item }) => (
          <ExpenseRow
            expense={item.expense}
            homeCurrency={homeCurrency}
            splitShare={item.splitShare}
            background={colors.primary12}
            dense
            onPress={() => {
              // Full row (incl. the receipt) before the form opens — see
              // openExpenseForEdit.
              void openExpenseForEdit(item.expense);
            }}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {trips.length === 0
              ? 'Create a trip first.'
              : activeTripIds.length === 0
                ? 'No expenses yet.'
                : 'No expenses for the selected trips.'}
          </Text>
        }
      />

      {/* Rows fade out under the floating nav (rendered after the list but
          before the FAB / Today pill, so those stay crisp; the nav itself lives
          in app/_layout and paints on top). Flag: FADE_UNDER_NAV in FadeScrim. */}
      <NavFadeScrim />

      {/* Trip filter sheet — tap to toggle, any number of trips (or none = all).
          Same interaction as the Statistics tab. */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setPickerOpen(false)}>
          <View style={[styles.pickerSheet, { marginBottom: insets.bottom }]}>
            <Text style={styles.pickerTitle}>Filter by trip</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              <Pressable style={styles.pickerRow} onPress={() => setTripFilter([])}>
                <Ionicons
                  name="apps-outline"
                  size={18}
                  color={activeTripIds.length === 0 ? colors.primary : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.pickerRowText,
                    activeTripIds.length === 0 && { color: colors.primary, fontWeight: '700' },
                  ]}
                >
                  All trips
                </Text>
                {activeTripIds.length === 0 && (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                )}
              </Pressable>
              {trips.map((t) => {
                const on = activeTripIds.includes(t.id);
                return (
                  <Pressable key={t.id} style={styles.pickerRow} onPress={() => toggleTrip(t.id)}>
                    <Ionicons
                      name="airplane-outline"
                      size={18}
                      color={on ? colors.primary : colors.mutedForeground}
                    />
                    <Text style={[styles.pickerRowText, on && { color: colors.primary, fontWeight: '700' }]}>
                      {t.name}
                    </Text>
                    {on && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.pickerDoneWrap}>
              <Button label="Done" onPress={() => setPickerOpen(false)} />
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Add/edit-expense sheet */}
      <ModalHost visible={formOpen} onRequestClose={() => { setFormOpen(false); setEditingExpense(null); }}>
        {formTrip && (
          <ExpenseForm
            tripId={formTrip.id}
            defaultCurrency={formTrip.defaultCurrency}
            homeCurrency={formTrip.homeCurrency}
            initialExpense={editingExpense ?? undefined}
            onClose={() => { setFormOpen(false); setEditingExpense(null); }}
            onSave={handleSave}
            onDelete={async (expense) => {
              const t0 = Date.now();
              try {
                console.log(`[delete] START id=${expense.id}`);
                const { deleteExpense } = await import('../../src/db/expenseRepo');
                console.log(`[delete] import took ${Date.now() - t0}ms`);
                await deleteExpense(expense.id);
                console.log(`[delete] DB delete took ${Date.now() - t0}ms`);
                setFormOpen(false);
                setEditingExpense(null);
                skipNextFocusRef.current = true;
                setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
                console.log(`[delete] UI update took ${Date.now() - t0}ms`);
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                Alert.alert('Delete failed', msg);
              }
            }}
          />
        )}
      </ModalHost>

      {showTodayJump && (
        <View style={[styles.todayWrap, { bottom: insets.bottom + 88 }]}>
          <Pressable style={styles.todayPill} onPress={jumpToToday}>
            <Ionicons name="arrow-up" size={16} color={colors.primaryForeground} />
            <Text style={styles.todayPillText}>Today</Text>
          </Pressable>
        </View>
      )}

      {/* FAB — pinned above the floating nav. Files the expense under `formTrip`
          (the single filtered trip, else the active/most-recent one). */}
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 94 }]}
        onPress={() => {
          if (!formTrip) {
            Alert.alert('No trip yet', 'Create a trip before adding expenses.');
            return;
          }
          setFormOpen(true);
        }}
      >
        <Ionicons name="add" size={32} color={colors.primaryForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  addButtonText: { color: colors.primaryForeground, fontWeight: '700', fontSize: fontSize.md },
  settingsIcon: {
    padding: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMedium,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tripSelectorText: { flex: 1, color: colors.foreground, fontSize: fontSize.md, fontWeight: '600', fontFamily: fontFamily.sans },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  titleTextWrap: { flex: 1 },
  // Which trips the list below is showing ("All trips" / one name / "3 trips").
  // Same treatment as the Statistics tab.
  filterLabel: {
    color: colors.mutedForeground,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    marginTop: 2,
  },
  filterBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    color: colors.primaryForeground,
    fontSize: 10,
    fontWeight: '800',
    fontFamily: fontFamily.sans,
  },
  pickerDoneWrap: { marginTop: spacing.lg },
  screenTitle: { color: colors.foreground, fontSize: fontSize['4xl'], fontWeight: '800', fontFamily: fontFamily.heading },
  titleActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    padding: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMedium,
  },
  iconButtonLarge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceMedium,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tripSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  summaryRow: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  summaryText: {
    color: colors.mutedForeground,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
  },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...fabShadow,
  },
  todayWrap: {
    position: 'absolute',
    bottom: 24, // sits just above the bottom tab bar, inline style adds insets.bottom
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  todayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  todayPillText: { color: colors.primaryForeground, fontWeight: '700', fontSize: fontSize.md, fontFamily: fontFamily.sans },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  list: { paddingHorizontal: spacing.xl },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // Tightened for the dense list: the day label is a divider, not a block.
    // (paddingTop 12 → 8, paddingBottom 8 → 4, margins 4/4 → 4/0.)
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    marginTop: spacing.xs,
    // No bottom border here: every row now carries its own separator, so a
    // rule here would render as a double line above the first entry.
    marginBottom: 0,
    marginHorizontal: -spacing.xl,
    borderBottomWidth: 0,
  },
  dayLabel: {
    flex: 1,
    color: colors.mutedForeground,
    fontSize: fontSize.md,
    fontWeight: '700',
    fontFamily: fontFamily.heading,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingLeft: spacing.xl,
  },
  dayTotal: {
    color: colors.foreground,
    fontSize: fontSize.md,
    fontWeight: '700',
    fontFamily: fontFamily.sans,
    paddingRight: spacing.xl,
  },
  totalText: { color: colors.mutedForeground, fontSize: fontSize.md, fontFamily: fontFamily.sans, marginTop: spacing.md },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.foreground, marginLeft: spacing.md, fontSize: fontSize.md, fontFamily: fontFamily.sans, paddingVertical: 0 },
  chipScroll: { marginTop: spacing.md, marginBottom: spacing.sm },
  chips: { gap: spacing.sm, paddingRight: spacing.xl },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary12, borderColor: colors.primaryBorder },
  chipText: { color: colors.mutedForeground, fontWeight: '500', fontFamily: fontFamily.sans },
  chipTextActive: { color: colors.foreground, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    marginHorizontal: -spacing.xl,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
    backgroundColor: colors.primary12,
  },
  details: { flex: 1, marginLeft: spacing.md },
  rowTitle: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '600', fontFamily: fontFamily.sans, marginBottom: 2 },
  metaText: { color: colors.mutedForeground, fontSize: fontSize.md, fontFamily: fontFamily.sans },
  priceCol: { alignItems: 'flex-end' },
  priceMain: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '600', fontFamily: fontFamily.sans },
  priceSub: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: 2 },
  empty: { color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.xl, fontFamily: fontFamily.sans },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    padding: spacing.xl,
  },
  pickerTitle: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '700', fontFamily: fontFamily.heading, marginBottom: spacing.lg },
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
});
