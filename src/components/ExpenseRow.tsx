// ExpenseRow — the ONE expense row used by BOTH the Expenses tab and the trip
// detail screen.
//
// Before this component the two screens each had their own row and drifted
// apart (the trip-detail row repeated the category in the subtitle, the
// Expenses row showed country + payment). Anything that renders an expense —
// expenses list, trip detail, home "expenses today" — MUST use this so the three
// stay identical.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconCircle, categoryIcons } from './ui';
import { countryName } from '../data/countries';
import { formatMoney, toHomeCurrency } from '../utils/currency';
import { colors, fontFamily, fontSize, spacing } from '../theme/theme';
import type { Expense } from '../types';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDateRange(start: string, end: string): string {
  const s = start.slice(0, 10);
  const e = end.slice(0, 10);
  const startDate = new Date(`${s}T12:00:00Z`);
  const endDate = new Date(`${e}T12:00:00Z`);
  const sDay = startDate.getUTCDate();
  const eDay = endDate.getUTCDate();
  if (startDate.getUTCMonth() === endDate.getUTCMonth()) {
    return `${sDay}–${eDay} ${MONTHS_SHORT[startDate.getUTCMonth()]}`;
  }
  return `${sDay} ${MONTHS_SHORT[startDate.getUTCMonth()]}–${eDay} ${MONTHS_SHORT[endDate.getUTCMonth()]}`;
}

export function ExpenseRow({
  expense,
  homeCurrency,
  onPress,
  splitShare = null,
  /** Row background (e.g. the selected/tinted state). Defaults to transparent. */
  background = 'transparent',
  bordered = true,
  /**
   * Cancel the screen's horizontal padding so the row (and its tint/border)
   * spans edge to edge. Both hosts — the Expenses SectionList and the trip
   * detail SectionList — already carry `paddingHorizontal: spacing.xl` on their
   * content container, so without this the row's own padding was DOUBLED and
   * every row started a couple of centimetres in from the edge. The row then
   * applies its own `spacing.xl`, landing the text exactly on the screen edge.
   */
  fullBleed = true,
}: {
  expense: Expense;
  homeCurrency: string;
  onPress: () => void;
  /** Set when this row is one day of a multi-day split: shows the share. */
  splitShare?: number | null;
  background?: string;
  /** Draw the separator above AND below the row. */
  bordered?: boolean;
  fullBleed?: boolean;
}) {
  const isSplitDay = splitShare != null;
  // The per-day share is stored in the trip home currency, so it is shown as-is;
  // a full amount is converted once from its own currency.
  const displayAmount = isSplitDay
    ? (splitShare as number) / expense.rateToHome
    : expense.amount;
  const displayCurrency = expense.currency;
  const homeAmount = isSplitDay ? (splitShare as number) : toHomeCurrency(expense);

  // Subtitle: "Land - card" / "Land - cash". Never the category: the title
  // already falls back to the category, so repeating it told the user nothing.
  const detail = isSplitDay
    ? `${shortDateRange(expense.multiDaySplit!.splitStart, expense.multiDaySplit!.splitEnd)} · ${payLabel(expense.paymentMethod)}`
    : `${expense.country ? countryName(expense.country) : '—'} - ${payLabel(expense.paymentMethod)}`;

  return (
    <Pressable
      style={[
        styles.row,
        fullBleed && styles.rowFullBleed,
        { backgroundColor: background },
        bordered && styles.border,
      ]}
      onPress={onPress}
    >
      <IconCircle icon={categoryIcons[expense.category]} size={40} color="#FFFFFF" />
      <View style={styles.details}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {expense.notes || expense.category}
        </Text>
        <Text style={styles.metaText} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <View style={styles.priceCol}>
        <Text style={styles.priceMain}>{formatMoney(displayAmount, displayCurrency)}</Text>
        <Text style={styles.priceSub}>≈ {formatMoney(homeAmount, homeCurrency)}</Text>
      </View>
    </Pressable>
  );
}

function payLabel(m: string): string {
  return m === 'card' ? 'card' : 'cash';
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  // Pulls the row back out over the host container's own horizontal padding, so
  // the tint and the bottom border reach both screen edges while the text stays
  // on the same padding as every other screen element.
  rowFullBleed: {
    marginHorizontal: -spacing.xl,
  },
  // 1px on both edges, not 2px — at 2px the rule read as a heavy block around
  // every entry. The day header no longer draws its own rule, so this is the
  // only separator above a group.
  border: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  details: { flex: 1, marginLeft: spacing.md },
  rowTitle: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '600', fontFamily: fontFamily.sans },
  metaText: { color: colors.mutedForeground, fontSize: fontSize.md, fontFamily: fontFamily.sans, marginTop: 2 },
  priceCol: { alignItems: 'flex-end' },
  priceMain: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '600', fontFamily: fontFamily.sans },
  priceSub: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: 2 },
});
