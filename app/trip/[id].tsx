import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SectionList,
  Modal,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useTripStore } from '../../src/store/tripStore';
import { loadExpenses, saveExpense, deleteExpense } from '../../src/db/expenseRepo';
import type { Expense } from '../../src/types';
import { groupByDay } from '../../src/utils/days';
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

  const load = async () => {
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

  const cumulativeSpend = expenses.reduce((sum, e) => sum + toHomeCurrency(e), 0);

  // Daily average = spent / elapsed days. Reference day: today, unless a later
  // expense exists — then the latest expense day counts (so pre-logged future
  // expenses don't inflate the average).
  const lastExpenseDay = expenses.reduce((max, e) => {
    const t = Date.parse(e.createdAt || e.rateDate);
    return Number.isNaN(t) ? max : Math.max(max, t);
  }, 0);
  const todayStart = new Date(); todayStart.setHours(12, 0, 0, 0);
  const referenceMs = Math.max(todayStart.getTime(), lastExpenseDay || 0);
  const tripStart = new Date(`${trip.startDate}T12:00:00`);
  const daysActive = Math.max(
    1,
    Math.round((referenceMs - (isNaN(tripStart.getTime()) ? referenceMs : tripStart.getTime())) / 86_400_000) + 1,
  );
  const dailyAverage = cumulativeSpend / daysActive;

  const coverBytes = (trip as typeof trip & { coverBytes?: Uint8Array | null }).coverBytes;
  const dayHeaderPad = { paddingHorizontal: spacing.xl };
  const coverUri = coverBytes
    ? 'data:image/jpeg;base64,' +
      (() => {
        let bin = '';
        for (let i = 0; i < coverBytes.length; i++) bin += String.fromCharCode(coverBytes[i]);
        return btoa(bin);
      })()
    : null;

  const pace = computePace({
    dailyBudget: trip.dailyBudget,
    tripStartDate: trip.startDate,
    tripEndDate: trip.endDate,
    today: new Date(),
    cumulativeActualSpend: cumulativeSpend,
  });

  const handleSave = async (expense: Expense) => {
    await saveExpense(expense);
    setExpenseOpen(false);
    setEditingExpense(null);
    await load();
  };

  const handleDelete = (expense: Expense) => {
    Alert.alert('Delete expense', `${expense.notes || expense.category} — ${formatMoney(expense.amount, expense.currency)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteExpense(expense.id);
            await load();
          } catch (e) {
            Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>{trip.name}</Text>
        <View style={{ width: 24 }} />
      </View>

      <SectionList
        style={styles.body}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        sections={groupByDay(expenses)}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={
          <>
            {/* Cover photo — full width hero when the trip has one */}
            {coverUri && (
              <Image source={{ uri: coverUri }} style={styles.coverHero} resizeMode="cover" />
            )}
            <Card>
              <View style={styles.statRow}>
                <StatBox
                  label="Daily avg / budget"
                  value={`${formatMoney(dailyAverage, trip.homeCurrency)} / ${formatMoney(trip.dailyBudget, trip.homeCurrency)}`}
                />
                <StatBox label="Total spend" value={formatMoney(cumulativeSpend, trip.homeCurrency)} />
              </View>
              <View style={styles.statRow}>
                <StatBox label="Days" value={String(daysActive)} />
                <StatBox
                  label="Expected total"
                  value={pace.projectedTotalBudget ? formatMoney(pace.projectedTotalBudget, trip.homeCurrency) : '—'}
                />
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(1, cumulativeSpend / (pace.projectedTotalBudget || 1)) * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.paceText}>
                {pace.status === 'over_budget' ? 'Over budget' : 'On track'} · Day {pace.daysElapsed}
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
              {formatMoney(section.data.reduce((s, e) => s + toHomeCurrency(e), 0), trip.homeCurrency)}
            </Text>
          </View>
        )}
        renderSectionFooter={() => <View style={{ height: spacing.md }} />}
        renderItem={({ item }) => (
          <View style={[styles.row, { marginBottom: spacing.md }]}>
            <Pressable
              style={{ flexDirection: 'row', flex: 1, alignItems: 'center' }}
              onPress={() => {
                setEditingExpense(item);
                setExpenseOpen(true);
              }}
            >
              <IconCircle icon={categoryIcons[item.category]} size={50} />
              <View style={styles.details}>
                <Text style={styles.rowTitle}>{item.notes || item.category}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>{item.category}</Text>
                  <Text style={styles.metaText}>
                    {(item.createdAt || item.rateDate).includes('T')
                      ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </Text>
                </View>
              </View>
            </Pressable>
            <View style={styles.priceCol}>
              <Text style={styles.priceMain}>
                {formatMoney(item.amount, item.currency)}
              </Text>
              <Text style={styles.priceSub}>
                ≈ {formatMoney(toHomeCurrency(item), trip.homeCurrency)}
              </Text>
            </View>
            <Pressable onPress={() => handleDelete(item)} hitSlop={8} style={styles.rowDelete}>
              <Ionicons name="trash-outline" size={18} color={colors.destructive} />
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.placeholder}>No expenses yet. Tap + to add the first one.</Text>
        }
      />

      {/* FAB */}
      <Pressable style={styles.fab} onPress={() => setExpenseOpen(true)}>
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
  body: { flex: 1, paddingHorizontal: spacing.xl, paddingBottom: 120 },
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
  paceText: { color: colors.mutedForeground, fontSize: fontSize.sm, marginTop: spacing.sm, fontFamily: fontFamily.sans },
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
    bottom: 90,
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
  rowDelete: { marginLeft: spacing.md, padding: spacing.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] },
});
