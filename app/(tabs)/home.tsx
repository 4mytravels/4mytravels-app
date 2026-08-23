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
import type { Expense } from '../../src/types';
import { formatMoney, toHomeCurrency } from '../../src/utils/currency';

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
          { transform: [{ rotate: rotation.interpolate({ inputRange: [-3600, 3600], outputRange: ['-3600deg', '3600deg'] }) }] },
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

  const totalSpent = expenses.reduce((sum, e) => sum + toHomeCurrency(e), 0);
  const trips = useTripStore((s) => s.trips);
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
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={[styles.scroll, { paddingBottom: 120 + insets.bottom }]}>
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
        <Pill icon="wallet-outline" text={`${formatMoney(totalSpent, 'EUR')} spent`} />
      </View>

      {/* Recent expenses */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Recent expenses</Text>
        <Text style={styles.sectionCount}>{expenses.length} entries</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : expenses.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No expenses yet. Open a trip and tap + to add one.</Text>
        </View>
      ) : (
        expenses.slice(0, 6).map((e) => (
          <View key={e.id} style={styles.expenseCard}>
            <IconCircle icon={categoryIcons[e.category]} size={40} />
            <View style={styles.expenseDetails}>
              <Text style={styles.expenseTitle}>{e.notes || e.category}</Text>
              <Text style={styles.expenseSub}>
                {e.category} · {e.rateDate}
              </Text>
            </View>
            <Text style={styles.expensePrice}>
              {formatMoney(e.amount, e.currency)}
            </Text>
          </View>
        ))
      )}

      {/* FAB — opens the Add-expense sheet directly for the most recent trip */}
      <Pressable
        style={[styles.fab, { bottom: 90 + insets.bottom }]}
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

      {/* Add-expense sheet (one tap from Home) */}
      <Modal visible={formOpen && !!latestTrip} animationType="slide" onRequestClose={() => setFormOpen(false)}>
        {latestTrip && (
          <ExpenseForm
            tripId={latestTrip.id}
            defaultCurrency={latestTrip.defaultCurrency}
            homeCurrency={latestTrip.homeCurrency}
            onClose={() => setFormOpen(false)}
            onSave={async (expense) => {
              const { saveExpense } = await import('../../src/db/expenseRepo');
              await saveExpense(expense);
              setFormOpen(false);
              setExpenses(await loadExpenses());
            }}
          />
        )}
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.xl },
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
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  sectionTitle: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '700', fontFamily: fontFamily.heading },
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
    marginBottom: spacing.md,
  },
  expenseDetails: { flex: 1, marginLeft: spacing.md },
  expenseTitle: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '600', fontFamily: fontFamily.sans },
  expenseSub: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: 2 },
  expensePrice: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '600', fontFamily: fontFamily.sans },
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
