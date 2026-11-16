import { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppLogo } from '../../src/components/AppLogo';
import { TripCard } from '../../src/components/TripCard';
import { TripActionsMenu } from '../../src/components/TripActionsMenu';
import { useNavigation, useRouter } from 'expo-router';
import { useTripStore, deriveTripStatus } from '../../src/store/tripStore';
import { useExpenses, useExpenseStore } from '../../src/store/expenseStore';
import { groupExpensesByTrip } from '../../src/utils/expenseList';
import { colors, fontFamily, radius, fontSize, spacing } from '../../src/theme/theme';
import { Button } from '../../src/components/ui';
import { NavFadeScrim } from '../../src/components/FadeScrim';
import { WebNotices } from '../../src/components/WebNotices';
import type { Trip, TripStatus } from '../../src/types';

const FILTERS: Array<'All' | TripStatus> = ['All', 'active', 'upcoming', 'past'];

export default function TripsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const trips = useTripStore((s) => s.trips);
  const hydrated = useTripStore((s) => s.hydrated);
  const [filter, setFilter] = useState<'All' | TripStatus>('All');
  // Which trip's manage sheet (Edit / Delete) is open.
  const [managing, setManaging] = useState<Trip | null>(null);
  // Full expense lists (not just sums) so the card can use the SAME
  // computeTripStats as the trip detail screen — otherwise daily avg /
  // over-budget / day counter drift apart between the two screens.
  // M1: derived from the shared store (one load for the app, kept current by
  // save/delete everywhere) — was a fresh query on every focus.
  const { expenses: allExpenses } = useExpenses();
  const expensesByTrip = useMemo(
    () => groupExpensesByTrip(allExpenses, trips.map((t) => t.id)),
    [allExpenses, trips],
  );
  // MUST be declared before the early return below (rules of hooks): the
  // empty-trips branch renders fewer hooks, which crashed React ("Rendered
  // more hooks than during the previous render") the moment the first trip
  // was saved.
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const visible = trips.filter((t) => filter === 'All' || deriveTripStatus(t) === filter);


  // Q8: until the store has its first list, a spinner — never a flash of the
  // "No trips yet" empty state on a cold start.
  if (!hydrated) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primaryText} accessibilityLabel="Loading trips" />
        </View>
      </SafeAreaView>
    );
  }

  if (trips.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <WebNotices />
        <View style={styles.empty}>
          <Ionicons name="airplane-outline" size={48} color={colors.mutedForeground} />
          <Text style={styles.emptyTitle}>No trips yet</Text>
          <Text style={styles.emptyBody}>Create your first trip to start tracking expenses.</Text>
          <View style={{ marginTop: spacing.xl, width: '70%' }}>
            <Button label="New trip" icon="add" onPress={() => router.push('/trips/new')} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await useExpenseStore.getState().reload();
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
              <Button label="New trip" icon="add" size="sm" onPress={() => router.push('/trips/new')} />
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

      {/* Q17: the SAME menu as the ⋯ on trip detail (⋯ button or long-press
          on a card). */}
      <TripActionsMenu trip={managing} onClose={() => setManaging(null)} />
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
  tabsScroll: { marginBottom: spacing.lg },
  tabs: { gap: spacing.sm, paddingRight: spacing.lg },
  tab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMedium,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  tabText: { color: colors.mutedForeground, fontSize: fontSize.sm, fontWeight: '500', fontFamily: fontFamily.sans },
  tabActive: {
    backgroundColor: colors.primarySolid,
    borderColor: colors.primary,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] },
  emptyTitle: { fontSize: fontSize['2xl'], fontWeight: '700', color: colors.foreground, marginTop: spacing.lg, fontFamily: fontFamily.heading },
  emptyBody: { fontSize: fontSize.md, color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.sm },
  emptyFilter: { color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.xl, fontFamily: fontFamily.sans },
});