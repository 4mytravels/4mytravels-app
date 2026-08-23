import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppLogo } from '../../src/components/AppLogo';
import { useLocalSearchParams } from 'expo-router';
import { loadExpenses } from '../../src/db/expenseRepo';
import { useTripStore } from '../../src/store/tripStore';
import type { Expense } from '../../src/types';
import { colors, fontFamily, radius, fontSize, spacing } from '../../src/theme/theme';
import { Card, SectionTitle, Button } from '../../src/components/ui';
import { formatMoney, toHomeCurrency } from '../../src/utils/currency';

// Simple bar chart (no external chart lib — FLOSS / privacy-first).
function Bar({ label, value, max, color = colors.primary }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.barValue}>{formatMoney(value, 'EUR')}</Text>
    </View>
  );
}

export default function StatisticsScreen() {
  const params = useLocalSearchParams();
  const tripId = typeof params.tripId === 'string' ? params.tripId : undefined;
  const trips = useTripStore((s) => s.trips);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  // Use the first trip's home currency for display (global view). Falls back to EUR.
  const homeCurrency = trips[0]?.homeCurrency ?? 'EUR';

  useEffect(() => {
    (async () => {
      const list = await loadExpenses(tripId);
      setExpenses(list);
    })();
  }, [tripId]);

  const byCategory: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  for (const e of expenses) {
    const h = toHomeCurrency(e);
    byCategory[e.category] = (byCategory[e.category] ?? 0) + h;
    if (e.country) byCountry[e.country] = (byCountry[e.country] ?? 0) + h;
    const day = (e.createdAt ?? e.rateDate).slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + h;
  }

  const catEntries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const countryEntries = Object.entries(byCountry).sort((a, b) => b[1] - a[1]);
  const dayEntries = Object.entries(byDay).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const maxCat = catEntries.length ? catEntries[0][1] : 1;
  const maxCountry = countryEntries.length ? countryEntries[0][1] : 1;
  const maxDay = dayEntries.length ? dayEntries[0][1] : 1;
  const total = expenses.reduce((s, e) => s + toHomeCurrency(e), 0);

  const exportCsv = async () => {
    if (expenses.length === 0) return;
    const header = [
      'id', 'trip_id', 'date', 'amount', 'currency', 'rate_to_home', 'rate_date',
      'category', 'payment_method', 'country', 'notes', 'home_amount',
    ].join(',');
    const rows = expenses.map((e) =>
      [
        e.id,
        e.tripId,
        e.rateDate,
        e.amount,
        e.currency,
        e.rateToHome,
        e.rateDate,
        e.category,
        e.paymentMethod,
        e.country ?? '',
        `"${(e.notes ?? '').replace(/"/g, '""')}"`,
        toHomeCurrency(e).toFixed(2),
      ].join(','),
    );
    const csv = [header, ...rows].join('\n');
    try {
      await Share.share({ title: '4MyTravels expenses', message: csv });
    } catch {
      // ignore share cancellation
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <AppLogo size={36} />
          <Text style={styles.appTitle}>4 My Travels</Text>
        </View>
      </View>
      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xs }}>
        <Text style={styles.screenTitle}>Statistics</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card>
          <Text style={styles.totalLabel}>Total spend</Text>
          <Text style={styles.totalValue}>{formatMoney(total, homeCurrency)}</Text>
          <Text style={styles.totalSub}>{expenses.length} expenses</Text>
        </Card>

        <View style={styles.section}>
          <SectionTitle title="By category" />
          {catEntries.length === 0 ? <Empty /> : catEntries.map(([k, v]) => (
            <Bar key={k} label={k} value={v} max={maxCat} />
          ))}
        </View>

        <View style={styles.section}>
          <SectionTitle title="By country" />
          {countryEntries.length === 0 ? <Empty text="No countries tagged yet." /> : countryEntries.map(([k, v]) => (
            <Bar key={k} label={k} value={v} max={maxCountry} color={colors.accent} />
          ))}
        </View>

        <View style={styles.section}>
          <SectionTitle title="Over time" />
          {dayEntries.length === 0 ? <Empty /> : dayEntries.map(([k, v]) => (
            <Bar key={k} label={k} value={v} max={maxDay} color={colors.routeLine} />
          ))}
        </View>

        <View style={styles.section}>
          <Button label="Export CSV" icon="download-outline" onPress={exportCsv} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Empty({ text = 'No data yet.' }: { text?: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  appTitle: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '700', fontFamily: fontFamily.heading },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: 120 },
  totalLabel: { color: colors.mutedForeground, fontSize: fontSize.md, fontFamily: fontFamily.sans },
  totalValue: { color: colors.foreground, fontSize: fontSize['4xl'], fontWeight: '800', fontFamily: fontFamily.heading, marginTop: spacing.xs },
  totalSub: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: 2 },
  section: { marginTop: spacing.xl },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
  barLabel: { width: 90, color: colors.foreground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  barTrack: { flex: 1, height: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 5, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  barValue: { width: 80, textAlign: 'right', color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  empty: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: spacing.sm },
  screenTitle: { color: colors.foreground, fontSize: fontSize['4xl'], fontWeight: '800', fontFamily: fontFamily.heading },
});
