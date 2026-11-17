import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { showStatus } from '../../src/utils/statusDialog';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppLogo } from '../../src/components/AppLogo';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, radius, fontSize, spacing, fabShadow } from '../../src/theme/theme';
import { Pill, Button } from '../../src/components/ui';
import { TripCard } from '../../src/components/TripCard';
import { ExpenseRow } from '../../src/components/ExpenseRow';
import { ExpenseForm } from '../../src/components/ExpenseForm';
import { ModalHost } from '../../src/components/ModalHost';
import { WebNotices } from '../../src/components/WebNotices';
import { NavFadeScrim } from '../../src/components/FadeScrim';
import { loadExpense } from '../../src/db/expenseRepo';
import { useExpenses, useExpenseStore } from '../../src/store/expenseStore';
import { useTripStore, deriveTripStatus } from '../../src/store/tripStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { loadRateCache } from '../../src/services/rateCache';
import type { Expense, Trip } from '../../src/types';
import { TripActionsMenu } from '../../src/components/TripActionsMenu';
import { formatMoney, formatMoneyWhole, toHomeCurrency } from '../../src/utils/currency';
import { groupByDaySplitAware } from '../../src/utils/days';
import { pickActiveTrip, summarizeToday } from '../../src/utils/today';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // M1: the shared expense store — loaded once, updated in place on
  // save/delete, so a tab switch costs no query and edits show everywhere.
  const { expenses, loaded } = useExpenses();
  const loading = !loaded;
  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [menuTrip, setMenuTrip] = useState<Trip | null>(null);

  // The list is metadata-only (no receipt BLOB) and saveExpense writes the
  // receipt verbatim, so the edit form MUST get the full row (pattern 43).
  // Home used to hand the list row to the form, which wiped the receipt on
  // the next save. Stable callback so memo(ExpenseRow) holds (Q6).
  const openTodayExpense = useCallback(async (expense: Expense) => {
    try {
      const full = await loadExpense(expense.id);
      if (!full) {
        showStatus('Could not open expense', 'This expense could not be loaded.');
        return;
      }
      setEditingExpense(full);
      setFormOpen(true);
    } catch (e) {
      showStatus('Could not open expense', e instanceof Error ? e.message : String(e));
    }
  }, []);

  const trips = useTripStore((s) => s.trips);
  const tripsHydrated = useTripStore((s) => s.hydrated);
  // Home-wide display currency = the global default home currency from Settings
  // (not the per-trip currency), so the totals follow what the user set there.
  const defaultHomeCurrency = useSettingsStore((s) => s.defaultHomeCurrency);
  const displayCurrency = defaultHomeCurrency || 'EUR';

  // EUR-based cached rates (rates[quote] = quote per 1 EUR). Used to convert any
  // expense currency into the display (default home) currency consistently.
  const [cachedRates, setCachedRates] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let alive = true;
    loadRateCache('EUR').then((c) => { if (alive) setCachedRates(c?.rates ?? null); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  // Convert an amount in `from` currency into the display (default home) currency.
  const toDisplay = (amount: number, from: string): number | null => {
    if (from === displayCurrency) return amount;
    if (!cachedRates) return null;
    const rFrom = cachedRates[from];
    const rTo = cachedRates[displayCurrency];
    if (!rFrom || !rTo) return null;
    return (amount / rFrom) * rTo; // via EUR
  };

  // Local "today" key (YYYY-MM-DD).
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  // Memoize the expensive groupByDaySplitAware computation on expenses.
  const groupedToday = useMemo(() => groupByDaySplitAware(expenses), [expenses]);
  // Split-aware "today": expand multi-day expenses so each covered day shows its
  // per-day share (mirrors the Expenses tab's Today section). The single Today
  // section gives both the cards (with shares) and the running today total.
  const todaySection = useMemo(
    () => groupedToday.find((s) => s.day === todayStr),
    [groupedToday, todayStr],
  );
  const todayEntries = todaySection?.data ?? [];
  const todaysExpenses = todayEntries.map((entry) => entry.expense);
  // Not memoised: todayEntries and toDisplay are new each render, so a memo
  // never hit, and its old [todayEntries] deps hid stale rates (Q1 lint).
  const todayTotal = todayEntries.reduce((sum, entry) => {
      const e = entry.expense;
      // Day-part in the EXPENSE currency: for splits it's the per-day share
      // (splitShare is in trip-home currency, so divide back by rateToHome),
      // otherwise the full amount. Convert to the display (default home) currency.
      const dayPartExpense =
        entry.splitShare != null
          ? (e.rateToHome > 0 ? entry.splitShare / e.rateToHome : e.amount)
          : e.amount;
      const converted = toDisplay(dayPartExpense, e.currency);
      const dayPartHome = entry.splitShare ?? toHomeCurrency(e);
      return sum + (converted != null ? converted : dayPartHome);
    }, 0);

  // Active trip: running on TODAY's local calendar day (src/utils/today.ts).
  // The old check compared `new Date('<start>T12:00:00') <= now`, so a trip
  // starting today did not exist on Home until noon (found while testing G1:
  // "Plan your first trip" next to a trip created that morning).
  const activeTrip = pickActiveTrip(trips, todayStr);

  // G2: the "Today" block — today's spend on the active trip against its
  // daily budget, in the trip's home currency (the budget's currency).
  const today = useMemo(
    () => (activeTrip ? summarizeToday(expenses, activeTrip, todayStr) : null),
    [expenses, activeTrip, todayStr],
  );

  // Quick-add target trip: the ACTIVE trip (started, not ended) — the same
  // selection rule as the Expenses tab. It used to be the trip of the most
  // recent expense, which handed the form a FUTURE trip when the last entry
  // was pre-logged. Falls back to the most recently started trip.
  const targetTrip = activeTrip ?? [...trips].sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0];

  // Q8 hero selection. Upcoming: the soonest start. Past: the latest end.
  const nextTrip = activeTrip
    ? undefined
    : trips
        .filter((t) => deriveTripStatus(t) === 'upcoming')
        .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0];
  const lastTrip = activeTrip || nextTrip
    ? undefined
    : trips
        .filter((t) => deriveTripStatus(t) === 'past')
        .sort((a, b) => ((a.endDate ?? a.startDate) < (b.endDate ?? b.startDate) ? 1 : -1))[0];
  const heroTrip = activeTrip ?? nextTrip ?? lastTrip;
  const heroLabel = activeTrip ? null : nextTrip ? 'Next trip' : lastTrip ? 'Last trip' : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 106 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <AppLogo size={36} />
            <Text style={styles.appTitle}>4 My Travels</Text>
          </View>
        </View>

        {/* Web/PWA notices (storage health + install nudge) under the app title. */}
        <WebNotices />

        {/* Q8 hero — three variants: the ACTIVE trip; otherwise the next
            upcoming (or else the most recent past) trip with a label; with no
            trips at all a "create your first trip" card. The active-trip card
            is the SAME card as the Trips tab (src/components/TripCard.tsx). */}
        {heroTrip ? (
          <>
            {heroLabel && <Text style={styles.heroLabel}>{heroLabel}</Text>}
            <TripCard
              style={styles.tripCard}
              trip={heroTrip}
              expenses={expenses.filter((e) => e.tripId === heroTrip.id)}
              onPress={() => router.push(`/trip/${heroTrip.id}`)}
              onManage={() => setMenuTrip(heroTrip)}
            />
          </>
        ) : tripsHydrated ? (
          <View style={[styles.emptyCard, styles.tripCard, styles.firstTripCard]}>
            <Ionicons name="airplane-outline" size={40} color={colors.primaryText} />
            <Text style={styles.firstTripTitle}>Plan your first trip</Text>
            <Text style={styles.emptyText}>
              Create a trip, then log what you spend — converted to your home currency.
            </Text>
            <View style={styles.firstTripButton}>
              <Button label="Create your first trip" icon="add" onPress={() => router.push('/trips/new')} />
            </View>
          </View>
        ) : (
          <ActivityIndicator color={colors.primaryText} style={styles.tripCard} />
        )}

        {/* G2: Home revolves around TODAY — what you spent today on the
            active trip against its daily budget. Bar colours follow the
            TripCard rule (pattern 36): primary while within budget, muted
            grey when over; never red. No budget → the figure alone. */}
        {activeTrip && today && (
          <View style={styles.todayCard} accessibilityRole="summary">
            <Text style={styles.todayLabel}>Today · {activeTrip.name}</Text>
            <View style={styles.todayRow}>
              <Text style={styles.todayAmount}>{formatMoney(today.spent, activeTrip.homeCurrency)}</Text>
              {today.budget != null && (
                <Text style={styles.todayBudget}>
                  / {formatMoneyWhole(today.budget, activeTrip.homeCurrency)} budget
                </Text>
              )}
            </View>
            {today.ratio != null && (
              <View style={styles.todayTrack}>
                <View
                  style={[
                    styles.todayFill,
                    {
                      width: `${Math.round(today.ratio * 100)}%`,
                      backgroundColor: today.over ? colors.mutedForeground : colors.primary,
                    },
                  ]}
                />
              </View>
            )}
            {today.budget != null && (
              <Text style={styles.todayHint}>
                {today.over
                  ? `${formatMoney(today.spent - today.budget, activeTrip.homeCurrency)} over today's budget`
                  : `${formatMoney(today.budget - today.spent, activeTrip.homeCurrency)} left today`}
              </Text>
            )}
          </View>
        )}

        {/* Expenses today */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Expenses today</Text>
          <Text style={styles.sectionTotal}>{formatMoney(todayTotal, displayCurrency)}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primaryText} style={{ marginTop: spacing.xl }} />
        ) : todayEntries.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No expenses logged today.</Text>
          </View>
        ) : (
          /* The SAME row as the Expenses tab (src/components/ExpenseRow.tsx):
             expense currency on top, home below, hairline separators, split
             shares handled inside the row. */
          todayEntries.map((entry) => (
            <ExpenseRow
              key={`${entry.expense.id}@${entry.day}`}
              expense={entry.expense}
              homeCurrency={displayCurrency}
              splitShare={entry.splitShare}
              background={colors.primary12}
              onPress={openTodayExpense}
            />
          ))
        )}
      </ScrollView>

      {/* Rows fade out under the floating nav (rendered before the FAB so the
          button itself stays crisp). */}
      <NavFadeScrim />

      {/* FAB — pinned above the floating nav. G1: the FAB ALWAYS means "add
          expense"; with no trip there is nothing to file it under, so it is
          hidden (the empty-state card offers "Create your first trip"). */}
      {targetTrip && (
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 94 }]}
        accessibilityRole="button"
        accessibilityLabel="Add expense"
        onPress={() => setFormOpen(true)}
      >
        <Ionicons name="add" size={32} color={colors.primaryForeground} />
      </Pressable>
      )}

      {/* Q17: same trip menu as Trips tab / trip detail (⋯ or long-press). */}
      <TripActionsMenu trip={menuTrip} onClose={() => setMenuTrip(null)} />

      {/* Add/edit-expense sheet (one tap from Home; rows open in edit mode) */}
      <ModalHost visible={formOpen && (!!targetTrip || !!editingExpense)} onRequestClose={() => { setFormOpen(false); setEditingExpense(null); }}>
        {targetTrip && (
          <ExpenseForm
            tripId={editingExpense?.tripId ?? targetTrip.id}
            tripName={trips.find((t) => t.id === (editingExpense?.tripId ?? targetTrip.id))?.name}
            defaultCurrency={targetTrip.defaultCurrency}
            homeCurrency={targetTrip.homeCurrency}
            initialExpense={editingExpense ?? undefined}
            onClose={() => { setFormOpen(false); setEditingExpense(null); }}
            onSave={async (expense) => {
              // M1: insert-or-replace in the shared store (an edit used to be
              // prepended a second time).
              await useExpenseStore.getState().save(expense);
              setFormOpen(false);
              setEditingExpense(null);
            }}
            onDelete={async (expense) => {
              try {
                await useExpenseStore.getState().remove(expense.id);
                setFormOpen(false);
                setEditingExpense(null);
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                showStatus('Delete failed', msg);
              }
            }}
          />
        )}
      </ModalHost>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: 106 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  settingsIcon: {
    padding: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMedium,
    borderWidth: 1,
    borderColor: colors.border,
  },
  appTitle: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '700', fontFamily: fontFamily.heading },
  // Spacing wrapper for the shared TripCard (the card owns its own layout).
  tripCard: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  // G2: "Today" block (above the list of today's expenses).
  todayCard: {
    marginBottom: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft,
    gap: spacing.sm,
  },
  todayLabel: { color: colors.mutedForeground, fontSize: fontSize.sm, fontWeight: '600', fontFamily: fontFamily.sans },
  todayRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: spacing.xs },
  todayAmount: { color: colors.foreground, fontSize: fontSize['3xl'], fontWeight: '800', fontFamily: fontFamily.heading },
  todayBudget: { color: colors.mutedForeground, fontSize: fontSize.md, fontFamily: fontFamily.sans },
  todayTrack: { height: 8, borderRadius: radius.full, backgroundColor: colors.surfaceStrong, overflow: 'hidden' },
  todayFill: { height: '100%', borderRadius: radius.full },
  todayHint: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  quickFacts: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  sectionTitle: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '700', fontFamily: fontFamily.heading },
  sectionTotal: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '700', fontFamily: fontFamily.sans },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: { color: colors.mutedForeground, fontSize: fontSize.md, fontFamily: fontFamily.sans, textAlign: 'center' },
  heroLabel: {
    color: colors.mutedForeground,
    fontSize: fontSize.sm,
    fontWeight: '700',
    fontFamily: fontFamily.sans,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.sm,
  },
  firstTripCard: { alignItems: 'center', gap: spacing.sm },
  firstTripTitle: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '700', fontFamily: fontFamily.heading },
  firstTripButton: { alignSelf: 'stretch', marginTop: spacing.md },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySolid,
    justifyContent: 'center',
    alignItems: 'center',
    ...fabShadow,
  },
});
