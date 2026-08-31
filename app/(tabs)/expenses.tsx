import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppLogo } from '../../src/components/AppLogo';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadExpenses } from '../../src/db/expenseRepo';
import { useTripStore } from '../../src/store/tripStore';
import type { Expense } from '../../src/types';
import { colors, fontFamily, radius, fontSize, spacing } from '../../src/theme/theme';
import { IconCircle, categoryIcons, Button, StatBox } from '../../src/components/ui';
import { ExpenseForm } from '../../src/components/ExpenseForm';
import { EXPENSE_CATEGORIES } from '../../src/types';
import { formatMoney, toHomeCurrency } from '../../src/utils/currency';
import { groupByDaySplitAware } from '../../src/utils/days';

export default function ExpensesScreen() {
  const params = useLocalSearchParams<{ tripId?: string; add?: string }>();
  const insets = useSafeAreaInsets();
  const trips = useTripStore((s) => s.trips);
  // Exactly one trip is always selected; default to the param (deep link / FAB)
  // or the most recent trip.
  const [selectedId, setSelectedId] = useState<string | null>(
    params.tripId ?? trips[0]?.id ?? null,
  );
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [homeCurrency, setHomeCurrency] = useState('EUR');
  const [catFilter, setCatFilter] = useState<string>('All');
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(params.add === '1');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const selectedTrip = trips.find((t) => t.id === selectedId);

  useEffect(() => {
    if (!selectedId && trips.length > 0) setSelectedId(trips[0].id);
  }, [trips, selectedId]);

  useEffect(() => {
    setHomeCurrency(selectedTrip?.homeCurrency ?? 'EUR');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, trips.length]);

  const load = async () => {
    if (!selectedId) return;
    setExpenses(await loadExpenses(selectedId));
  };

  // Reload on focus AND when the selected trip changes.
  useFocusEffect(() => {
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

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const list = expenses.filter(
    (e) =>
      (catFilter === 'All' || e.category === catFilter) &&
      // Search across notes, category, country and location.
      (query.trim() === '' ||
        [e.notes, e.category, e.country, e.location]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(query.trim().toLowerCase()))),
  );

  const totalHome = list.reduce((sum, e) => sum + toHomeCurrency(e), 0);

  // Local "today" key (YYYY-MM-DD) for the jump-to-Today affordance.
  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

  // Per-day sections (newest first): header shows a friendly day label
  // (Today / Yesterday / 28 Aug 2026) plus the day's total in home currency.
  // Multi-day-split expenses are expanded: each covered day shows its share
  // and contributes that share to the day total.
  const sections = groupByDaySplitAware(list).map((s) => ({
    ...s,
    dayTotal: s.data.reduce(
      (sum, entry) => sum + (entry.splitShare ?? toHomeCurrency(entry.expense)),
      0,
    ),
  }));

  // Index of the Today section (sections are newest-first, so Today is usually 0).
  const todayIndex = sections.findIndex((s) => s.day === todayStr);

  // Jump-to-Today: appears only once the user scrolls away from Today, then
  // snaps the list back to the top section.
  const listRef = useRef<SectionList<any, any>>(null);
  const [showToday, setShowToday] = useState(true);
  const scrollY = useRef(0);
  const handleScroll = (e: any) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  };
  const handleScrollEnd = () => setShowToday(scrollY.current <= 12);
  const jumpToToday = () => {
    if (todayIndex >= 0)
      listRef.current?.scrollToLocation({ sectionIndex: todayIndex, itemIndex: 0, viewOffset: 0 });
  };

  // Daily average: total spend divided by days elapsed since trip start (min 1).
  const startMs = selectedTrip ? new Date(`${selectedTrip.startDate}T12:00:00`).getTime() : NaN;
  const daysElapsed = Number.isNaN(startMs)
    ? 1
    : Math.max(1, Math.round((Date.now() - startMs) / 86_400_000));
  const dailyAverage = totalHome / daysElapsed;

  const handleSave = async (expense: Expense) => {
    const { saveExpense } = await import('../../src/db/expenseRepo');
    await saveExpense(expense);
    setFormOpen(false);
    await load();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <AppLogo size={36} />
          <Text style={styles.appTitle}>4 My Travels</Text>
        </View>
        <Pressable style={styles.addButton} onPress={() => setFormOpen(true)}>
          <Ionicons name="add" size={22} color={colors.primaryForeground} />
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>

      {/* Trip selector — always exactly one trip selected */}
      <View style={styles.titleRow}>
        <Text style={styles.screenTitle}>Expenses</Text>
      </View>
      <Pressable style={styles.tripSelector} onPress={() => setPickerOpen(true)}>
        <Ionicons name="airplane" size={16} color={colors.primary} />
        <Text style={styles.tripSelectorText} numberOfLines={1}>
          {selectedTrip ? selectedTrip.name : trips.length === 0 ? 'No trips yet' : 'Select a trip'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
      </Pressable>

      {/* Budget stats for the selected trip (mirrors trip-detail numbers) */}
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
        sections={sections}
        keyExtractor={(entry) => `${entry.expense.id}@${entry.day}`}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text style={styles.dayLabel}>{section.label}</Text>
            <Text style={styles.dayTotal}>
              {formatMoney(section.dayTotal, homeCurrency)}
            </Text>
          </View>
        )}
      contentContainerStyle={[styles.list, { paddingBottom: 80 + insets.bottom }]}
        ListHeaderComponent={
          <>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={20} color={colors.mutedForeground} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search notes, places, categories"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
              />
              {query !== '' && (
                <Pressable hitSlop={8} onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>
            <Text style={styles.totalText}>
              {formatMoney(totalHome, homeCurrency)} total
            </Text>
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
          <View style={[styles.pickerSheet, { marginBottom: insets.bottom + 80 }]}>
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
              const { deleteExpense } = await import('../../src/db/expenseRepo');
              await deleteExpense(expense.id);
              setFormOpen(false);
              setEditingExpense(null);
              await load();
            }}
          />
        )}
      </Modal>

      {!showToday && todayIndex >= 0 && (
        <View style={styles.todayWrap}>
          <Pressable style={styles.todayPill} onPress={jumpToToday}>
            <Ionicons name="arrow-up" size={16} color={colors.primaryForeground} />
            <Text style={styles.todayPillText}>Today</Text>
          </Pressable>
        </View>
      )}

      {/* FAB — pinned bottom-right */}
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
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
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <IconCircle icon={categoryIcons[expense.category]} size={50} />
      <View style={styles.details}>
        <Text style={styles.rowTitle}>{expense.notes || expense.category}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{expense.category}</Text>
          {isSplitDay ? (
            <>
              <Ionicons name="layers-outline" size={14} color={colors.mutedForeground} />
              <Text style={styles.metaText}>
                day share · split {expense.multiDaySplit?.splitStart} → {expense.multiDaySplit?.splitEnd}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.metaText}>{expense.rateDate}</Text>
              {expense.location ? <Text style={styles.metaText}>· {expense.location}</Text> : null}
            </>
          )}
        </View>
      </View>
      <View style={styles.priceCol}>
        <Text style={styles.priceMain}>
          {isSplitDay
            ? formatMoney(splitShare as number, homeCurrency)
            : formatMoney(expense.amount, expense.currency)}
        </Text>
        {isSplitDay ? (
          <Text style={styles.priceSub}>
            {expense.rateToHome > 0
              ? `${formatMoney((splitShare as number) / expense.rateToHome, expense.currency)} ${expense.currency}`
              : expense.currency}
          </Text>
        ) : (
          <Text style={styles.priceSub}>
            ≈ {formatMoney(toHomeCurrency(expense), homeCurrency)}
          </Text>
        )}
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
  },
  tripSelectorText: { flex: 1, color: colors.foreground, fontSize: fontSize.md, fontWeight: '600', fontFamily: fontFamily.sans },
  titleRow: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  screenTitle: { color: colors.foreground, fontSize: fontSize['4xl'], fontWeight: '800', fontFamily: fontFamily.heading },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  todayWrap: {
    position: 'absolute',
    bottom: 88,
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
    marginTop: spacing.md,
  },
  list: { paddingHorizontal: spacing.xl },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    marginTop: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  dayLabel: {
    color: colors.mutedForeground,
    fontSize: fontSize.md,
    fontWeight: '700',
    fontFamily: fontFamily.heading,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dayTotal: {
    color: colors.foreground,
    fontSize: fontSize.md,
    fontWeight: '700',
    fontFamily: fontFamily.sans,
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
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.mutedForeground, fontWeight: '500', fontFamily: fontFamily.sans },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  details: { flex: 1, marginLeft: spacing.md },
  rowTitle: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '700', fontFamily: fontFamily.sans, marginBottom: spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  metaText: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  priceCol: { alignItems: 'flex-end' },
  priceMain: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '700', fontFamily: fontFamily.sans },
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
