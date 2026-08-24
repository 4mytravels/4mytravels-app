import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppLogo } from '../../src/components/AppLogo';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { useLocalSearchParams } from 'expo-router';
import { loadExpenses } from '../../src/db/expenseRepo';
import { expensesToCsv } from '../../src/services/csv';
import { useTripStore } from '../../src/store/tripStore';
import type { Expense } from '../../src/types';
import { colors, fontFamily, radius, fontSize, spacing } from '../../src/theme/theme';
import { Card, SectionTitle, Button } from '../../src/components/ui';
import { formatMoney, toHomeCurrency } from '../../src/utils/currency';
import { countryLabel } from '../../src/data/countries';

// Pie slice colors — dark-theme palette, cycled per category.
const PIE_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
];

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

// Pure-View pie (RN Android has no conic-gradient). Algorithm:
// base circle = last slice's color; then for each slice (ascending) draw
// its wedge as rotated half/full discs, followed by a "cover" wedge in the
// NEXT slice's color starting at this slice's end. Later children render on
// top and repaint their own wedge, so overshoots are corrected layer by
// layer. Angles measured clockwise from 12 o'clock.
function Pie({ entries }: { entries: [string, number][] }) {
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total <= 0 || entries.length === 0) return null;

  const size = 150;
  const r = size / 2;
  const rightHalf = {
    position: 'absolute' as const,
    left: r,
    width: r,
    height: size,
    borderTopRightRadius: r,
    borderBottomRightRadius: r,
  };

  const slices = entries.map(([k, v], i) => ({
    key: k,
    color: PIE_COLORS[i % PIE_COLORS.length],
    frac: v / total,
  }));

  // Wedge starting at `fromDeg` (clockwise from 12 o'clock). A frame rotated
  // by R covers arc [R, R+180]; a second frame at R+180 extends to R+360.
  const wedge = (color: string, spanDeg: number) => (
    <>
      <View style={[rightHalf, { backgroundColor: color }]} />
      {spanDeg > 180 && (
        <View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            transform: [{ rotate: '180deg' }],
          }}
        >
          {/* this frame's rotation adds 180deg: its right half covers
              [R+180, R+360); overshoot is repainted by later layers */}
          <View style={[rightHalf, { backgroundColor: color }]} />
        </View>
      )}
    </>
  );

  let acc = 0;
  const layers: React.ReactNode[] = [];
  slices.slice(0, -1).forEach((s, i) => {
    const startDeg = acc * 360;
    acc += s.frac;
    const endDeg = acc * 360;
    const nextColor = slices[i + 1].color;
    layers.push(
      <View key={`own-${s.key}`} style={{ position: 'absolute', width: size, height: size, transform: [{ rotate: `${startDeg}deg` }] }}>
        {wedge(s.color, endDeg - startDeg)}
      </View>,
      <View key={`cov-${s.key}`} style={{ position: 'absolute', width: size, height: size, transform: [{ rotate: `${endDeg}deg` }] }}>
        {wedge(nextColor, 360 - endDeg)}
      </View>,
    );
  });

  return (
    <View style={styles.pieWrap}>
      <View style={[styles.pie, { width: size, height: size }]}>
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: r, backgroundColor: slices[slices.length - 1].color }} />
        {layers}
      </View>
      <Legend entries={entries} />
    </View>
  );
}

function Legend({ entries }: { entries: [string, number][] }) {
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return (
    <View style={styles.legend}>
      {entries.map(([k, v], i) => (
        <View key={k} style={styles.legendRow}>
          <View style={[styles.dot, { backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }]} />
          <Text style={styles.legendLabel} numberOfLines={1}>{k}</Text>
          <Text style={styles.legendPct}>{Math.round((v / total) * 100)}%</Text>
        </View>
      ))}
    </View>
  );
}

// YYYY-MM → "Aug 2026" (locale-onafhankelijk, Engelse afkortingen).
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || m < 1 || m > 12) return ym;
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[m - 1]} ${y}`;
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
  const byMonth: Record<string, number> = {};
  for (const e of expenses) {
    const h = toHomeCurrency(e);
    byCategory[e.category] = (byCategory[e.category] ?? 0) + h;
    if (e.country) {
      // Expenses store ISO 3166 codes since the shared picker landed; older
      // free-text values are shown as-is via countryLabel passthrough.
      const label = countryLabel(e.country);
      byCountry[label] = (byCountry[label] ?? 0) + h;
    }
    const day = (e.createdAt ?? e.rateDate).slice(0, 10);
    if (day.length >= 7) {
      const month = day.slice(0, 7); // YYYY-MM
      byMonth[month] = (byMonth[month] ?? 0) + h;
    }
  }

  const catEntries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const countryEntries = Object.entries(byCountry).sort((a, b) => b[1] - a[1]);
  const monthEntries = Object.entries(byMonth).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const maxCat = catEntries.length ? catEntries[0][1] : 1;
  const maxCountry = countryEntries.length ? countryEntries[0][1] : 1;
  const maxMonth = monthEntries.length ? monthEntries[0][1] : 1;
  const total = expenses.reduce((s, e) => s + toHomeCurrency(e), 0);

  // Export as a REAL .csv file via the share sheet (was: Share.share message =
  // plain text blob with no file extension).
  const exportCsv = async () => {
    if (expenses.length === 0) return;
    const tripNameById: Record<string, string> = {};
    for (const t of trips) tripNameById[t.id] = t.name;
    const csv = expensesToCsv(expenses, tripNameById);
    try {
      const safe = (tripId && trips.find((t) => t.id === tripId)?.name || 'all-trips')
        .replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const file = new File(Paths.cache, `4mt-statistics-${safe}.csv`);
      await file.write(csv);
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export expenses',
      });
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
          {catEntries.length === 0 ? (
            <Empty />
          ) : (
            <>
              <Pie entries={catEntries} />
              <View style={{ marginTop: spacing.md }}>
                {catEntries.map(([k, v]) => (
                  <Bar key={k} label={k} value={v} max={maxCat} />
                ))}
              </View>
            </>
          )}
        </View>

        <View style={styles.section}>
          <SectionTitle title="By country" />
          {countryEntries.length === 0 ? <Empty text="No countries tagged yet." /> : countryEntries.map(([k, v]) => (
            <Bar key={k} label={k} value={v} max={maxCountry} color={colors.accent} />
          ))}
        </View>

        <View style={styles.section}>
          <SectionTitle title="Over time" />
          {monthEntries.length === 0 ? <Empty /> : monthEntries.map(([k, v]) => (
            <Bar key={k} label={monthLabel(k)} value={v} max={maxMonth} color={colors.routeLine} />
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
  pieWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm },
  pie: { overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)' },
  legend: { flex: 1, gap: spacing.xs },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, color: colors.foreground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  legendPct: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
});
