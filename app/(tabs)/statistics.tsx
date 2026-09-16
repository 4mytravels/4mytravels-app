import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, G, Circle, Rect, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { AppLogo } from '../../src/components/AppLogo';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { useTripStore } from '../../src/store/tripStore';
import { loadExpenses } from '../../src/db/expenseRepo';
import { expensesToCsv } from '../../src/services/csv';
import type { Expense } from '../../src/types';
import { colors, fontFamily, radius, fontSize, spacing } from '../../src/theme/theme';
import { Button } from '../../src/components/ui';
import { formatMoney, toHomeCurrency } from '../../src/utils/currency';
import { countryLabel, flagEmoji } from '../../src/data/countries';

// Premium dark-mode donut palette.
const DONUT_COLORS = [
  '#6366F1', // periwinkle blue
  '#EF4444', // coral red
  '#10B981', // mint green
  '#F59E0B', // soft orange
  '#8B5CF6', // lavender purple
  '#6B7280', // gray — Others
];

// Category icon map (Ionicons names).
const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Accommodation: 'bed-outline',
  Flights: 'airplane-outline',
  General: 'grid-outline',
  Transport: 'car-outline',
  Drinks: 'wine-outline',
  Activities: 'compass-outline',
  Groceries: 'basket-outline',
  Coffee: 'cafe-outline',
  Other: 'ellipsis-horizontal-outline',
  Others: 'ellipsis-horizontal-outline',
  Shopping: 'bag-outline',
  Food: 'restaurant-outline',
  Laundry: 'shirt-outline',
  Gym: 'barbell-outline',
  Work: 'briefcase-outline',
};

interface DonutSlice {
  category: string;
  value: number;
  color: string;
  frac: number;
  startAngle: number;
  endAngle: number;
}

// SVG arc path for a donut slice (angles in degrees, clockwise from 12 o'clock).
function donutSlicePath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startDeg: number,
  endDeg: number,
): string {
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const s = toRad(startDeg);
  const e = toRad(endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;

  const x1 = cx + outerR * Math.cos(s);
  const y1 = cy + outerR * Math.sin(s);
  const x2 = cx + outerR * Math.cos(e);
  const y2 = cy + outerR * Math.sin(e);
  const x3 = cx + innerR * Math.cos(e);
  const y3 = cy + innerR * Math.sin(e);
  const x4 = cx + innerR * Math.cos(s);
  const y4 = cy + innerR * Math.sin(s);

  return [
    `M${x1},${y1}`,
    `A${outerR},${outerR} 0 ${largeArc} 1 ${x2},${y2}`,
    `L${x3},${y3}`,
    `A${innerR},${innerR} 0 ${largeArc} 0 ${x4},${y4}`,
    'Z',
  ].join(' ');
}

function midAngle(start: number, end: number): number {
  return (start + end) / 2;
}

function labelPos(cx: number, cy: number, angleDeg: number, r: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function DonutChart({
  slices,
  total,
  size,
  innerRadius,
}: {
  slices: DonutSlice[];
  total: number;
  size: number;
  innerRadius: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const labelR = (outerR + innerRadius) / 2;

  if (slices.length === 0) {
    return (
      <View style={[styles.donutEmpty, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={styles.donutEmptyText}>No data</Text>
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <G>
          {slices.map((s) => (
            <Path
              key={s.category}
              d={donutSlicePath(cx, cy, outerR, innerRadius, s.startAngle, s.endAngle)}
              fill={s.color}
            />
          ))}
        </G>
      </Svg>
      {/* Labels on slices — only for slices >= 4% */}
      {slices.map((s) => {
        const pct = Math.round(s.frac * 100);
        if (pct < 4) return null;
        const mid = midAngle(s.startAngle, s.endAngle);
        const pos = labelPos(cx, cy, mid, labelR);
        return (
          <View
            key={`label-${s.category}`}
            style={[
              styles.sliceLabelWrap,
              {
                left: pos.x - 45,
                top: pos.y - 12,
                width: 90,
              },
            ]}
            pointerEvents="none"
          >
            <View style={styles.sliceLabelRow}>
              <Ionicons
                name={CATEGORY_ICONS[s.category] ?? 'ellipse-outline'}
                size={10}
                color="#fff"
                style={{ marginRight: 2 }}
              />
              <Text style={styles.sliceLabelText} numberOfLines={1}>
                {s.category} {pct}%
              </Text>
            </View>
          </View>
        );
      })}
      {/* Center hole */}
      <View
        style={[
          styles.donutCenter,
          {
            width: innerRadius * 2,
            height: innerRadius * 2,
            borderRadius: innerRadius,
            transform: [{ translateX: -innerRadius }, { translateY: -innerRadius }],
          },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.donutCenterLabel}>Total Spent</Text>
        <Text style={styles.donutCenterValue}>{formatMoney(total, 'EUR')}</Text>
      </View>
    </View>
  );
}

// YYYY-MM → "Aug 2026"
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || m < 1 || m > 12) return ym;
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[m - 1]} ${y}`;
}

// Horizontal bar for sections — large flag to the left, name + bar stacked.
function Bar({
  label,
  value,
  max,
  displayCurrency,
  color = colors.primary,
  flag,
}: {
  label: string;
  value: number;
  max: number;
  displayCurrency: string;
  color?: string;
  flag?: string;
}) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <View style={styles.barRow}>
      {flag && <Text style={styles.barFlagLarge}>{flag}</Text>}
      <View style={styles.barContent}>
        <View style={styles.barLine1}>
          <Text style={styles.barLabel} numberOfLines={1}>{label}</Text>
          <Text style={styles.barValue} numberOfLines={1}>{formatMoney(value, displayCurrency)}</Text>
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
}

// Smooth line chart with gradient fill for "Over time".
function LineChart({
  data,
  displayCurrency,
  height = 160,
  width: chartWidth,
}: {
  data: Array<{ month: string; value: number; ym: string }>;
  displayCurrency: string;
  height?: number;
  width: number;
}) {
  if (data.length === 0) {
    return (
      <View style={[styles.lineChartEmpty, { height, width: chartWidth }]}>
        <Text style={styles.donutEmptyText}>No data</Text>
      </View>
    );
  }

  const maxVal = Math.max(...data.map(d => d.value));
  const padding = { top: 20, bottom: 30, left: 40, right: 20 };
  const innerW = chartWidth - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const points = data.map((d, i) => {
    const x = padding.left + (innerW / Math.max(1, data.length - 1)) * i;
    const y = padding.top + innerH - (maxVal > 0 ? (d.value / maxVal) * innerH : 0);
    return { ...d, x, y };
  });

  // Smooth path via cubic bezier
  const linePath = points.reduce((acc, p, i) => {
    if (i === 0) return `M${p.x},${p.y}`;
    const prev = points[i - 1];
    const cpx1 = prev.x + (p.x - prev.x) / 3;
    const cpx2 = prev.x + (2 * (p.x - prev.x)) / 3;
    return `${acc} C${cpx1},${prev.y} ${cpx2},${p.y} ${p.x},${p.y}`;
  }, '');

  // Fill area path
  const fillPath = `${linePath} L${points[points.length - 1].x},${padding.top + innerH} L${points[0].x},${padding.top + innerH} Z`;

  // Gradient fill ID
  const gradientId = 'lineGradient';

  // Highlight point (max value)
  const maxPoint = points.reduce((a, b) => (a.value >= b.value ? a : b));

  return (
    <View style={{ width: chartWidth, height }}>
      <Svg width={chartWidth} height={height} viewBox={`0 0 ${chartWidth} ${height}`}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.30" />
            <Stop offset="100%" stopColor={colors.primary} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d={fillPath} fill={`url(#${gradientId})`} />
        <Path d={linePath} fill="none" stroke={colors.primary} strokeWidth="2.5" strokeLinecap="round" />
        {points.map((p) => (
          <Circle
            key={p.ym}
            cx={p.x}
            cy={p.y}
            r="4"
            fill={colors.background}
            stroke={p.ym === maxPoint.ym ? colors.primary : colors.mutedForeground}
            strokeWidth="2"
          />
        ))}
        <G>
          {maxPoint.y > 30 ? (
            <Rect x={maxPoint.x - 28} y={maxPoint.y - 24} width="56" height="18" rx="9" fill={colors.primary} />
          ) : (
            <Rect x={maxPoint.x - 28} y={maxPoint.y + 8} width="56" height="18" rx="9" fill={colors.primary} />
          )}
          <SvgText
            x={maxPoint.x}
            y={maxPoint.y > 30 ? maxPoint.y - 11 : maxPoint.y + 21}
            textAnchor="middle"
            fill={colors.primaryForeground}
            fontSize="10"
            fontWeight="700"
            fontFamily={fontFamily.sans}
          >
            {formatMoney(maxPoint.value, displayCurrency)}
          </SvgText>
        </G>
        {points.map((p) => (
          <SvgText
            key={`x-${p.ym}`}
            x={p.x}
            y={height - 6}
            textAnchor="middle"
            fill={colors.mutedForeground}
            fontSize="9"
            fontFamily={fontFamily.sans}
          >
            {monthShort(p.month)}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

function monthShort(ym: string): string {
  const [y, m] = ym.split('-').map((n) => parseInt(n, 10));
  if (!m || m < 1 || m > 12) return ym;
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[m - 1]} ${y}`;
}

// Split payment bar: Card left, Cash right, with percentages.
function SplitPaymentBar({
  cardValue,
  cashValue,
  displayCurrency,
}: {
  cardValue: number;
  cashValue: number;
  displayCurrency: string;
}) {
  const total = cardValue + cashValue;
  const cardPct = total > 0 ? Math.round((cardValue / total) * 100) : 0;
  const cashPct = total > 0 ? Math.round((cashValue / total) * 100) : 0;
  const cardWidth = total > 0 ? cardValue / total : 0;
  const cashWidth = total > 0 ? cashValue / total : 0;

  return (
    <View style={styles.splitBarContainer}>
      <View style={styles.splitBarLabels}>
        <Text style={styles.splitBarLabelLeft}>
          <Ionicons name="card-outline" size={14} color={colors.primary} /> Card
        </Text>
        <Text style={styles.splitBarLabelRight}>
          Cash <Ionicons name="cash-outline" size={14} color={colors.success} />
        </Text>
      </View>
      <View style={styles.splitBarTrack}>
        <View
          style={[
            styles.splitBarFillLeft,
            {
              width: `${cardWidth * 100}%`,
              backgroundColor: colors.primary,
            },
          ]}
        />
        <View
          style={[
            styles.splitBarFillRight,
            {
              width: `${cashWidth * 100}%`,
              backgroundColor: colors.success,
            },
          ]}
        />
      </View>
      <View style={styles.splitBarValues}>
        <Text style={styles.splitBarValueLeft}>
          {cardPct}% · {formatMoney(cardValue, displayCurrency)}
        </Text>
        <Text style={styles.splitBarValueRight}>
          {formatMoney(cashValue, displayCurrency)} · {cashPct}%
        </Text>
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Empty({ text = 'No data yet.' }: { text?: string }) {
  return <Text style={styles.emptyText}>{text}</Text>;
}

export default function StatisticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const trips = useTripStore((s) => s.trips);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Most-used trip home currency for display.
  const displayCurrency = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of trips) counts[t.homeCurrency] = (counts[t.homeCurrency] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'EUR';
  }, [trips]);

  const loadData = useMemo(() => {
    return async () => {
      const list = await loadExpenses();
      setExpenses(list);
    };
  }, []);

  useFocusEffect(() => {
    loadData();
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // --- Category breakdown (top 5 + Others) ---
  const byCategory: Record<string, number> = {};
  for (const e of expenses) {
    const h = toHomeCurrency(e);
    byCategory[e.category] = (byCategory[e.category] ?? 0) + h;
  }
  const catEntries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  // Top 5 + Others
  const MAX_SLICES = 5;
  const topEntries = catEntries.slice(0, MAX_SLICES);
  const othersValue = catEntries.slice(MAX_SLICES).reduce((s, [, v]) => s + v, 0);
  const chartEntries = [...topEntries];
  if (othersValue > 0) {
    chartEntries.push(['Others', othersValue]);
  }

  const total = catEntries.reduce((s, [, v]) => s + v, 0);

  // Build donut slices
  const slices: DonutSlice[] = [];
  let acc = 0;
  for (let i = 0; i < chartEntries.length; i++) {
    const [cat, val] = chartEntries[i];
    const frac = total > 0 ? val / total : 0;
    const start = acc * 360;
    acc += frac;
    const end = acc * 360;
    slices.push({
      category: cat,
      value: val,
      color: DONUT_COLORS[i % DONUT_COLORS.length],
      frac,
      startAngle: start,
      endAngle: end,
    });
  }

  // --- Country breakdown ---
  const byCountry: Record<string, number> = {};
  for (const e of expenses) {
    if (e.country) {
      const label = countryLabel(e.country);
      byCountry[label] = (byCountry[label] ?? 0) + toHomeCurrency(e);
    }
  }
  const countryEntries = Object.entries(byCountry).sort((a, b) => b[1] - a[1]);
  const maxCountry = countryEntries.length ? countryEntries[0][1] : 1;

  // --- Month breakdown ---
  const byMonth: Record<string, number> = {};
  for (const e of expenses) {
    const day = (e.createdAt ?? e.rateDate).slice(0, 10);
    if (day.length >= 7) {
      const month = day.slice(0, 7);
      byMonth[month] = (byMonth[month] ?? 0) + toHomeCurrency(e);
    }
  }
  const monthEntries = Object.entries(byMonth).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const maxMonth = monthEntries.length ? monthEntries[0][1] : 1;

  // --- Payment breakdown ---
  const byPayment: Record<string, number> = {};
  for (const e of expenses) {
    const pm = e.paymentMethod === 'card' ? 'Card' : 'Cash';
    byPayment[pm] = (byPayment[pm] ?? 0) + toHomeCurrency(e);
  }
  const cardValue = byPayment.Card ?? 0;
  const cashValue = byPayment.Cash ?? 0;

  // Export CSV.
  const tripNameById: Record<string, string> = {};
  for (const t of trips) tripNameById[t.id] = t.name;

  const exportCsv = async () => {
    if (expenses.length === 0) return;
    try {
      const csv = expensesToCsv(expenses, tripNameById);
      const file = new File(Paths.cache, '4mt-statistics.csv');
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
        <Pressable style={styles.settingsIcon} onPress={() => router.push('/settings')}>
          <Ionicons name="settings-outline" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <View style={styles.titleWrap}>
        <Text style={styles.screenTitle}>Statistics</Text>
      </View>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Donut chart */}
        <View style={styles.donutSection}>
          <DonutChart
            slices={slices}
            total={total}
            size={280}
            innerRadius={80}
          />
        </View>

        {/* Category legend */}
        <View style={styles.legendSection}>
          {slices.map((s, i) => {
            const pct = Math.round(s.frac * 100);
            const isOthers = s.category === 'Others' && catEntries.length > MAX_SLICES;
            return (
              <View key={s.category}>
                <View style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                  <Ionicons
                    name={CATEGORY_ICONS[s.category] ?? 'ellipse-outline'}
                    size={14}
                    color={colors.mutedForeground}
                    style={{ marginLeft: 8 }}
                  />
                  <Text style={styles.legendLabel} numberOfLines={1}>
                    {s.category}
                  </Text>
                  <Text style={styles.legendPct}>{pct}%</Text>
                  <Text style={styles.legendValue}>
                    {formatMoney(s.value, displayCurrency)}
                  </Text>
                </View>
                {/* Indented sub-rows for Others */}
                {isOthers &&
                  catEntries.slice(MAX_SLICES).map(([cat, val]) => {
                    const subPct = total > 0 ? Math.round((val / total) * 100) : 0;
                    return (
                      <View key={cat} style={styles.legendSubRow}>
                        <Ionicons
                          name={CATEGORY_ICONS[cat] ?? 'ellipse-outline'}
                          size={11}
                          color={colors.mutedForeground}
                        />
                        <Text style={styles.legendSubLabel} numberOfLines={1}>
                          {cat}
                        </Text>
                        <Text style={styles.legendSubPct}>{subPct}%</Text>
                        <Text style={styles.legendSubValue}>
                          {formatMoney(val, displayCurrency)}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            );
          })}
        </View>

        {/* By country */}
        <Section title="By country">
          {countryEntries.length === 0 ? (
            <Empty text="No countries tagged yet." />
          ) : (
            countryEntries.map(([k, v]) => (
              <Bar key={k} label={k} value={v} max={maxCountry} displayCurrency={displayCurrency} color={colors.accent} flag={flagEmoji(k)} />
            ))
          )}
        </Section>

        {/* Over time */}
        <Section title="Over time">
          {monthEntries.length === 0 ? (
            <Empty />
          ) : (
            <LineChart
              data={monthEntries.map(([ym, v]) => ({ month: ym, value: v, ym }))}
              displayCurrency={displayCurrency}
              width={300}
            />
          )}
        </Section>

        {/* By payment — split bar */}
        <Section title="By payment">
          {cardValue === 0 && cashValue === 0 ? (
            <Empty />
          ) : (
            <SplitPaymentBar cardValue={cardValue} cashValue={cashValue} displayCurrency={displayCurrency} />
          )}
        </Section>

        {/* Export button */}
        <View style={styles.exportWrap}>
          <Button label="Export CSV" icon="download-outline" onPress={exportCsv} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  settingsIcon: {
    padding: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMedium,
    borderWidth: 1,
    borderColor: colors.border,
  },
  appTitle: {
    color: colors.foreground,
    fontSize: fontSize.xl,
    fontWeight: '700',
    fontFamily: fontFamily.heading,
  },
  titleWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  screenTitle: {
    color: colors.foreground,
    fontSize: fontSize['4xl'],
    fontWeight: '800',
    fontFamily: fontFamily.heading,
  },
  titleSettingsIcon: {
    padding: spacing.xs,
    borderRadius: radius.full,
  },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 40,
  },
  // Donut
  donutSection: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  donutEmpty: {
    backgroundColor: colors.surfaceStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  donutEmptyText: {
    color: colors.mutedForeground,
    fontSize: fontSize.md,
    fontFamily: fontFamily.sans,
  },
  sliceLabelWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sliceLabelText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    fontFamily: fontFamily.sans,
  },
  donutCenter: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  donutCenterLabel: {
    color: colors.mutedForeground,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    marginBottom: 2,
  },
  donutCenterValue: {
    color: colors.foreground,
    fontSize: fontSize.xl,
    fontWeight: '800',
    fontFamily: fontFamily.heading,
  },
  // Legend
  legendSection: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
    color: colors.foreground,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    marginLeft: spacing.sm,
  },
  legendPct: {
    color: colors.mutedForeground,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    marginRight: spacing.md,
    minWidth: 32,
    textAlign: 'right',
  },
  legendValue: {
    color: colors.foreground,
    fontSize: fontSize.sm,
    fontWeight: '600',
    fontFamily: fontFamily.sans,
    minWidth: 72,
    textAlign: 'right',
  },
  // Sections
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: fontSize.lg,
    fontWeight: '700',
    fontFamily: fontFamily.heading,
    marginBottom: spacing.md,
  },
  emptyText: {
    color: colors.mutedForeground,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    marginTop: spacing.sm,
  },
  // Bar
  barRow: { 
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  barFlagLarge: { 
    fontSize: 30,
    lineHeight: 32,
    marginTop: 2,
  },
  barContent: {
    flex: 1,
  },
  barLine1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  barLabel: { color: colors.foreground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  barValue: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  barTrack: {
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 5 },
  lineChartEmpty: {
    backgroundColor: colors.surfaceStrong,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.lg,
  },
  // Split payment bar
  splitBarContainer: {
    marginTop: spacing.sm,
  },
  splitBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  splitBarLabelLeft: {
    color: colors.foreground,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    fontWeight: '600',
  },
  splitBarLabelRight: {
    color: colors.foreground,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    fontWeight: '600',
  },
  splitBarTrack: {
    flexDirection: 'row',
    height: 28,
    borderRadius: radius.full,
    overflow: 'hidden',
    backgroundColor: colors.surfaceStrong,
  },
  splitBarFillLeft: {
    height: '100%',
    borderTopLeftRadius: radius.full,
    borderBottomLeftRadius: radius.full,
  },
  splitBarFillRight: {
    height: '100%',
    borderTopRightRadius: radius.full,
    borderBottomRightRadius: radius.full,
  },
  splitBarValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  splitBarValueLeft: {
    color: colors.mutedForeground,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
  },
  splitBarValueRight: {
    color: colors.mutedForeground,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
  },
  // Export
  exportWrap: {
    marginTop: spacing.xl,
  },
  legendSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingLeft: 32,
    gap: 6,
  },
  legendSubLabel: {
    flex: 1,
    color: colors.mutedForeground,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans,
    marginLeft: spacing.xs,
  },
  legendSubPct: {
    color: colors.mutedForeground,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans,
    minWidth: 28,
    textAlign: 'right',
  },
  legendSubValue: {
    color: colors.mutedForeground,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans,
    minWidth: 60,
    textAlign: 'right',
  },
});
