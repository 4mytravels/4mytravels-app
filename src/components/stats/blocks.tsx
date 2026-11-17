// G3: small building blocks of the Stats overview (moved out of statistics.tsx):
// Section card, empty line, country Bar, card/cash SplitPaymentBar, "View all" link.
import type { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fontFamily, radius, fontSize, spacing, themedStyles } from '../../theme/theme';
import { formatMoney } from '../../utils/currency';
import { paymentSplit } from '../../utils/stats/breakdown';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function Empty({ text = 'No data.' }: { text?: string }) {
  return <Text style={styles.emptyText}>{text}</Text>;
}

/** Right-aligned "View all ›" link under a preview block (pattern 54: always rendered). */
export function SeeAll({ label = 'View all', onPress }: { label?: string; onPress: () => void }) {
  return (
    <Pressable style={styles.seeAll} onPress={onPress}>
      <Text style={styles.seeAllText}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.primaryText} />
    </Pressable>
  );
}

// Horizontal bar — large flag to the left, name + bar stacked.
export function Bar({
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

// Split payment bar: Card left, Cash right, with percentages.
export function SplitPaymentBar({
  cardValue,
  cashValue,
  displayCurrency,
}: {
  cardValue: number;
  cashValue: number;
  displayCurrency: string;
}) {
  const { cardPct, cashPct, cardFrac, cashFrac } = paymentSplit(cardValue, cashValue);
  return (
    <View style={styles.splitBarContainer}>
      <View style={styles.splitBarLabels}>
        <Text style={styles.splitBarLabel}>
          <Ionicons name="card-outline" size={14} color={colors.primaryText} /> Card
        </Text>
        <Text style={styles.splitBarLabel}>
          Cash <Ionicons name="cash-outline" size={14} color={colors.success} />
        </Text>
      </View>
      <View style={styles.splitBarTrack}>
        <View style={[styles.splitBarFillLeft, { width: `${cardFrac * 100}%`, backgroundColor: colors.primary }]} />
        <View style={[styles.splitBarFillRight, { width: `${cashFrac * 100}%`, backgroundColor: colors.success }]} />
      </View>
      <View style={styles.splitBarValues}>
        <Text style={styles.splitBarValue}>
          {cardPct}% · {formatMoney(cardValue, displayCurrency)}
        </Text>
        <Text style={styles.splitBarValue}>
          {formatMoney(cashValue, displayCurrency)} · {cashPct}%
        </Text>
      </View>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  section: {
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTitle: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '700', fontFamily: fontFamily.heading, marginBottom: spacing.md },
  emptyText: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: spacing.sm },
  seeAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: spacing.md },
  seeAllText: { color: colors.primaryText, fontSize: fontSize.sm, fontWeight: '700', fontFamily: fontFamily.sans },
  barRow: { marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  barFlagLarge: { fontSize: 30, lineHeight: 32, marginTop: 2 },
  barContent: { flex: 1 },
  barLine1: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barLabel: { color: colors.foreground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  barValue: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  barTrack: { height: 10, backgroundColor: colors.surfaceStrong, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  splitBarContainer: { marginTop: spacing.sm },
  splitBarLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  splitBarLabel: { color: colors.foreground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, fontWeight: '600' },
  splitBarTrack: { flexDirection: 'row', height: 28, borderRadius: radius.full, overflow: 'hidden', backgroundColor: colors.surfaceStrong },
  splitBarFillLeft: { height: '100%', borderTopLeftRadius: radius.full, borderBottomLeftRadius: radius.full },
  splitBarFillRight: { height: '100%', borderTopRightRadius: radius.full, borderBottomRightRadius: radius.full },
  splitBarValues: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  splitBarValue: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
}));
