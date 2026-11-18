// ExpenseRow — the ONE expense row used by the Expenses tab, the trip detail
// screen and the Home "expenses today" list. Anything that renders an expense
// MUST use this so the three stay identical.
//
// Anatomy (design 2026-11, 02-uitgaven-voorstel): coloured category circle |
// category (small, muted) / note — or the split range — as title / payment
// icon + method (+ country only when it differs from the trip's primary
// country) | expense currency on top, ≈ home currency below.
//
// Rows of one day sit inside ONE rounded block: the host passes
// `blockPosition` and the row draws its own slice of the block border plus an
// inset divider. Leave it undefined for a standalone card.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { IconCircle } from './ui';
import { categoryColor, categoryIcon } from '../utils/categoryIcons';
import { countryName } from '../data/countries';
import { countryDiffers } from '../utils/rowCountry';
import { formatMoney, toHomeCurrency } from '../utils/currency';
import { colors, fontFamily, fontSize, spacing, tabularNums, themedStyles } from '../theme/theme';
import type { Expense } from '../types';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ICON = 40;
const BLOCK_RADIUS = 16;

export type BlockPosition = 'only' | 'first' | 'middle' | 'last';

/** Position of item `index` in a day block of `count` rows. */
export function blockPositionOf(index: number, count: number): BlockPosition {
  if (count <= 1) return 'only';
  if (index === 0) return 'first';
  return index === count - 1 ? 'last' : 'middle';
}

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
  background,
  dense = false,
  blockPosition,
  primaryCountry,
}: {
  expense: Expense;
  homeCurrency: string;
  /** Receives the row's expense so hosts can pass ONE stable callback (Q6 memo). */
  onPress: (expense: Expense) => void;
  /** Set when this row is one day of a multi-day split: shows the share. */
  splitShare?: number | null;
  background?: string;
  /** Tighter vertical rhythm, used by every expense list. */
  dense?: boolean;
  /** Slice of a day block this row draws (undefined = standalone card). */
  blockPosition?: BlockPosition;
  /** The trip's primary country: the row only prints a country that differs. */
  primaryCountry?: string;
}) {
  const isSplitDay = splitShare != null;
  // The per-day share is stored in the trip home currency (pattern 1); convert
  // back to the original currency only for display.
  const displayAmount = isSplitDay ? (splitShare as number) / expense.rateToHome : expense.amount;
  const homeAmount = isSplitDay ? (splitShare as number) : toHomeCurrency(expense);

  const range = isSplitDay
    ? shortDateRange(expense.multiDaySplit!.splitStart, expense.multiDaySplit!.splitEnd)
    : null;
  // Title: the note; a split without a note shows its date range; else category.
  const title = expense.notes || range || expense.category;
  const metaParts = [payLabel(expense.paymentMethod)];
  if (range && expense.notes) metaParts.push(range);
  if (countryDiffers(expense.country, primaryCountry)) metaParts.push(countryName(expense.country!));

  const inBlock = blockPosition != null;
  const isTop = blockPosition === 'only' || blockPosition === 'first';
  const isBottom = blockPosition === 'only' || blockPosition === 'last';

  return (
    <Pressable
      style={[
        styles.row,
        dense && styles.rowDense,
        inBlock && styles.rowInBlock,
        inBlock && isTop && styles.blockTop,
        inBlock && isBottom && styles.blockBottom,
        background != null && { backgroundColor: background },
      ]}
      onPress={() => onPress(expense)}
    >
      {inBlock && !isTop && <View style={styles.divider} pointerEvents="none" />}
      <IconCircle
        icon={categoryIcon(expense.category)}
        size={ICON}
        color={colors.white}
        backgroundColor={categoryColor(expense.category)}
      />
      <View style={styles.details}>
        <Text style={styles.category} numberOfLines={1}>{expense.category}</Text>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.metaRow}>
          <Ionicons
            name={expense.paymentMethod === 'card' ? 'card-outline' : 'cash-outline'}
            size={13}
            color={colors.mutedForeground}
          />
          <Text style={styles.metaText} numberOfLines={1}>{metaParts.join(' · ')}</Text>
        </View>
      </View>
      <View style={styles.priceCol}>
        <Text style={styles.priceMain}>{formatMoney(displayAmount, expense.currency)}</Text>
        <Text style={styles.priceSub}>≈ {formatMoney(homeAmount, homeCurrency)}</Text>
      </View>
    </Pressable>
  );
}

function payLabel(m: string): string {
  return m === 'card' ? 'Card' : 'Cash';
}

const styles = themedStyles(() => StyleSheet.create({
  // Standalone: its own card. In a block: the row draws only its slice.
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
  rowInBlock: {
    marginVertical: 0,
    borderRadius: 0,
    borderTopWidth: 0,
    borderBottomWidth: 0,
  },
  blockTop: {
    borderTopWidth: 1,
    borderTopLeftRadius: BLOCK_RADIUS,
    borderTopRightRadius: BLOCK_RADIUS,
  },
  blockBottom: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: BLOCK_RADIUS,
    borderBottomRightRadius: BLOCK_RADIUS,
  },
  // Inset hairline: starts under the text column, not under the icon.
  divider: {
    position: 'absolute',
    top: 0,
    left: spacing.lg + ICON + spacing.md,
    right: spacing.lg,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  details: { flex: 1, marginLeft: spacing.md, minWidth: 0 },
  category: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  rowTitle: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '600', fontFamily: fontFamily.sans, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText: { flexShrink: 1, color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  priceCol: { alignItems: 'flex-end', marginLeft: spacing.sm },
  priceMain: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '600', fontFamily: fontFamily.sans, ...tabularNums },
  priceSub: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: 2, ...tabularNums },
}));

// Q6: memoised — a list re-render no longer re-renders every unchanged row.
export const ExpenseRow = memo(ExpenseRowImpl);
