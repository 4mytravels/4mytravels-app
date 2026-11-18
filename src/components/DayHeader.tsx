// DayHeader — the label above one day's block of expense rows (Expenses tab,
// trip detail). Left-aligned: dot (orange on today, muted otherwise) + label
// ("Today" / "Yesterday" / "21 Nov") + " · " + the day total.

import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, fontSize, spacing, tabularNums, themedStyles } from '../theme/theme';
import { categoryColors } from '../utils/categoryIcons';

/** Today's accent = the Food orange, so the dot matches the category palette. */
const TODAY_DOT = categoryColors.Food;

export function DayHeader({ label, total, isToday }: { label: string; total: string; isToday: boolean }) {
  return (
    <View style={styles.wrap} accessibilityRole="header">
      <View style={[styles.dot, { backgroundColor: isToday ? TODAY_DOT : colors.mutedForeground }]} />
      <Text style={styles.text} numberOfLines={1}>
        {label}
        <Text style={styles.total}>{` · ${total}`}</Text>
      </Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flexShrink: 1, color: colors.foreground, fontSize: fontSize.lg, fontWeight: '700', fontFamily: fontFamily.heading },
  total: { ...tabularNums },
}));
