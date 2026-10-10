import { useEffect, useState, useMemo, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, SectionList, Modal, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useTripStore } from '../../src/store/tripStore';
import { loadExpenses, saveExpense, deleteExpense } from '../../src/db/expenseRepo';
import type { Expense } from '../../src/types';
import { groupByDaySplitAware } from '../../src/utils/days';
import { colors, fontFamily, radius, fontSize, spacing } from '../../src/theme/theme';
import { SectionTitle, Button, IconCircle, categoryIcons } from '../../src/components/ui';
import { TripCard } from '../../src/components/TripCard';
import { confirmDestructive } from '../../src/utils/confirm';
import { ExpenseForm } from '../../src/components/ExpenseForm';
import { formatMoney, toHomeCurrency } from '../../src/utils/currency';
import { ExpenseRow } from '../../src/components/ExpenseRow';
import { NavFadeScrim } from '../../src/components/FadeScrim';
import { WebNotices } from '../../src/components/WebNotices';

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
      {/* No trip name here: the shared TripCard right below already shows it. */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.headerAction}
            onPress={() => router.push({ pathname: '/trips/new', params: { editId: trip.id } })}
          >
            <Ionicons name="pencil-outline" size={24} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={styles.headerAction} onPress={() => {
            // confirmDestructive, not Alert.alert: the latter is a no-op on the
            // PWA, so the trash icon would silently do nothing (see src/utils/confirm.ts).
            confirmDestructive({
              title: 'Delete trip',
              message: `Delete "${trip.name}" and all its expenses?`,
              onConfirm: async () => {
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
            });
          }}>
            <Ionicons name="trash-outline" size={24} color={colors.destructive} />
          </Pressable>
        </View>
      </View>

      {/* Web/PWA notices (storage health + install nudge) under the screen header. */}
      <WebNotices />

      <SectionList
        style={styles.body}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        sections={sections}
        keyExtractor={(entry, index) => `${entry.expense.id}@${entry.day}@${index}`}
        ListHeaderComponent={
          <>
            {/* SAME card as the Trips tab (src/components/TripCard.tsx) —
                photo + name + dates + day bar + verdict, figures below it. */}
            <View style={styles.heroCard}>
              <TripCard trip={trip} expenses={expenses} />
            </View>

            <View style={styles.sectionHead}>
              <SectionTitle title={`Expenses (${expenses.length})`} />
            </View>
          </>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
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
        renderItem={({ item }) => (
          // SHARED row component — identical to the Expenses tab, including the
          // row tint and the edge-to-edge background.
          <ExpenseRow
            expense={item.expense}
            homeCurrency={trip.homeCurrency}
            splitShare={item.splitShare}
            background={colors.primary12}
            onPress={() => {
              setEditingExpense(item.expense);
              setExpenseOpen(true);
            }}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.placeholder}>No expenses yet. Tap + to add the first one.</Text>
        }
      />

      {/* Expense rows fade out under the floating nav. */}
      <NavFadeScrim />

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
  // Back button on the left, the two actions on the right — no title: the trip
  // name lives on the card below (it was rendered twice before).
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  back: { padding: spacing.xs },
  body: { flex: 1, paddingHorizontal: spacing.xl },
  // The shared TripCard (photo + day bar + verdict, figures below) replaces the
  // old cover hero + date line + stat boxes.
  heroCard: { marginBottom: spacing.xl },
  sectionHead: { marginTop: spacing.sm },
  placeholder: { color: colors.mutedForeground, fontSize: fontSize.md, fontFamily: fontFamily.sans, marginTop: spacing.sm },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    marginTop: spacing.xs,
    // No bottom border here: every row now carries its own top separator, so a
    // rule here would render as a double line above the first entry.
    marginBottom: spacing.xs,
    // Pull the header out over the screen padding so it lines up with the rows
    // below (which are full-bleed). The label/total then carry their own
    // spacing.xl — identical to the Expenses tab.
    marginHorizontal: -spacing.xl,
    borderBottomWidth: 0,
  },
  dayLabel: {
    flex: 1,
    color: colors.mutedForeground,
    fontSize: fontSize.md,
    fontWeight: '700',
    fontFamily: fontFamily.heading,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingLeft: spacing.xl,
  },
  dayTotal: {
    color: colors.foreground,
    fontSize: fontSize.md,
    fontWeight: '700',
    fontFamily: fontFamily.sans,
    paddingRight: spacing.xl,
  },
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
  // Expenses trip-selector size (44x44); the glyph itself is 24px (user: a bit smaller).
  headerAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceMedium,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
