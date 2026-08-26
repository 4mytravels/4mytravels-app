import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppLogo } from '../../src/components/AppLogo';
import { useNavigation, useRouter } from 'expo-router';
import { useTripStore, deriveTripStatus } from '../../src/store/tripStore';
import { loadExpenses } from '../../src/db/expenseRepo';
import { updateTrip, deleteTrip as deleteTripDb } from '../../src/db/tripRepo';
import { colors, fontFamily, radius, fontSize, spacing } from '../../src/theme/theme';
import { Card, Button, StatBox } from '../../src/components/ui';
import { computePace } from '../../src/utils/pace';
import { formatMoney, toHomeCurrency } from '../../src/utils/currency';
import type { Trip, TripStatus } from '../../src/types';

const FILTERS: Array<'All' | TripStatus> = ['All', 'active', 'upcoming', 'past'];

export default function TripsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const trips = useTripStore((s) => s.trips);
  const updateTripStore = useTripStore((s) => s.updateTrip);
  const removeTripStore = useTripStore((s) => s.removeTrip);
  const [filter, setFilter] = useState<'All' | TripStatus>('All');
  const [spentByTrip, setSpentByTrip] = useState<Record<string, number>>({});

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Load real spend per trip for the cards' progress/pace.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const map: Record<string, number> = {};
      for (const t of trips) {
        const exps = await loadExpenses(t.id);
        map[t.id] = exps.reduce((s, e) => s + toHomeCurrency(e), 0);
      }
      if (mounted) setSpentByTrip(map);
    })();
    return () => {
      mounted = false;
    };
  }, [trips]);

  const visible = trips.filter((t) => filter === 'All' || deriveTripStatus(t) === filter);

  const handleDelete = (trip: Trip) => {
    Alert.alert('Delete trip', `Delete "${trip.name}" and all its expenses?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          removeTripStore(trip.id);
          try {
            await deleteTripDb(trip.id);
          } catch (e) {
            Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  if (trips.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <View style={styles.empty}>
          <Ionicons name="airplane-outline" size={48} color={colors.mutedForeground} />
          <Text style={styles.emptyTitle}>No trips yet</Text>
          <Text style={styles.emptyBody}>Create your first trip to start tracking spends.</Text>
          <View style={{ marginTop: spacing.xl, width: '70%' }}>
            <Button label="New trip" icon="add" onPress={() => router.push('/trips/new')} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header />
      <FlatList
        data={visible}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <View style={styles.titleRow}>
              <Text style={styles.screenTitle}>Trips</Text>
              <Pressable style={styles.newButton} onPress={() => router.push('/trips/new')}>
                <Ionicons name="add" size={18} color={colors.primaryForeground} />
                <Text style={styles.newButtonText}>New trip</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabsScroll}
              contentContainerStyle={styles.tabs}
            >
              {FILTERS.map((f) => {
                const active = filter === f;
                return (
                  <Pressable key={f} onPress={() => setFilter(f)} style={[styles.tab, active && { backgroundColor: colors.primary }]}>
                    <Text style={[styles.tabText, active && { color: colors.primaryForeground, fontWeight: '600' }]}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        }
        renderItem={({ item }) => (
          <TripCard
            trip={item}
            spent={spentByTrip[item.id] ?? 0}
            onPress={() => router.push(`/trip/${item.id}`)}
            onEdit={() => router.push({ pathname: '/trips/new', params: { editId: item.id } })}
            onDelete={() => handleDelete(item)}
          />
        )}
        ListEmptyComponent={<Text style={styles.emptyFilter}>No trips in this filter.</Text>}
      />
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <View style={[styles.logoRow, { gap: 12 }]}>
        <AppLogo size={36} />
        <Text style={styles.appTitle}>4 My Travels</Text>
      </View>
    </View>
  );
}

// BLOB → data-URI for <Image source> (cover photos live encrypted in the DB).
function bytesToDataUri(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return 'data:image/jpeg;base64,' + btoa(bin);
}

function TripCard({
  trip,
  spent,
  onPress,
  onEdit,
  onDelete,
}: {
  trip: Trip;
  spent: number;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = deriveTripStatus(trip);
  const pace = computePace({
    dailyBudget: trip.dailyBudget,
    tripStartDate: trip.startDate,
    tripEndDate: trip.endDate,
    today: new Date(),
    cumulativeActualSpend: spent,
  });
  const pct = pace.projectedTotalBudget ? Math.min(1, pace.actualSpend / pace.projectedTotalBudget) : 0.3;
  const coverBytes = (trip as Trip & { coverBytes?: Uint8Array | null }).coverBytes;
  const tripCoverUri = coverBytes ? bytesToDataUri(coverBytes) : null;

  return (
    <Pressable onPress={onPress} onLongPress={onEdit} style={({ pressed }) => [styles.cardWrap, pressed && { opacity: 0.92 }]}>
      <Card>
        <View style={styles.cardHeader}>
          <View style={styles.titleRow}>
            {tripCoverUri ? (
              <Image source={{ uri: tripCoverUri }} style={styles.cardPhoto} />
            ) : (
              <View style={styles.iconCircle}>
                <Ionicons name="airplane-outline" size={20} color={colors.accent} />
              </View>
            )}
            <Text style={styles.cardTitle} numberOfLines={1}>{trip.name}</Text>
            <View style={[styles.badge, status === 'active' && styles.badgeActive]}>
              <Text style={[styles.badgeText, status === 'active' && { color: colors.success }]}>
                {status.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        {/* Date row with edit/delete actions at its end */}
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.mutedForeground} />
          <Text style={[styles.metaText, { flex: 1 }]}>
            {trip.startDate}
            {trip.endDate ? ` - ${trip.endDate}` : ' - open'}
          </Text>
          <Pressable onPress={onEdit} hitSlop={8}>
            <Ionicons name="pencil-outline" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8} style={{ marginLeft: spacing.md }}>
            <Ionicons name="trash-outline" size={18} color={colors.destructive} />
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <StatBox
            label="Daily avg / budget"
            value={`${formatMoney(trip.dailyBudget > 0 ? spent / Math.max(1, pace.daysElapsed) : 0, trip.homeCurrency)} / ${formatMoney(trip.dailyBudget, trip.homeCurrency)}`}
          />
          <StatBox label="Total spend" value={formatMoney(spent, trip.homeCurrency)} />
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
        </View>
        <View style={styles.progressFooter}>
          <View style={styles.trackStatus}>
            <Ionicons
              name={pace.status === 'over_budget' ? 'trending-down' : 'trending-up'}
              size={14}
              color={pace.status === 'over_budget' ? colors.destructive : colors.success}
            />
            <Text style={[styles.trackText, { color: pace.status === 'over_budget' ? colors.destructive : colors.success }]}>
              {pace.status === 'over_budget' ? 'Over budget' : 'On track'}
            </Text>
          </View>
          <Text style={styles.progressText}>
            Day {pace.daysElapsed}
            {pace.projectedTotalBudget ? ` of ${Math.round(pace.projectedTotalBudget / trip.dailyBudget)}` : ''}
            {' · '}expected {formatMoney(pace.expectedSpend, trip.homeCurrency)}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  appTitle: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '700', fontFamily: fontFamily.heading },
  list: { paddingHorizontal: spacing.xl, paddingBottom: 120 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: spacing.lg },
  screenTitle: { color: colors.foreground, fontSize: fontSize['4xl'], fontWeight: '800', fontFamily: fontFamily.heading },
  newButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg, borderRadius: radius.full, gap: spacing.sm },
  newButtonText: { color: colors.primaryForeground, fontWeight: '600', fontFamily: fontFamily.sans },
  tabsScroll: { marginBottom: spacing.lg },
  tabs: { gap: spacing.sm, paddingRight: spacing.lg },
  tab: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.05)' },
  tabText: { color: colors.mutedForeground, fontSize: fontSize.sm, fontWeight: '500', fontFamily: fontFamily.sans },
  cardWrap: { marginBottom: spacing.lg },
  cardHeader: { marginBottom: spacing.md },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  cardPhoto: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.secondary, marginRight: spacing.md },
  cardTitle: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '700', fontFamily: fontFamily.heading, flex: 1 },
  cardActions: { flexDirection: 'row', alignItems: 'center' },
  badge: { backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 6 },
  badgeActive: { backgroundColor: 'rgba(53,211,153,0.15)' },
  badgeText: { color: colors.mutedForeground, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  metaText: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  progressTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  progressFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  trackStatus: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trackText: { fontSize: fontSize.sm, fontWeight: '600', fontFamily: fontFamily.sans },
  progressText: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] },
  emptyTitle: { fontSize: fontSize['2xl'], fontWeight: '700', color: colors.foreground, marginTop: spacing.lg, fontFamily: fontFamily.heading },
  emptyBody: { fontSize: fontSize.md, color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.sm },
  emptyFilter: { color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.xl, fontFamily: fontFamily.sans },
});
