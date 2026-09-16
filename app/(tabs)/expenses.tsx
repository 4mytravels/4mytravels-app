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
import { loadExpenses } from '../../src/db/expenseRepo';
import { useTripStore } from '../../src/store/tripStore';
import type { Expense } from '../../src/types';
import { colors, fontFamily, radius, fontSize, spacing, fabShadow } from '../../src/theme/theme';
import { IconCircle, categoryIcons, Button, StatBox } from '../../src/components/ui';
import { ExpenseForm } from '../../src/components/ExpenseForm';
import { EXPENSE_CATEGORIES } from '../../src/types';
import { formatMoney, toHomeCurrency } from '../../src/utils/currency';
import { groupByDaySplitAware } from '../../src/utils/days';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDateRange(start: string, end: string): string {
  const s = start.slice(0, 10);
  const e = end.slice(0, 10);
  const startDate = new Date(`${s}T12:00:00Z`);
  const endDate = new Date(`${e}T12:00:00Z`);
  const sDay = startDate.getUTCDate();
  const eDay = endDate.getUTCDate();
  if (startDate.getUTCMonth() === endDate.getUTCMonth()) {
    return `${sDay}–${eDay} ${MONTHS_SHORT[startDate.getUTCMonth()]}`;
  }
  return `${sDay} ${MONTHS_SHORT[startDate.getUTCMonth()]}–${eDay} ${MONTHS_SHORT[endDate.getUTCMonth()]}`;
}

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

  // Exactly one trip is always selected; default to the param (deep link / FAB)
  // or the active/most recent trip.
  const [selectedId, setSelectedId] = useState<string | null>(
    params.tripId ?? defaultTrip?.id ?? null,
  );
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [homeCurrency, setHomeCurrency] = useState('EUR');
  const [catFilter, setCatFilter] = useState<string>('All');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(params.add === '1');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const selectedTrip = trips.find((t) => t.id === selectedId);

  useEffect(() => {
    if (!selectedId && defaultTrip) setSelectedId(defaultTrip.id);
  }, [trips, selectedId, defaultTrip]);

  useEffect(() => {
    setHomeCurrency(selectedTrip?.homeCurrency ?? 'EUR');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, trips.length]);

  // Reload on focus AND when the selected trip changes.
  // Skip one focus event after an incremental delete/save to avoid a full
  // re-fetch (which re-parses every receipt BLOB and causes the ~5s stall).
  const skipNextFocusRef = useRef(false);
  useFocusEffect(() => {
    if (skipNextFocusRef.current) {
      skipNextFocusRef.current = false;
      return;
    }
    let alive = true;
    (async () => {
      if (!selectedId) return;
      const list = await loadExpenses(selectedId);
      if (alive) setExpenses(list);
    })();
    return () => {
      alive = false;
    };
  });

  // Filter by category + search
  const list = useMemo(() => {
    return expenses.filter(
      (e) =>
        (catFilter === 'All' || e.category === catFilter) &&
        (query.trim() === '' ||
          [e.notes, e.category, e.country, e.location]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(query.trim().toLowerCase()))),
    );
  }, [expenses, catFilter, query]);

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

  // Daily average: split-aware total for elapsed days / days elapsed (min 1).
  // For past trips, use the trip end date as reference (not today).
  const dailyAverage = useMemo(() => {
    const startMs = selectedTrip ? new Date(`${selectedTrip.startDate}T12:00:00`).getTime() : NaN;
    const endMs = selectedTrip?.endDate ? new Date(`${selectedTrip.endDate}T12:00:00`).getTime() : NaN;
    const todayMs = Date.now();
    // Use end date for past trips, today for active trips
    const referenceMs = !Number.isNaN(endMs) && endMs < todayMs ? endMs : todayMs;
    const daysElapsed = Number.isNaN(startMs)
      ? 1
      : Math.max(1, Math.round((referenceMs - startMs) / 86_400_000));
    // Sum per-day shares for elapsed days only
    const splitAwareTotal = sections
      .filter((s) => s.day <= todayStr)
      .reduce((sum, s) => sum + s.data.reduce((sSum, entry) => sSum + (entry.splitShare ?? toHomeCurrency(entry.expense)), 0), 0);
    return splitAwareTotal / daysElapsed;
  }, [selectedTrip, sections, todayStr]);

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

      {/* Title row with add + search actions */}
      <View style={styles.titleRow}>
        <Text style={styles.screenTitle}>Expenses</Text>
        <View style={styles.titleActions}>
          {!searchOpen && (
            <Pressable onPress={() => setSearchOpen(true)} style={styles.iconButtonLarge}>
              <Ionicons name="search-outline" size={28} color={colors.mutedForeground} />
            </Pressable>
          )}
          <Pressable style={styles.iconButtonLarge} onPress={() => setPickerOpen(true)}>
            <Ionicons name="airplane-outline" size={26} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      {/* Stats: daily avg + total trip */}
      {selectedTrip && (
        <View style={styles.statsRow}>
          <StatBox
            label="Daily avg / budget"
            value={`${formatMoney(dailyAverage, homeCurrency)} / ${formatMoney(selectedTrip.dailyBudget, homeCurrency)}`}
          />
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
            onPress={() => {
              setEditingExpense(item.expense);
              setFormOpen(true);
            }}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {selectedTrip ? 'No expenses for this trip yet.' : 'Create a trip first.'}
          </Text>
        }
      />

      {/* Trip picker modal */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setPickerOpen(false)}>
          <View style={[styles.pickerSheet, { marginBottom: insets.bottom }]}>
            <Text style={styles.pickerTitle}>Select trip</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {trips.map((t) => (
                <Pressable
                  key={t.id}
                  style={[styles.pickerRow, t.id === selectedId && styles.pickerRowActive]}
                  onPress={() => {
                    setSelectedId(t.id);
                    setPickerOpen(false);
                  }}
                >
                  <Ionicons
                    name="airplane-outline"
                    size={18}
                    color={t.id === selectedId ? colors.primary : colors.mutedForeground}
                  />
                  <Text style={[styles.pickerRowText, t.id === selectedId && { color: colors.primary, fontWeight: '700' }]}>
                    {t.name}
                  </Text>
                  {t.id === selectedId && (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Add/edit-expense sheet */}
      <Modal visible={formOpen} animationType="slide" onRequestClose={() => { setFormOpen(false); setEditingExpense(null); }}>
        {selectedTrip && (
          <ExpenseForm
            tripId={selectedTrip.id}
            defaultCurrency={selectedTrip.defaultCurrency}
            homeCurrency={selectedTrip.homeCurrency}
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
      </Modal>

      {showTodayJump && (
        <View style={[styles.todayWrap, { bottom: insets.bottom + 88 }]}>
          <Pressable style={styles.todayPill} onPress={jumpToToday}>
            <Ionicons name="arrow-up" size={16} color={colors.primaryForeground} />
            <Text style={styles.todayPillText}>Today</Text>
          </Pressable>
        </View>
      )}

      {/* FAB — pinned above the floating nav */}
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 94 }]}
        onPress={() => setFormOpen(true)}
      >
        <Ionicons name="add" size={32} color={colors.primaryForeground} />
      </Pressable>
    </View>
  );
}

function ExpenseRow({
  expense,
  homeCurrency,
  onPress,
  splitShare = null,
}: {
  expense: Expense;
  homeCurrency: string;
  onPress: () => void;
  /** Set when this row is one day of a multi-day split: shows the share. */
  splitShare?: number | null;
}) {
  const isSplitDay = splitShare != null;
  const displayAmount = isSplitDay
    ? (splitShare as number) / expense.rateToHome
    : expense.amount;
  const displayCurrency = expense.currency;
  const homeAmount = isSplitDay
    ? (splitShare as number)
    : toHomeCurrency(expense);

  const detail = isSplitDay
    ? `Shared · ${shortDateRange(expense.multiDaySplit!.splitStart, expense.multiDaySplit!.splitEnd)}`
    : expense.location || expense.category;

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <IconCircle icon={categoryIcons[expense.category]} size={40} color="#FFFFFF" />
      <View style={styles.details}>
        <Text style={styles.rowTitle}>{expense.notes || expense.category}</Text>
        <Text style={styles.metaText}>{detail}</Text>
      </View>
      <View style={styles.priceCol}>
        <Text style={styles.priceMain}>
          {formatMoney(displayAmount, displayCurrency)}
        </Text>
        <Text style={styles.priceSub}>
          ≈ {formatMoney(homeAmount, homeCurrency)}
        </Text>
      </View>
    </Pressable>
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
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    marginHorizontal: -spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
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
