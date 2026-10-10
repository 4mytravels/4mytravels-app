import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppLogo } from '../../src/components/AppLogo';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, radius, fontSize, spacing, fabShadow } from '../../src/theme/theme';
import { Pill } from '../../src/components/ui';
import { TripCard } from '../../src/components/TripCard';
import { ExpenseRow } from '../../src/components/ExpenseRow';
import { ExpenseForm } from '../../src/components/ExpenseForm';
import { WebNotices } from '../../src/components/WebNotices';
import { NavFadeScrim } from '../../src/components/FadeScrim';
import { loadExpenses } from '../../src/db/expenseRepo';
import { useTripStore, deriveTripStatus } from '../../src/store/tripStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { loadRateCache } from '../../src/services/rateCache';
import type { Expense } from '../../src/types';
import { formatMoney, formatMoneyWhole, toHomeCurrency } from '../../src/utils/currency';
import { groupByDaySplitAware } from '../../src/utils/days';
import { inclusiveDays } from '../../src/utils/pace';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Skip one focus event after an incremental delete/save to avoid a full
  // re-fetch (which re-parses every receipt BLOB and causes the ~5s stall).
  const skipNextFocusRef = useRef(false);

  // Reload on every focus so new expenses appear without an app restart.
  useFocusEffect(() => {
    if (skipNextFocusRef.current) {
      skipNextFocusRef.current = false;
      return;
    }
    let alive = true;
    (async () => {
      try {
        const list = await loadExpenses();
        if (alive) {
          setExpenses(list);
          setLoading(false);
        }
      } catch {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  });

  const trips = useTripStore((s) => s.trips);
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
  const todayTotal = useMemo(() => {
    return todayEntries.reduce((sum, entry) => {
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
  }, [todayEntries]);

  // Unique countries: only from active or past trips (not upcoming).
  const countrySet = new Set<string>();
  for (const t of trips) {
    const status = deriveTripStatus(t);
    if (status === 'active' || status === 'past') {
      for (const c of t.countries ?? []) countrySet.add(c.toUpperCase());
    }
  }
  for (const e of expenses) {
    if (e.country) countrySet.add(e.country.toUpperCase());
  }
  const countries = countrySet.size;

  // Active trip: must have started (startDate <= now) and not ended.
  // Sorts by startDate DESC so the most-recently-started trip wins.
  const activeTrip = trips
    .filter((t) => {
      const start = new Date(`${t.startDate}T12:00:00`);
      const ended = t.endDate ? new Date(`${t.endDate}T12:00:00`) < now : false;
      return !isNaN(start.getTime()) && start <= now && !ended;
    })
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0];

  const activeTripSpent = activeTrip
    ? expenses
        .filter((e) => e.tripId === activeTrip.id)
        .reduce((sum, e) => {
          const converted = toDisplay(e.amount, e.currency);
          return sum + (converted != null ? converted : toHomeCurrency(e));
        }, 0)
    : 0;

  // Total spent across all trips (for the quick-fact pill). Whole currency
  // units (no cents) — the user asked to drop the decimals on the home stats.
  const totalSpent = expenses.reduce((sum, e) => {
    const converted = toDisplay(e.amount, e.currency);
    return sum + (converted != null ? converted : toHomeCurrency(e));
  }, 0);

  // Total travel days: every PAST trip counts its full length, every ACTIVE
  // trip counts from its start date up to AND INCLUDING today (never its future
  // end date). UPCOMING trips are excluded entirely — days you have not travelled
  // yet must not be counted. All day counting is inclusive (start day = day 1).
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const totalDays = trips.reduce((sum, t) => {
    const status = deriveTripStatus(t);
    if (status === 'upcoming') return sum;
    // Past → the end date; active/open-ended → today. Both inclusive.
    const endKey = status === 'past' && t.endDate ? t.endDate : todayKey;
    return sum + inclusiveDays(t.startDate, endKey);
  }, 0);

  // Quick-add target trip: the ACTIVE trip (started, not ended) — the same
  // selection rule as the Expenses tab. It used to be the trip of the most
  // recent expense, which handed the form a FUTURE trip when the last entry
  // was pre-logged. Falls back to the most recently started trip.
  const targetTrip = activeTrip ?? [...trips].sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0];

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
          <Pressable style={styles.settingsIcon} onPress={() => router.push('/settings')}>
            <Ionicons name="settings-outline" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Web/PWA notices (storage health + install nudge) under the app title. */}
        <WebNotices />

        {/* Active trip — the SAME card as the Trips tab
            (src/components/TripCard.tsx): photo stage with badge/name/dates/day
            bar/verdict, flat footer with Daily avg + Total. Tapping opens the
            trip detail screen, exactly like the Trips tab does. */}
        {activeTrip && (
          <TripCard
            style={styles.tripCard}
            trip={activeTrip}
            expenses={expenses.filter((e) => e.tripId === activeTrip.id)}
            onPress={() => router.push(`/trip/${activeTrip.id}`)}
          />
        )}

        {/* Quick facts */}
        <View style={styles.quickFacts}>
          <Pill icon="location-outline" text={`${countries} countries`} />
          <Pill icon="calendar-outline" text={`${totalDays} ${totalDays === 1 ? 'day' : 'days'}`} />
          <Pressable onPress={() => router.push('/statistics')}>
            <Pill icon="wallet-outline" text={`${formatMoneyWhole(totalSpent, displayCurrency)} spent`} />
          </Pressable>
        </View>

        {/* Expenses today */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Expenses today</Text>
          <Text style={styles.sectionTotal}>{formatMoney(todayTotal, displayCurrency)}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
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
              onPress={() => {
                setEditingExpense(entry.expense);
                setFormOpen(true);
              }}
            />
          ))
        )}
      </ScrollView>

      {/* Rows fade out under the floating nav (rendered before the FAB so the
          button itself stays crisp). */}
      <NavFadeScrim />

      {/* FAB — pinned above the floating nav */}
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 94 }]}
        onPress={() => {
          if (targetTrip) {
            setFormOpen(true);
          } else {
            router.push('/trips/new');
          }
        }}
      >
        <Ionicons name="add" size={32} color={colors.primaryForeground} />
      </Pressable>

      {/* Add/edit-expense sheet (one tap from Home; rows open in edit mode) */}
      <Modal visible={formOpen && (!!targetTrip || !!editingExpense)} animationType="slide" onRequestClose={() => { setFormOpen(false); setEditingExpense(null); }}>
        {targetTrip && (
          <ExpenseForm
            tripId={editingExpense?.tripId ?? targetTrip.id}
            defaultCurrency={targetTrip.defaultCurrency}
            homeCurrency={targetTrip.homeCurrency}
            initialExpense={editingExpense ?? undefined}
            onClose={() => { setFormOpen(false); setEditingExpense(null); }}
            onSave={async (expense) => {
              const { saveExpense } = await import('../../src/db/expenseRepo');
              await saveExpense(expense);
              setFormOpen(false);
              setEditingExpense(null);
              skipNextFocusRef.current = true;
              // Incrementeel: voeg toe aan bestaande array (geen volledige herlaad)
              setExpenses((prev) => [expense, ...prev]);
            }}
            onDelete={async (expense) => {
              try {
                const { deleteExpense } = await import('../../src/db/expenseRepo');
                await deleteExpense(expense.id);
                setFormOpen(false);
                setEditingExpense(null);
                skipNextFocusRef.current = true;
                // Incrementeel: verwijder uit bestaande array (geen volledige herlaad)
                setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                Alert.alert('Delete failed', msg);
              }
            }}
          />
        )}
      </Modal>
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
});
