// G3: legend under the donut — one row per slice, the "Others" slice expanded
// into indented sub-rows (moved out of statistics.tsx).
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fontFamily, fontSize, spacing, themedStyles } from '../../theme/theme';
import { formatMoney } from '../../utils/currency';
import { categoryIcon } from '../../utils/categoryIcons';
import { MAX_SLICES, type DonutSlice } from '../../utils/stats/breakdown';

export function CategoryLegend({
  slices,
  catEntries,
  total,
  displayCurrency,
}: {
  slices: DonutSlice[];
  catEntries: Array<[string, number]>;
  total: number;
  displayCurrency: string;
}) {
  return (
    <View style={styles.legendSection}>
      {slices.map((s) => {
        const pct = Math.round(s.frac * 100);
        const isOthers = s.category === 'Others' && catEntries.length > MAX_SLICES;
        return (
          <View key={s.category}>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: s.color }]} />
              <Ionicons name={categoryIcon(s.category)} size={14} color={colors.mutedForeground} style={{ marginLeft: 8 }} />
              <Text style={styles.legendLabel} numberOfLines={1}>{s.category}</Text>
              <Text style={styles.legendPct}>{pct}%</Text>
              <Text style={styles.legendValue}>{formatMoney(s.value, displayCurrency)}</Text>
            </View>
            {isOthers &&
              catEntries.slice(MAX_SLICES).map(([cat, val]) => {
                const subPct = total > 0 ? Math.round((val / total) * 100) : 0;
                return (
                  <View key={cat} style={styles.legendSubRow}>
                    <Ionicons name={categoryIcon(cat)} size={11} color={colors.mutedForeground} />
                    <Text style={styles.legendSubLabel} numberOfLines={1}>{cat}</Text>
                    <Text style={styles.legendSubPct}>{subPct}%</Text>
                    <Text style={styles.legendSubValue}>{formatMoney(val, displayCurrency)}</Text>
                  </View>
                );
              })}
          </View>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  legendSection: { gap: spacing.sm, marginBottom: spacing.xl },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, color: colors.foreground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginLeft: spacing.sm },
  legendPct: {
    color: colors.mutedForeground,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    marginRight: spacing.md,
    minWidth: 32,
    textAlign: 'right',
  },
  legendValue: { color: colors.foreground, fontSize: fontSize.sm, fontWeight: '600', fontFamily: fontFamily.sans, minWidth: 72, textAlign: 'right' },
  legendSubRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3, paddingLeft: 32, gap: 6 },
  legendSubLabel: { flex: 1, color: colors.mutedForeground, fontSize: fontSize.xs, fontFamily: fontFamily.sans, marginLeft: spacing.xs },
  legendSubPct: { color: colors.mutedForeground, fontSize: fontSize.xs, fontFamily: fontFamily.sans, minWidth: 28, textAlign: 'right' },
  legendSubValue: { color: colors.mutedForeground, fontSize: fontSize.xs, fontFamily: fontFamily.sans, minWidth: 60, textAlign: 'right' },
}));
