// ExpenseRow — the ONE expense row used by BOTH the Expenses tab and the trip
// detail screen.
//
// Before this component the two screens each had their own row and drifted
// apart (the trip-detail row repeated the category in the subtitle, the
// Expenses row showed country + payment). Anything that renders an expense —
// expenses list, trip detail, home "expenses today" — MUST use this so the three
// stay identical.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconCircle } from './ui';
import { categoryIcon } from '../utils/categoryIcons';
import { countryName } from '../data/countries';
import { formatMoney, toHomeCurrency } from '../utils/currency';
import { colors, fontFamily, fontSize, spacing, tabularNums, themedStyles } from '../theme/theme';
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

function ExpenseRowImpl({
  expense,
  homeCurrency,
  onPress,
  splitShare = null,
  /** Card fill. Defaults to the shared card surface. */
  background,
  /**
   * Tighter vertical rhythm, used by EVERY expense list (Expenses tab, Home
   * today list, trip detail) so all three look identical.
   */
  dense = false,
}: {
  expense: Expense;
  homeCurrency: string;
  /** Receives the row's expense so hosts can pass ONE stable callback (Q6 memo). */
  onPress: (expense: Expense) => void;
  /** Set when this row is one day of a multi-day split: shows the share. */
  splitShare?: number | null;
  background?: string;
  dense?: boolean;
}) {
  const isSplitDay = splitShare != null;
  // The per-day share is stored in the trip home currency, so it is shown as-is;
  // a full amount is converted once from its own currency.
  const displayAmount = isSplitDay
    ? (splitShare as number) / expense.rateToHome
    : expense.amount;
  const displayCurrency = expense.currency;
  const homeAmount = isSplitDay ? (splitShare as number) : toHomeCurrency(expense);

  // Subtitle: "Land · card" / "Land · cash". Never the category: the title
  // already falls back to the category, so repeating it told the user nothing.
  const detail = isSplitDay
    ? `${shortDateRange(expense.multiDaySplit!.splitStart, expense.multiDaySplit!.splitEnd)} · ${payLabel(expense.paymentMethod)}`
    : `${expense.country ? countryName(expense.country) : '—'} · ${payLabel(expense.paymentMethod)}`;

  return (
    <Pressable
      style={[
        styles.row,
        dense && styles.rowDense,
        background != null && { backgroundColor: background },
      ]}
      onPress={() => onPress(expense)}
    >
      <IconCircle icon={categoryIcon(expense.category)} size={40} color={colors.white} />
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

const styles = themedStyles(() => StyleSheet.create({
  // Each expense is its own card (design 2026-11): 14px radius, 1px border,
  // 8px gap between cards (4px above + 4px below). The host list already pads
  // its content by spacing.xl, so the card sits on the screen inset — no
  // full-bleed negative margin and no separator rules any more.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    marginVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  rowDense: { paddingVertical: spacing.md },
  details: { flex: 1, marginLeft: spacing.md },
  rowTitle: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '600', fontFamily: fontFamily.sans },
  metaText: { color: colors.mutedForeground, fontSize: fontSize.md, fontFamily: fontFamily.sans, marginTop: 2 },
  priceCol: { alignItems: 'flex-end' },
  priceMain: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '600', fontFamily: fontFamily.sans },
  priceSub: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: 2 },
}));

// Q6: memoised — a list re-render (search keystroke, focus reload with equal
// data) no longer re-renders every row whose props did not change.
export const ExpenseRow = memo(ExpenseRowImpl);
