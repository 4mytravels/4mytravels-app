import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ScrollView, Modal, Alert, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppLogo } from '../../src/components/AppLogo';
import { TripCard } from '../../src/components/TripCard';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useTripStore, deriveTripStatus } from '../../src/store/tripStore';
import { loadExpenses } from '../../src/db/expenseRepo';
import { deleteTrip as deleteTripDb } from '../../src/db/tripRepo';
import { colors, fontFamily, radius, fontSize, spacing } from '../../src/theme/theme';
import { Button } from '../../src/components/ui';
import { NavFadeScrim } from '../../src/components/FadeScrim';
import { WebNotices } from '../../src/components/WebNotices';
import { confirmDestructive } from '../../src/utils/confirm';
import type { Trip, TripStatus, Expense } from '../../src/types';

const FILTERS: Array<'All' | TripStatus> = ['All', 'active', 'upcoming', 'past'];

export default function TripsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const trips = useTripStore((s) => s.trips);
  const removeTripStore = useTripStore((s) => s.removeTrip);
  const [filter, setFilter] = useState<'All' | TripStatus>('All');
  // Which trip's manage sheet (Edit / Delete) is open.
  const [managing, setManaging] = useState<Trip | null>(null);
  // Full expense lists (not just sums) so the card can use the SAME
  // computeTripStats as the trip detail screen — otherwise daily avg /
  // over-budget / day counter drift apart between the two screens.
  const [expensesByTrip, setExpensesByTrip] = useState<Record<string, Expense[]>>({});
  // MUST be declared before the early return below (rules of hooks): the
  // empty-trips branch renders fewer hooks, which crashed React ("Rendered
  // more hooks than during the previous render") the moment the first trip
  // was saved.
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Load expenses per trip for the cards' stats (shared computeTripStats).
  //
  // ON FOCUS, not only when the trip list changes: logging an expense on the
  // Expenses tab left every card showing the old figures until the app was
  // restarted. Same pattern as home/expenses/statistics.
  const loadTripExpenses = useCallback(() => {
    let alive = true;
    (async () => {
      const map: Record<string, Expense[]> = {};
      for (const t of trips) {
        map[t.id] = await loadExpenses(t.id);
      }
      if (alive) setExpensesByTrip(map);
    })();
    return () => {
      alive = false;
    };
  }, [trips]);

  useFocusEffect(loadTripExpenses);

  const visible = trips.filter((t) => filter === 'All' || deriveTripStatus(t) === filter);

  const handleDelete = (trip: Trip) => {
    // Alert.alert does nothing on the PWA — see src/utils/confirm.ts.
    confirmDestructive({
      title: 'Delete trip',
      message: `Delete "${trip.name}" and all its expenses?`,
      onConfirm: async () => {
        removeTripStore(trip.id);
        try {
          await deleteTripDb(trip.id);
        } catch (e) {
          Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
        }
      },
    });
  };

  if (trips.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <WebNotices />
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

  const onRefresh = async () => {
    setRefreshing(true);
    const map: Record<string, Expense[]> = {};
    for (const t of trips) {
      map[t.id] = await loadExpenses(t.id);
    }
    setExpensesByTrip(map);
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header />
      <WebNotices />
      <FlatList
        data={visible}
        keyExtractor={(t) => t.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 106 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
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
                  <Pressable key={f} onPress={() => setFilter(f)} style={[styles.tab, active && styles.tabActive]}>
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
            style={styles.cardWrap}
            trip={item}
            expenses={expensesByTrip[item.id] ?? []}
            onPress={() => router.push(`/trip/${item.id}`)}
            onManage={() => setManaging(item)}
          />
        )}
        ListEmptyComponent={<Text style={styles.emptyFilter}>No trips in this filter.</Text>}
      />

      {/* Trip cards fade out under the floating nav. */}
      <NavFadeScrim />

      <ManageSheet
        trip={managing}
        onClose={() => setManaging(null)}
        onEdit={(t) => {
          setManaging(null);
          router.push({ pathname: '/trips/new', params: { editId: t.id } });
        }}
        onDelete={(t) => {
          setManaging(null);
          handleDelete(t);
        }}
      />
    </SafeAreaView>
  );
}

function Header() {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <View style={[styles.logoRow, { gap: 12 }]}>
        <AppLogo size={36} />
        <Text style={styles.appTitle}>4 My Travels</Text>
      </View>
      <Pressable style={styles.settingsIcon} onPress={() => router.push('/settings')}>
        <Ionicons name="settings-outline" size={22} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

/** Bottom sheet with Edit / Delete for one trip. */
function ManageSheet({
  trip,
  onClose,
  onEdit,
  onDelete,
}: {
  trip: Trip | null;
  onClose: () => void;
  onEdit: (t: Trip) => void;
  onDelete: (t: Trip) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!trip} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        {trip && (
          <View style={[styles.sheet, { marginBottom: insets.bottom }]}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {trip.name}
            </Text>
            <Pressable style={styles.sheetItem} onPress={() => onEdit(trip)}>
              <Ionicons name="create-outline" size={20} color={colors.foreground} />
              <Text style={styles.sheetItemText}>Edit trip</Text>
            </Pressable>
            <Pressable style={styles.sheetItem} onPress={() => onDelete(trip)}>
              <Ionicons name="trash-outline" size={20} color={colors.destructive} />
              <Text style={[styles.sheetItemText, { color: colors.destructive }]}>Delete trip</Text>
            </Pressable>
            <Pressable style={[styles.sheetItem, styles.sheetCancel]} onPress={onClose}>
              <Text style={styles.sheetItemText}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  settingsIcon: {
    padding: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMedium,
    borderWidth: 1,
    borderColor: colors.border,
  },
  appTitle: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '700', fontFamily: fontFamily.heading },
  list: { paddingHorizontal: spacing.xl, paddingBottom: 106 },
  // Spacing between the shared TripCards in this list (the card itself is
  // src/components/TripCard.tsx, shared with the trip detail screen).
  cardWrap: { marginBottom: spacing.xl },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: spacing.lg },
  screenTitle: { color: colors.foreground, fontSize: fontSize['4xl'], fontWeight: '800', fontFamily: fontFamily.heading },
  newButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg, borderRadius: radius.full, gap: spacing.sm },
  newButtonText: { color: colors.primaryForeground, fontWeight: '600', fontFamily: fontFamily.sans },
  tabsScroll: { marginBottom: spacing.lg },
  tabs: { gap: spacing.sm, paddingRight: spacing.lg },
  tab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    position: 'relative',
  },
  tabText: { color: colors.mutedForeground, fontSize: fontSize.sm, fontWeight: '500', fontFamily: fontFamily.sans },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
    // Manage sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(5,5,15,0.70)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  sheetTitle: {
    fontFamily: fontFamily.heading,
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  sheetItem: { flexDirection: 'row', alignItems: 'center', height: 50, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  sheetItemText: { fontFamily: fontFamily.sans, fontSize: 15, fontWeight: '600', color: colors.foreground, marginLeft: spacing.md },
  sheetCancel: { marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] },
  emptyTitle: { fontSize: fontSize['2xl'], fontWeight: '700', color: colors.foreground, marginTop: spacing.lg, fontFamily: fontFamily.heading },
  emptyBody: { fontSize: fontSize.md, color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.sm },
  emptyFilter: { color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.xl, fontFamily: fontFamily.sans },
});