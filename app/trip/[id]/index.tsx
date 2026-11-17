import { useState, useMemo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, SectionList, TextInput } from 'react-native';
import { showStatus } from '../../../src/utils/statusDialog';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, router } from 'expo-router';
import { useTripStore } from '../../../src/store/tripStore';
import { loadExpense } from '../../../src/db/expenseRepo';
import { useExpenses, useExpenseStore } from '../../../src/store/expenseStore';
import { expensesOfTrip } from '../../../src/utils/expenseList';
import type { Expense } from '../../../src/types';
import { groupByDaySplitAware } from '../../../src/utils/days';
import { colors, fontFamily, radius, fontSize, spacing, themedStyles } from '../../../src/theme/theme';
import { SectionTitle, Button, IconCircle } from '../../../src/components/ui';
import { TripCard } from '../../../src/components/TripCard';
import { TripActionsMenu } from '../../../src/components/TripActionsMenu';
import { ExpenseForm } from '../../../src/components/ExpenseForm';
import { ModalHost } from '../../../src/components/ModalHost';
import { formatMoney, toHomeCurrency } from '../../../src/utils/currency';
import { ExpenseRow } from '../../../src/components/ExpenseRow';
import { NavFadeScrim } from '../../../src/components/FadeScrim';
import { WebNotices } from '../../../src/components/WebNotices';
import { changeTripCover } from '../../../src/utils/tripActions';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trip = useTripStore((s) => s.trips.find((t) => t.id === id));
  // M1: this trip's rows from the shared store — no own query on every
  // focus, and add/edit/delete show up on every screen at once.
  const { expenses: allExpenses } = useExpenses();
  const expenses = useMemo(
    () => (id ? expensesOfTrip(allExpenses, id) : []),
    [allExpenses, id],
  );
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // G1: search moved here from the former Expenses tab (same fields).
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();

  // ALL hooks are declared before the first early return. `if (!trip) return …`
  // used to sit between `useEffect` and `useMemo` (verified: 5 hooks before,
  // 1 after). Deleting the trip from this screen removes it from the store
  // while the /trip/<id> route stays mounted, so the component re-rendered
  // with trip === undefined and called 5 hooks instead of 6 — React error
  // #300 ("Rendered fewer hooks than expected"), which unmounts the whole
  // tree and leaves a blank screen. The rule: never let a conditional return
  // split the hook list.
  const visibleExpenses = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return expenses;
    return expenses.filter((e) =>
      [e.notes, e.category, e.country, e.location]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [expenses, query]);
  const sections = useMemo(
    () => (trip ? groupByDaySplitAware(visibleExpenses) : []),
    [trip, visibleExpenses],
  );

  // The list is loaded WITHOUT receipt BLOBs (see loadExpensesForList), and
  // saveExpense writes `receiptPhoto` verbatim — so the form MUST get the full
  // row, or merely opening + saving an expense would delete its photo. Fetch the
  // one row (indexed by primary key) before opening the sheet. If that fails we
  // do NOT open the form: a receipt-less expense in the edit path is a
  // data-loss bug, not a degraded UI.
  const openExpenseForEdit = useCallback(async (expense: Expense) => {
    try {
      const full = await loadExpense(expense.id);
      if (!full) {
        showStatus('Could not open expense', 'This expense could not be loaded.');
        return;
      }
      setEditingExpense(full);
      setExpenseOpen(true);
    } catch (e) {
      showStatus('Could not open expense', e instanceof Error ? e.message : String(e));
    }
  }, []);

  if (!trip) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.body}>Trip not found.</Text>
          <View style={{ marginTop: spacing.xl, width: '60%' }}>
            <Button label="Back to trips" onPress={() => router.replace('/trips')} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const handleSave = async (expense: Expense) => {
    await useExpenseStore.getState().save(expense);
    setExpenseOpen(false);
    setEditingExpense(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* No trip name here: the shared TripCard right below already shows it. */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.headerAction}
            onPress={() => { if (searchOpen) { setQuery(''); setSearchOpen(false); } else { setSearchOpen(true); } }}
            accessibilityRole="button"
            accessibilityLabel={searchOpen ? 'Close search' : 'Search expenses'}
          >
            <Ionicons name={searchOpen ? 'close' : 'search-outline'} size={22} color={colors.foreground} />
          </Pressable>
          {/* Q17: one ⋯ menu (Edit, Change photo, Export CSV, Delete) — the
              SAME menu a long-press on a TripCard opens. Delete is red, last,
              and confirmed (confirmDestructive works on the PWA too). */}
          <Pressable
            style={styles.headerAction}
            onPress={() => setMenuOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Actions for ${trip.name}`}
          >
            <Ionicons name="ellipsis-horizontal" size={24} color={colors.foreground} />
          </Pressable>
        </View>
      </View>

      <TripActionsMenu
        trip={menuOpen ? trip : null}
        onClose={() => setMenuOpen(false)}
        // replace, not back(): on web back() is a no-op when the screen was
        // opened directly (pattern 41).
        onDeleted={() => router.replace('/trips')}
      />

      {/* Web/PWA notices (storage health + install nudge) under the screen header. */}
      <WebNotices />

      <SectionList
        style={styles.body}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        sections={sections}
        keyExtractor={(entry, index) => `${entry.expense.id}@${entry.day}@${index}`}
        ListHeaderComponent={
          <>
            {/* SAME card as the Trips tab (src/components/TripCard.tsx) —
                photo + name + dates + day bar + verdict, figures below it. */}
            <View style={styles.heroCard}>
              {/* M9: a tap on the cover opens the photo picker directly
                  (2 taps instead of ⋯ → Change photo → picker). */}
              <TripCard
                trip={trip}
                expenses={expenses}
                onPress={() => { void changeTripCover(trip); }}
                pressLabel="Change trip photo"
              />
            </View>

            <View style={styles.sectionHead}>
              <SectionTitle title={`Expenses (${expenses.length})`} />
            </View>
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
                  <Pressable hitSlop={8} onPress={() => setQuery('')} accessibilityLabel="Clear search">
                    <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
                  </Pressable>
                )}
              </View>
            )}
          </>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text style={styles.dayLabel}>{section.label}</Text>
            <Text style={styles.dayTotal}>
              {formatMoney(
                section.data.reduce(
                  (s, entry) => s + (entry.splitShare ?? toHomeCurrency(entry.expense)),
                  0,
                ),
                trip.homeCurrency,
              )}
            </Text>
          </View>
        )}
        renderSectionFooter={() => <View style={{ height: spacing.md }} />}
        renderItem={({ item }) => (
          // SHARED row component — identical to the Expenses tab, including the
          // row tint and the edge-to-edge background.
          <ExpenseRow
            expense={item.expense}
            homeCurrency={trip.homeCurrency}
            splitShare={item.splitShare}
            background={colors.primary12}
            dense
            onPress={openExpenseForEdit}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.placeholder}>No expenses yet. Tap + to add the first one.</Text>
        }
      />

      {/* Expense rows fade out under the floating nav. */}
      <NavFadeScrim />

      {/* FAB */}
      <Pressable style={[styles.fab, { bottom: insets.bottom + 94 }]} onPress={() => setExpenseOpen(true)}>
        <Ionicons name="add" size={32} color={colors.primaryForeground} />
      </Pressable>

      <ModalHost visible={expenseOpen} onRequestClose={() => setExpenseOpen(false)}>
        <ExpenseForm
          tripId={trip.id}
          tripName={trip.name}
          defaultCurrency={trip.defaultCurrency}
          homeCurrency={trip.homeCurrency}
          initialExpense={editingExpense ?? undefined}
          onClose={() => { setExpenseOpen(false); setEditingExpense(null); }}
          onSave={handleSave}
          onDelete={async (expense) => {
            try {
              await useExpenseStore.getState().remove(expense.id);
              setExpenseOpen(false);
              setEditingExpense(null);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              showStatus('Delete failed', msg);
            }
          }}
        />
      </ModalHost>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // Back button on the left, the two actions on the right — no title: the trip
  // name lives on the card below (it was rendered twice before).
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  back: { padding: spacing.xs },
  body: { flex: 1, paddingHorizontal: spacing.xl },
  // The shared TripCard (photo + day bar + verdict, figures below) replaces the
  // old cover hero + date line + stat boxes.
  heroCard: { marginBottom: spacing.xl },
  sectionHead: { marginTop: spacing.sm },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: colors.surfaceSoft,
  },
  // minWidth 0: a flexed TextInput is an <input> on web and must be allowed to shrink (pattern 13a).
  searchInput: { flex: 1, minWidth: 0, color: colors.foreground, fontSize: fontSize.md, fontFamily: fontFamily.sans, paddingVertical: 0 },
  placeholder: { color: colors.mutedForeground, fontSize: fontSize.md, fontFamily: fontFamily.sans, marginTop: spacing.sm },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    marginTop: spacing.xs,
    // No bottom border here: every row now carries its own top separator, so a
    // rule here would render as a double line above the first entry.
    marginBottom: spacing.xs,
    // Pull the header out over the screen padding so it lines up with the rows
    // below (which are full-bleed). The label/total then carry their own
    // spacing.xl — identical to the Expenses tab.
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
  fab: {
    position: 'absolute',
    bottom: 118, // fallback; inline style overrides with insets.bottom + 94
    right: spacing.xl,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySolid,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Expenses trip-selector size (44x44); the glyph itself is 24px (user: a bit smaller).
  headerAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceMedium,
    justifyContent: 'center',
    alignItems: 'center',
  },
}));
