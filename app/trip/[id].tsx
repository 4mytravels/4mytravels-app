import { useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SectionList,
  Modal,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useTripStore } from '../../src/store/tripStore';
import { loadExpenses, saveExpense, deleteExpense } from '../../src/db/expenseRepo';
import type { Expense } from '../../src/types';
import { groupByDaySplitAware } from '../../src/utils/days';
import { colors, fontFamily, radius, fontSize, spacing } from '../../src/theme/theme';
import { Card, StatBox, SectionTitle, Button, IconCircle, categoryIcons } from '../../src/components/ui';
import { ExpenseForm } from '../../src/components/ExpenseForm';
import { computePace } from '../../src/utils/pace';
import { formatMoney, toHomeCurrency } from '../../src/utils/currency';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trip = useTripStore((s) => s.trips.find((t) => t.id === id));
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const insets = useSafeAreaInsets();

  // Skip one focus event after an incremental delete/save to avoid a full
  // re-fetch (which re-parses every receipt BLOB and causes the ~5s stall).
  const skipNextFocusRef = useRef(false);
  const load = async () => {
    if (skipNextFocusRef.current) {
      skipNextFocusRef.current = false;
      return;
    }
    if (!id) return;
    setExpenses(await loadExpenses(id));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!trip) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.body}>Trip not found.</Text>
          <View style={{ marginTop: spacing.xl, width: '60%' }}>
            <Button label="Back" onPress={() => router.back()} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const sections = useMemo(() => groupByDaySplitAware(expenses), [expenses]);

  const cumulativeSpend = useMemo(() => expenses.reduce((sum, e) => sum + toHomeCurrency(e), 0), [expenses]);

  // Daily average = spent / elapsed days. Reference day: today, unless a later
  // expense exists — then the latest expense day counts (so pre-logged future
  // expenses don't inflate the average).
  const { dailyAverage, daysActive } = useMemo(() => {
    const lastExpenseDay = expenses.reduce((max, e) => {
      const t = Date.parse(e.createdAt || e.rateDate);
      return Number.isNaN(t) ? max : Math.max(max, t);
    }, 0);
    const todayStart = new Date(); todayStart.setHours(12, 0, 0, 0);
    const endMs = trip.endDate ? new Date(`${trip.endDate}T12:00:00`).getTime() : NaN;
    // Use end date for past trips, today for active trips
    const referenceMs = !Number.isNaN(endMs) && endMs < todayStart.getTime()
      ? endMs
      : Math.max(todayStart.getTime(), lastExpenseDay || 0);
    const tripStart = new Date(`${trip.startDate}T12:00:00`);
    const days = Math.max(
      1,
      Math.round((referenceMs - (isNaN(tripStart.getTime()) ? referenceMs : tripStart.getTime())) / 86_400_000) + 1,
    );
    // Split-aware total: only count per-day shares for elapsed days
    const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
    const splitAwareTotal = sections
      .filter((s) => s.day <= todayStr)
      .reduce((sum, s) => sum + s.data.reduce((sSum, entry) => sSum + (entry.splitShare ?? toHomeCurrency(entry.expense)), 0), 0);
    return { dailyAverage: splitAwareTotal / days, daysActive: days };
  }, [expenses, trip.startDate, trip.endDate, sections]);

  const coverBytes = (trip as typeof trip & { coverBytes?: Uint8Array | null }).coverBytes;
  const dayHeaderPad = { paddingHorizontal: spacing.xl };
  // O(n) base64: Uint8Array → binary string in 64KB chunks (avoids O(n²) string concat)
  const coverUri = useMemo(() => {
    if (!coverBytes) return null;
    const CHUNK = 64 * 1024;
    let bin = '';
    for (let i = 0; i < coverBytes.length; i += CHUNK) {
      bin += String.fromCharCode(...coverBytes.subarray(i, i + CHUNK));
    }
    return 'data:image/jpeg;base64,' + btoa(bin);
  }, [coverBytes]);

  const pace = useMemo(() => computePace({
    dailyBudget: trip.dailyBudget,
    tripStartDate: trip.startDate,
    tripEndDate: trip.endDate,
    today: new Date(),
    cumulativeActualSpend: cumulativeSpend,
  }), [trip.dailyBudget, trip.startDate, trip.endDate, cumulativeSpend]);

  const handleSave = async (expense: Expense) => {
    await saveExpense(expense);
    setExpenseOpen(false);
    setEditingExpense(null);
    skipNextFocusRef.current = true;
    // Incrementeel: voeg toe aan bestaande array (geen volledige herlaad)
    setExpenses((prev) => [expense, ...prev]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>{trip.name}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.headerAction}
            onPress={() => router.push({ pathname: '/trips/new', params: { editId: trip.id } })}
          >
            <Ionicons name="pencil-outline" size={20} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={styles.headerAction} onPress={() => {
            Alert.alert('Delete trip', `Delete "${trip.name}" and all its expenses?`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  const { deleteTrip: deleteTripDb } = await import('../../src/db/tripRepo');
                  const removeTripStore = useTripStore.getState().removeTrip;
                  removeTripStore(trip.id);
                  try {
                    await deleteTripDb(trip.id);
                    router.back();
                  } catch (e) {
                    Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
                  }
                },
              },
            ]);
          }}>
            <Ionicons name="trash-outline" size={20} color={colors.destructive} />
          </Pressable>
        </View>
      </View>

      <SectionList
        style={styles.body}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        sections={sections}
        keyExtractor={(entry, index) => `${entry.expense.id}@${entry.day}@${index}`}
        ListHeaderComponent={
          <>
            {/* Cover photo — full width hero when the trip has one */}
            {coverUri && (
              <Image source={{ uri: coverUri }} style={styles.coverHero} resizeMode="cover" />
            )}
            {/* Trip date range */}
            <View style={styles.dateRangeBar}>
              <Ionicons name="calendar-outline" size={14} color={colors.mutedForeground} />
              <Text style={styles.dateRangeText}>
                {trip.startDate} — {trip.endDate || 'open'}
              </Text>
            </View>

            <Card>
              <View style={styles.statRow}>
                <StatBox
                  label="Daily avg / budget"
                  value={`${formatMoney(dailyAverage, trip.homeCurrency)} / ${formatMoney(trip.dailyBudget, trip.homeCurrency)}`}
                />
                <StatBox label="Total spend / budget" value={`${formatMoney(cumulativeSpend, trip.homeCurrency)} / ${formatMoney(trip.dailyBudget * daysActive, trip.homeCurrency)}`} />
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(1, cumulativeSpend / Math.max(1, trip.dailyBudget * daysActive)) * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.paceText}>
                {pace.status === 'over_budget' ? 'Over budget' : 'On track'} · Day {pace.daysElapsed}
                {pace.projectedTotalBudget ? ` of ${Math.round(pace.projectedTotalBudget / trip.dailyBudget)}` : ''}
              </Text>
            </Card>

            <View style={styles.sectionHead}>
              <SectionTitle title={`Expenses (${expenses.length})`} />
            </View>
          </>
        }
        renderSectionHeader={({ section }) => (
          <View style={[styles.dayHeader, dayHeaderPad]}>
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
        renderItem={({ item }) => {
          const e = item.expense;
          const isSplitDay = item.splitShare != null;
          return (
            <View style={[styles.row, { marginBottom: spacing.md }]}>
              <Pressable
                style={{ flexDirection: 'row', flex: 1, alignItems: 'center' }}
                onPress={() => {
                  setEditingExpense(e);
                  setExpenseOpen(true);
                }}
              >
                <IconCircle icon={categoryIcons[e.category]} size={50} />
                <View style={styles.details}>
                  <Text style={styles.rowTitle}>{e.notes || e.category}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>{e.category}</Text>
                    {isSplitDay ? (
                      <Ionicons name="layers-outline" size={14} color={colors.mutedForeground} />
                    ) : (
                      <Text style={styles.metaText}>
                        {(e.createdAt || e.rateDate).includes('T')
                          ? new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : ''}
                      </Text>
                    )}
                  </View>
                </View>
              </Pressable>
              <View style={styles.priceCol}>
                <Text style={styles.priceMain}>
                  {isSplitDay
                    ? formatMoney(item.splitShare as number, trip.homeCurrency)
                    : formatMoney(e.amount, e.currency)}
                </Text>
                {isSplitDay ? (
                  <Text style={styles.priceSub}>
                    {e.rateToHome > 0
                      ? `${formatMoney((item.splitShare as number) / e.rateToHome, e.currency)} ${e.currency}`
                      : e.currency}
                  </Text>
                ) : (
                  <Text style={styles.priceSub}>
                    ≈ {formatMoney(toHomeCurrency(e), trip.homeCurrency)}
                  </Text>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.placeholder}>No expenses yet. Tap + to add the first one.</Text>
        }
      />

      {/* FAB */}
      <Pressable style={[styles.fab, { bottom: insets.bottom + 94 }]} onPress={() => setExpenseOpen(true)}>
        <Ionicons name="add" size={32} color={colors.primaryForeground} />
      </Pressable>

      <Modal visible={expenseOpen} animationType="slide" onRequestClose={() => setExpenseOpen(false)}>
        <ExpenseForm
          tripId={trip.id}
          defaultCurrency={trip.defaultCurrency}
          homeCurrency={trip.homeCurrency}
          initialExpense={editingExpense ?? undefined}
          onClose={() => { setExpenseOpen(false); setEditingExpense(null); }}
          onSave={handleSave}
          onDelete={async (expense) => {
            try {
              await deleteExpense(expense.id);
              setExpenseOpen(false);
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
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  back: { padding: spacing.xs },
  headerTitle: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '700', fontFamily: fontFamily.heading, flex: 1, textAlign: 'center' },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  body: { flex: 1, paddingHorizontal: spacing.xl },
  coverHero: {
    width: '100%',
    height: 180,
    borderRadius: radius.xl,
    backgroundColor: colors.secondary,
    marginBottom: spacing.lg,
  },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  progressTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  paceText: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  dateRangeBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, marginBottom: spacing.md },
  sectionHead: { marginTop: spacing.xl },
  placeholder: { color: colors.mutedForeground, fontSize: fontSize.md, fontFamily: fontFamily.sans, marginTop: spacing.sm },
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
  row: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
  },
  details: { flex: 1, marginLeft: spacing.md },
  rowTitle: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '700', fontFamily: fontFamily.sans, marginBottom: spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  metaText: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  priceCol: { alignItems: 'flex-end' },
  priceMain: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '700', fontFamily: fontFamily.sans },
  priceSub: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: 2 },
  fab: {
    position: 'absolute',
    bottom: 118, // fallback; inline style overrides with insets.bottom + 94
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerAction: {
    padding: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMedium,
  },
  dateRangeText: {
    color: colors.mutedForeground,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
  },
});
