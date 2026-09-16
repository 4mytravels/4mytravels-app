import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppLogo } from '../../src/components/AppLogo';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, radius, fontSize, spacing, fabShadow } from '../../src/theme/theme';
import { Pill, IconCircle, categoryIcons } from '../../src/components/ui';
import { ExpenseForm } from '../../src/components/ExpenseForm';
import { loadExpenses } from '../../src/db/expenseRepo';
import { useTripStore, deriveTripStatus } from '../../src/store/tripStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { loadRateCache } from '../../src/services/rateCache';
import type { Expense, Trip } from '../../src/types';
import { formatMoney, toHomeCurrency } from '../../src/utils/currency';
import { groupByDaySplitAware } from '../../src/utils/days';
import { bytesToDataUri } from '../../src/utils/image';

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

  // Total spent across all trips (for the quick-fact pill).
  const totalSpent = expenses.reduce((sum, e) => {
    const converted = toDisplay(e.amount, e.currency);
    return sum + (converted != null ? converted : toHomeCurrency(e));
  }, 0);

  // Most recent trip = the add-expense target for the FAB.
  const latestTripId = expenses[0]?.tripId;
  const latestTrip = trips.find((t) => t.id === latestTripId);

  const activeCoverBytes = (activeTrip as (Trip & { coverBytes?: Uint8Array | null }) | undefined)?.coverBytes;
  const activeCoverUri = activeCoverBytes ? bytesToDataUri(activeCoverBytes) : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
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

        {/* Journey Card — active trip hero */}
        {activeTrip && (
          <View style={styles.journeyCard}>
            {activeCoverUri && (
              <View style={styles.journeyCoverWrap}>
                <Image source={{ uri: activeCoverUri }} style={styles.journeyCover} />
                <View style={styles.journeyCoverOverlay} />
              </View>
            )}
            <View style={[styles.journeyKicker, { zIndex: 1 }]}>
              <Text style={styles.journeyKickerText}>Active trip</Text>
            </View>
            <Text style={[styles.journeyTitle, { zIndex: 1 }]}>{activeTrip.name}</Text>
            <View style={[styles.journeyMeta, { zIndex: 1 }]}>
              <Ionicons name="calendar-outline" size={14} color={colors.mutedForeground} />
              <Text style={styles.journeyMetaText}>
                {activeTrip.startDate} — {activeTrip.endDate || 'open'}
              </Text>
            </View>
          </View>
        )}

        {/* Quick facts */}
        <View style={styles.quickFacts}>
          <Pill icon="location-outline" text={`${countries} countries`} />
          <Pressable onPress={() => router.push('/statistics')}>
            <Pill icon="wallet-outline" text={`${formatMoney(totalSpent, displayCurrency)} spent`} />
          </Pressable>
        </View>

        {/* Expenses today */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Expenses today</Text>
          <Text style={styles.sectionTotal}>{formatMoney(todayTotal, displayCurrency)}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : todaysExpenses.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No expenses logged today.</Text>
          </View>
        ) : (
          todayEntries.map((entry) => {
            const e = entry.expense;
            const isSplitDay = entry.splitShare != null;
            return (
              <Pressable
                key={`${e.id}@${entry.day}`}
                style={styles.expenseCard}
                onPress={() => { setEditingExpense(e); setFormOpen(true); }}
              >
                <IconCircle icon={categoryIcons[e.category]} size={40} />
                <View style={styles.expenseDetails}>
                  <Text style={styles.expenseTitle}>{e.notes || e.category}</Text>
                  <Text style={styles.expenseSub}>
                    {e.category} · {isSplitDay ? "today's share" : e.rateDate}
                  </Text>
                </View>
                <View style={styles.expensePriceCol}>
                  <Text style={styles.expensePrice}>
                    {isSplitDay
                      ? formatMoney(
                          e.rateToHome > 0 ? (entry.splitShare as number) / e.rateToHome : e.amount,
                          e.currency,
                        )
                      : formatMoney(e.amount, e.currency)}
                  </Text>
                  <Text style={styles.expensePriceSub}>
                    {(() => {
                      const dayPartExpense =
                        entry.splitShare != null
                          ? (e.rateToHome > 0 ? (entry.splitShare as number) / e.rateToHome : e.amount)
                          : e.amount;
                      const converted = toDisplay(dayPartExpense, e.currency);
                      return converted != null
                        ? `≈ ${formatMoney(converted, displayCurrency)}`
                        : `≈ ${formatMoney(toHomeCurrency(e), displayCurrency)}`;
                    })()}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* FAB — pinned above the floating nav */}
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 94 }]}
        onPress={() => {
          if (latestTrip) {
            setFormOpen(true);
          } else {
            router.push('/trips/new');
          }
        }}
      >
        <Ionicons name="add" size={32} color={colors.primaryForeground} />
      </Pressable>

      {/* Add/edit-expense sheet (one tap from Home; rows open in edit mode) */}
      <Modal visible={formOpen && (!!latestTrip || !!editingExpense)} animationType="slide" onRequestClose={() => { setFormOpen(false); setEditingExpense(null); }}>
        {latestTrip && (
          <ExpenseForm
            tripId={editingExpense?.tripId ?? latestTrip.id}
            defaultCurrency={latestTrip.defaultCurrency}
            homeCurrency={latestTrip.homeCurrency}
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
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: 80 },
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
  journeyCard: {
    position: 'relative',
    overflow: 'hidden',
    height: 224,
    marginTop: spacing.sm,
    padding: spacing.xl,
    borderRadius: radius['3xl'],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  journeyCoverWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  journeyCover: {
    width: '100%',
    height: '100%',
  },
  journeyCoverOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  journeyKicker: {
    marginBottom: spacing.sm,
  },
  journeyKickerText: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontFamily: fontFamily.sans,
  },
  journeyTitle: {
    fontFamily: fontFamily.heading,
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  journeyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  journeyMetaText: {
    color: colors.mutedForeground,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans,
  },
  journeyProgress: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    bottom: spacing.xl,
  },
  journeyProgressHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  journeyProgressLabel: {
    color: colors.success,
    fontSize: fontSize.xs,
    fontWeight: '700',
    fontFamily: fontFamily.sans,
  },
  journeyProgressValue: {
    color: colors.mutedForeground,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans,
  },
  progressTrack: {
    height: 5,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceStrong,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  quickFacts: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
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
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  expensePrice: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '600', fontFamily: fontFamily.sans },
  expenseDetails: { flex: 1, marginLeft: spacing.md },
  expenseTitle: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '600', fontFamily: fontFamily.sans },
  expenseSub: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: 2 },
  expensePriceCol: { alignItems: 'flex-end' },
  expensePriceSub: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: 2 },
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
