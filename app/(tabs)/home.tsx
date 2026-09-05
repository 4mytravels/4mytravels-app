import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Modal,
  Animated,
  PanResponder,
  Easing,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppLogo } from '../../src/components/AppLogo';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, radius, fontSize, spacing } from '../../src/theme/theme';
import { Pill, IconCircle, categoryIcons } from '../../src/components/ui';
import { ExpenseForm } from '../../src/components/ExpenseForm';
import { loadExpenses } from '../../src/db/expenseRepo';
import { useTripStore } from '../../src/store/tripStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { loadRateCache } from '../../src/services/rateCache';
import type { Expense } from '../../src/types';
import { formatMoney, toHomeCurrency } from '../../src/utils/currency';
import { groupByDaySplitAware } from '../../src/utils/days';

// Rotating night-side earth hero (Lovable "My Travel Compass" design).
// Spins slowly on its own; the user can grab and spin it (drag = rotate,
// release keeps momentum via a gentle decay back to idle speed).
function Globe() {
  const rotation = useRef(new Animated.Value(0)).current;
  const offset = useRef(0); // accumulated degrees from drags
  const autoAnim = useRef<Animated.CompositeAnimation | null>(null);

  const startAutoSpin = () => {
    autoAnim.current?.stop();
    // Loop: each iteration adds a slow full turn.
    const loop = () => {
      Animated.timing(rotation, {
        toValue: offset.current + 360,
        duration: 60000, // one calm revolution per minute
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          offset.current = (offset.current + 360) % 360000;
          loop();
        }
      });
    };
    loop();
  };

  useEffect(() => {
    startAutoSpin();
    return () => autoAnim.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Pause auto-spin; freeze current angle as the drag baseline.
        autoAnim.current?.stop();
        rotation.stopAnimation((v) => {
          offset.current = v;
        });
      },
      onPanResponderMove: (_e, g) => {
        rotation.setValue(offset.current + g.dx * 0.5);
      },
      onPanResponderRelease: (_e, g) => {
        offset.current += g.dx * 0.5;
        // Fling: let momentum carry briefly, then resume the calm idle spin.
        if (Math.abs(g.vx) > 0.3) {
          Animated.decay(rotation, {
            velocity: g.vx * 0.5,
            deceleration: 0.995,
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (finished) {
              rotation.stopAnimation((v) => {
                offset.current = v;
                startAutoSpin();
              });
            }
          });
        } else {
          rotation.stopAnimation((v) => {
            offset.current = v;
            startAutoSpin();
          });
        }
      },
    }),
  ).current;

  return (
    <View style={styles.globe} {...pan.panHandlers}>
      <Animated.Image
        source={require('../../assets/earth-night.jpg')}
        style={[
          styles.globeImage,
          // Negative degrees = westward spin (left-to-right across the map),
          // like travelling around the world eastward.
          { transform: [{ rotate: rotation.interpolate({ inputRange: [-3600, 3600], outputRange: ['3600deg', '-3600deg'] }) }] },
        ]}
        resizeMode="cover"
      />
      <View style={{ position: 'absolute', bottom: 8, right: 8 }}>
        <Ionicons name="sync-outline" size={16} color="rgba(255,255,255,0.45)" />
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Reload on every focus so new expenses appear without an app restart.
  useFocusEffect(() => {
    let alive = true;
    (async () => {
      const list = await loadExpenses();
      if (alive) {
        setExpenses(list);
        setLoading(false);
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

  // Total spent across all trips, shown in the display (default home) currency.
  const totalSpent = expenses.reduce((sum, e) => {
    const converted = toDisplay(e.amount, e.currency);
    return sum + (converted != null ? converted : toHomeCurrency(e));
  }, 0);

  // Local "today" key (YYYY-MM-DD).
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  // Split-aware "today": expand multi-day expenses so each covered day shows its
  // per-day share (mirrors the Expenses tab's Today section). The single Today
  // section gives both the cards (with shares) and the running today total.
  const todaySection = groupByDaySplitAware(expenses).find((s) => s.day === todayStr);
  const todayEntries = todaySection?.data ?? [];
  const todaysExpenses = todayEntries.map((entry) => entry.expense);
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

  // Unique countries: from trip country tags first, falling back to per-expense country.
  const countrySet = new Set<string>();
  for (const t of trips) {
    for (const c of t.countries ?? []) countrySet.add(c.toUpperCase());
  }
  for (const e of expenses) {
    if (e.country) countrySet.add(e.country.toUpperCase());
  }
  const countries = countrySet.size;

  // Most recent trip = the add-expense target for the FAB.
  const latestTripId = expenses[0]?.tripId;
  const latestTrip = trips.find((t) => t.id === latestTripId);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
    <ScrollView style={styles.container} contentContainerStyle={[styles.scroll, { paddingBottom: 80 + insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.logoRow, { gap: spacing.md }]}>
          <AppLogo size={36} />
          <Text style={styles.appTitle}>4 My Travels</Text>
        </View>
      </View>

      {/* Night-earth hero */}
      <Globe />

      {/* Stats */}
      <View style={styles.statsRow}>
        <Pill icon="location-outline" text={`${countries} countries`} />
        <Pressable onPress={() => router.push('/statistics')} style={styles.totalSpentPill}>
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

    {/* FAB — pinned outside the ScrollView so it stays fixed bottom-right */}
    <Pressable
      style={[styles.fab, { bottom: insets.bottom + 24 }]}
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
            // Incrementeel: voeg toe aan bestaande array (geen volledige herlaad)
            setExpenses((prev) => [expense, ...prev]);
          }}
          onDelete={async (expense) => {
            try {
              const { deleteExpense } = await import('../../src/db/expenseRepo');
              await deleteExpense(expense.id);
              setFormOpen(false);
              setEditingExpense(null);
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
  appTitle: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '700', fontFamily: fontFamily.heading },
  globe: {
    height: 240,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  globeImage: {
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  totalSpentPill: { flex: 1 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  sectionTitle: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '700', fontFamily: fontFamily.heading },
  sectionTotal: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '700', fontFamily: fontFamily.sans },
  sectionCount: { color: colors.mutedForeground, fontSize: fontSize.md, fontFamily: fontFamily.sans },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  emptyText: { color: colors.mutedForeground, fontSize: fontSize.md, fontFamily: fontFamily.sans, textAlign: 'center' },
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  expenseDetails: { flex: 1, marginLeft: spacing.md },
  expenseTitle: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '600', fontFamily: fontFamily.sans },
  expenseSub: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: 2 },
  expensePrice: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '600', fontFamily: fontFamily.sans },
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
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});
