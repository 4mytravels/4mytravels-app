// G3: the category donut of the Stats overview (moved out of statistics.tsx).
// Palette is unchanged (donutPalette, via computeBreakdown).
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Path, G } from 'react-native-svg';
import { colors, fontFamily, fontSize, themedStyles, tabularNums } from '../../theme/theme';
import { formatMoney } from '../../utils/currency';
import { categoryIcon } from '../../utils/categoryIcons';
import { donutSlicePath, labelPos, type DonutSlice } from '../../utils/stats/breakdown';

export function DonutChart({
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
        const pos = labelPos(cx, cy, (s.startAngle + s.endAngle) / 2, labelR);
        return (
          <View
            key={`label-${s.category}`}
            style={[styles.sliceLabelWrap, { left: pos.x - 45, top: pos.y - 12, width: 90 }]}
            pointerEvents="none"
          >
            <View style={styles.sliceLabelRow}>
              <Ionicons name={categoryIcon(s.category)} size={10} color={colors.white} style={{ marginRight: 2 }} />
              <Text maxFontSizeMultiplier={1.3} style={styles.sliceLabelText} numberOfLines={1}>
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
        <Text style={styles.donutCenterLabel}>Total</Text>
        <Text style={styles.donutCenterValue}>{formatMoney(total, 'EUR')}</Text>
      </View>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  donutEmpty: { backgroundColor: colors.surfaceStrong, justifyContent: 'center', alignItems: 'center' },
  donutEmptyText: { color: colors.mutedForeground, fontSize: fontSize.md, fontFamily: fontFamily.sans },
  sliceLabelWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  sliceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.black45,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sliceLabelText: { color: colors.white, fontSize: 11, fontWeight: '600', fontFamily: fontFamily.sans },
  donutCenter: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  donutCenterLabel: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginBottom: 2 },
  donutCenterValue: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '800', fontFamily: fontFamily.heading, ...tabularNums },
}));
