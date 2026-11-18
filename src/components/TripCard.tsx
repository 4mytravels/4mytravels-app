// Trip card — ONE implementation, used by the Trips tab and the trip detail
// screen, so both show the exact same layout and the exact same numbers.
//
// Layout (MatthyB's design): the trip photo is a fixed 224px stage (same format
// as the home-screen journey card) with the badge, the name, the dates, the day
// bar and the pace verdict ON it; the daily/total figures sit on a flat surface
// BELOW the photo, so the image never runs behind the numbers.
import { useId, useMemo, useRef } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fontFamily, radius, fontSize, spacing, cardShadow, onImageTextShadow, themedStyles, IMAGE_SCRIM, tabularNums } from '../theme/theme';
import type { Expense, Trip, TripStatus } from '../types';
import { deriveTripStatus } from '../store/tripStore';
import { computeTripStats, hasDailyBudget, todayBudgetLeft, budgetRingRatio } from '../utils/tripStats';
import { formatDayProgress } from '../utils/pace';
import { formatDateRange } from '../utils/days';
import { formatMoney, formatMoneyWhole } from '../utils/currency';
import { bytesToDataUri, tripCoverStageSize } from '../utils/image';

// Scrim colour = the app background; only the opacity changes over the photo.
// Theme-independent: this gradient darkens a PHOTO under white text (G5).
const SCRIM = IMAGE_SCRIM;

const BADGE: Record<TripStatus, { label: string; fg: string; bg: string }> = {
  active: { label: 'ACTIVE', fg: colors.teal300, bg: colors.teal32 },
  upcoming: { label: 'UPCOMING', fg: colors.blue200, bg: colors.blue28 },
  past: { label: 'PAST', fg: colors.foreground72, bg: colors.slate22 },
};

export function TripCard({
  trip,
  expenses,
  onPress,
  onManage,
  pressLabel,
  style,
  variant = 'default',
  todaySpent,
  todayCurrency,
}: {
  trip: Trip;
  expenses: Expense[];
  /** Omit both handlers to render a static card (trip detail screen). */
  onPress?: () => void;
  onManage?: () => void;
  /** Screen-reader label for onPress when it is not "open trip" (M9: trip detail → change photo). */
  pressLabel?: string;
  style?: object;
  /** 'home' = journey card: stronger scrim, budget ring, "Today … left" footer. */
  variant?: 'default' | 'home';
  /** Home only: the SAME split-aware today total as Home's "Expenses today" header. */
  todaySpent?: number;
  /** Currency of todaySpent (Home's display currency). */
  todayCurrency?: string;
}) {
  const isHome = variant === 'home';
  const status = deriveTripStatus(trip);
  const badge = BADGE[status];
  // SAME helper as every other screen → the numbers can never disagree.
  const stats = useMemo(() => computeTripStats(trip, expenses), [trip, expenses]);
  const budget = stats.tripBudget;

  // No daily budget → no budget status at all (pattern 36).
  const showBudgetStatus = hasDailyBudget(trip);
  const overBudget = stats.totalSpend > budget;
  const paceOver = stats.pace.status === 'over_budget';

  // Home journey card: ring = share of the FULL trip budget spent; two colours
  // only (pattern 36) — primary on track, muted otherwise, never red.
  const ringRatio = isHome && showBudgetStatus ? budgetRingRatio(stats.totalSpend, budget) : null;
  // Red (same as "Over budget") once the FULL trip budget is exceeded (user request); else primary/muted.
  const ringOver = budget > 0 && stats.totalSpend > budget;
  const ringColor = ringOver
    ? colors.destructive
    : overBudget || paceOver || status === 'past'
      ? colors.mutedForeground
      : colors.primary;
  const today = isHome && status === 'active' && todaySpent != null ? todayBudgetLeft(trip.dailyBudget, todaySpent) : null;
  const todayCur = todayCurrency ?? trip.homeCurrency;

  // M4: the card draws the ~40 KB thumbnail. The full cover is only a
  // fallback for the moment between a restore and its thumbnail backfill.
  const t = trip as Trip & { coverBytes?: Uint8Array | null; coverThumb?: Uint8Array | null };
  const coverBytes = t.coverThumb && t.coverThumb.length > 0 ? t.coverThumb : t.coverBytes;
  // Q4: base64-encoding a cover is O(size) — once per cover, not per render.
  const tripCoverUri = useMemo(
    () => (coverBytes && coverBytes.length > 0 ? bytesToDataUri(coverBytes) : null),
    [coverBytes],
  );
  const dayText =
    status === 'upcoming'
      ? 'Not started'
      : formatDayProgress({
          daysElapsed: stats.pace.daysElapsed,
          totalDays: stats.totalDays,
          isFinished: stats.isFinished,
        });

  const body = (
    <View style={[styles.card, cardShadow]}>
      {/* Photo stage. Every absolute child lives INSIDE this box, so the image
          stops here and never runs behind the figures below. */}
      <View style={styles.stage}>
        {tripCoverUri ? (
          <Image source={{ uri: tripCoverUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <PhotoFallback />
        )}

        {/* Subtle brightening lift so the native (Android) photo — whose JPEG
            pipeline renders a touch darker than the web canvas re-encode —
            reads as bright/clear as the PWA does. A low white overlay ON the
            photo but UNDER the scrim: the picture lifts, the text contrast
            (scrim + labels) is untouched. One shared layer, so Home, the Trips
            tab and trip detail all stay identical. */}
        <View pointerEvents="none" style={styles.brighten} />

        {/* A past trip steps back: the veil dims the photo, never the text. */}
        {status === 'past' && <View style={[StyleSheet.absoluteFill, styles.pastVeil]} />}

        <CardScrim strong={isHome} />

        {/* Top row: status badge left, a quiet manage action right. */}
        <View style={styles.cardTop}>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
          </View>
          {onManage && (
            <Pressable
              hitSlop={12}
              onPress={onManage}
              accessibilityLabel={`Manage ${trip.name}`}
              style={({ pressed }) => [styles.manage, pressed && styles.managePressed]}
            >
              <Ionicons name="ellipsis-horizontal" size={17} color={colors.onImage} />
            </Pressable>
          )}
        </View>

        {isHome ? (
          // Home journey card: name + dates sit low on the scrim, budget ring
          // bottom-right. No day bar / verdict on the photo (user request).
          <View style={styles.homeBottom}>
            <View style={styles.homeTitles}>
              <Text style={styles.tripName} numberOfLines={1}>
                {trip.name}
              </Text>
              <Text style={[styles.dates, styles.homeDates]} numberOfLines={1}>
                {formatDateRange(trip.startDate, trip.endDate)}
              </Text>
            </View>
            {ringRatio != null && <BudgetRing
                ratio={ringRatio}
                color={ringColor}
                spent={formatMoneyWhole(stats.totalSpend, trip.homeCurrency)}
                total={formatMoneyWhole(budget, trip.homeCurrency)}
              />}
          </View>
        ) : (
        /* On the photo: name → dates → the day bar → verdict + day counter. */
        <View style={styles.cardBottom}>
          <Text style={styles.tripName} numberOfLines={1}>
            {trip.name}
          </Text>
          {/* Dates left, day counter right on ONE row (no day bar / verdict). */}
          <View style={styles.datesRow}>
            <Text style={[styles.dates, styles.datesInRow]} numberOfLines={1}>
              {formatDateRange(trip.startDate, trip.endDate)}
            </Text>
            <Text style={styles.verdictDay} numberOfLines={1}>
              {dayText}
            </Text>
          </View>
        </View>
        )}
      </View>

      {/* Footer: flat card surface, NO photo behind it — daily pace left, trip
          total right, same numbers as the detail screen. */}
      <View style={styles.footer}>
        {today && (
          <View style={styles.todayBlock}>
            {today.isOver ? (
              <Text style={[styles.todayMain, styles.todayOver]} numberOfLines={1}>
                {formatMoney(today.over, todayCur)} over today
              </Text>
            ) : (
              <Text style={styles.todayMain} numberOfLines={1}>
                Today {formatMoney(today.left, todayCur)} left
              </Text>
            )}
            <Text style={styles.todaySub} numberOfLines={1}>
              {formatMoney(today.spent, todayCur)} of {formatMoney(today.budget, todayCur)} daily budget spent
            </Text>
          </View>
        )}
        {/* Home with a today block: Daily avg / Total would duplicate the ring. */}
        {!(isHome && today) && (
        <View style={styles.footerGrid}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Daily avg</Text>
            <Text style={styles.statValue} numberOfLines={1}>
              {formatMoney(stats.dailyAverage, trip.homeCurrency)}
              <Text style={styles.statOf}> / {formatMoney(trip.dailyBudget, trip.homeCurrency)}</Text>
            </Text>
          </View>
          <View style={styles.statRight}>
            <Text style={styles.statLabel}>Total</Text>
            <Text style={styles.statValue} numberOfLines={1}>
              {formatMoneyWhole(stats.totalSpend, trip.homeCurrency)}
              <Text style={styles.statOf}> / {formatMoneyWhole(budget, trip.homeCurrency)}</Text>
            </Text>
          </View>
        </View>
        )}
      </View>
    </View>
  );

  // Static on screens that already have their own actions (trip detail).
  if (!onPress && !onManage) {
    return <View style={style}>{body}</View>;
  }

  return (
    <PressableScale onPress={onPress} onLongPress={onManage} label={pressLabel ?? `Open ${trip.name}`} style={style}>
      {body}
    </PressableScale>
  );
}

/**
 * Scrim over the cover photo so the badge, name and figures stay readable on
 * ANY image. Two SVG gradients (soft at the top for the badge, deep at the
 * bottom for the text) instead of stacked translucent Views: plain alpha layers
 * band visibly on Android and in the PWA — same reason FadeScrim is SVG.
 */
function CardScrim({ strong = false }: { strong?: boolean }) {
  // Per-instance gradient ids. The tab navigator keeps every visited screen
  // mounted, so several cards share one document on web; with fixed ids every
  // url(#…) resolved to the FIRST definition, which can sit in a hidden screen
  // and then paints nothing (found in G5: the trip-detail card lost its scrim
  // and its no-photo surface, invisible on dark, glaring on light).
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id={`tripScrimTop${uid}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={SCRIM} stopOpacity={strong ? '0.55' : '0.38'} />
          <Stop offset="1" stopColor={SCRIM} stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id={`tripScrimBottom${uid}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={SCRIM} stopOpacity="0" />
          <Stop offset="0.45" stopColor={SCRIM} stopOpacity={strong ? '0.82' : '0.72'} />
          <Stop offset="1" stopColor={SCRIM} stopOpacity={strong ? '0.96' : '0.92'} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="45" fill={`url(#tripScrimTop${uid})`} />
      <Rect x="0" y={strong ? '30' : '38'} width="100" height={strong ? '70' : '62'} fill={`url(#tripScrimBottom${uid})`} />
    </Svg>
  );
}

/** Home journey card: SVG ring = share of the full trip budget, % in the centre. */
const RING = 96;
const RING_STROKE = 6;
function BudgetRing({ ratio, color, spent, total }: { ratio: number; color: string; spent: string; total: string }) {
  const r = (RING - RING_STROKE) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.round(ratio * 100);
  return (
    <View style={styles.ring} accessibilityLabel={`${spent} of ${total} trip budget spent (${pct}%)`}>
      <Svg width={RING} height={RING} pointerEvents="none">
        <Circle cx={RING / 2} cy={RING / 2} r={r} fill="rgba(0,0,0,0.45)" />
        <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={colors.onImageTrack} strokeWidth={RING_STROKE} fill="none" />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          stroke={color}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - ratio)}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter} pointerEvents="none">
        <Text style={styles.ringText} numberOfLines={1}>{spent}</Text>
        <Text style={styles.ringSub} numberOfLines={1}>of {total}</Text>
      </View>
    </View>
  );
}

/** No photo yet → brand gradient + the airplane mark. */
function PhotoFallback() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <>
      <Svg
        style={StyleSheet.absoluteFill}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        pointerEvents="none"
      >
        <Defs>
          {/* Surface for a trip without a photo yet — brand gradient. */}
          <LinearGradient id={`tripNoPhoto${uid}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.noPhoto1} />
            <Stop offset="0.55" stopColor={colors.noPhoto2} />
            <Stop offset="1" stopColor={colors.noPhoto3} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#tripNoPhoto${uid})`} />
      </Svg>
      <View style={styles.photoFallbackMark} pointerEvents="none">
        <Ionicons name="airplane-outline" size={40} color={colors.foreground28} />
      </View>
    </>
  );
}

/** Cards compress to 0.98 on press — the handoff's tactile response. */
function PressableScale({
  children,
  onPress,
  onLongPress,
  label,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  label?: string;
  style?: object;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={320}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={() => to(0.98)}
      onPressOut={() => to(1)}
      style={style}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  // Full-bleed photo card: the trip's own cover is the background and the scrim
  // carries the text.
  card: {
    width: '100%',
    // Same corner as the home-screen journey card.
    borderRadius: radius['3xl'],
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  // Photo box: SAME 16:9 format as the new/edit-trip preview (shared
  // tripCoverStageSize in src/utils/image.ts, Q13). The overflow keeps the
  // scrim and the absolute rows inside — the image never bleeds into the
  // figure footer below.
  stage: { ...tripCoverStageSize, overflow: 'hidden' },
  // Brightening lift: a low white veil over the photo (under the scrim), so the
  // native Android JPEG — darker than the web canvas re-encode — matches the
  // PWA. 6% keeps it subtle; text contrast is unaffected (scrim sits on top).
  brighten: { ...StyleSheet.absoluteFill, backgroundColor: colors.surfaceMedium },
  pastVeil: { backgroundColor: colors.pastVeil },
  photoFallbackMark: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  cardTop: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    top: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    height: 26,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.7 },
  manage: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.onImageSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  managePressed: { backgroundColor: colors.onImageSurfacePressed },
  cardBottom: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    bottom: spacing.lg,
  },
  // SAME type as the home-screen journey title (fontSize.xl / 700 / heading).
  tripName: { fontFamily: fontFamily.heading, fontSize: fontSize.xl, fontWeight: '700', color: colors.white, ...onImageTextShadow },
  dates: {
    ...onImageTextShadow,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.foreground72,
    marginTop: 3,
    marginBottom: spacing.md,
  },
  // Verdict-free photo stage: dates + day counter on one row.
  datesRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md, marginTop: 3 },
  datesInRow: { flex: 1, minWidth: 0, marginTop: 0 },
  verdictDay: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, fontWeight: '600', color: colors.foreground82, ...onImageTextShadow },
  // Flat surface under the photo: the two figures, no image behind them.
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  footerGrid: { flexDirection: 'row', alignItems: 'flex-end' },
  stat: { flex: 1 },
  statRight: { flex: 1, alignItems: 'flex-end' },
  statLabel: { fontFamily: fontFamily.sans, fontSize: 12, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', color: colors.mutedForeground, marginBottom: 4 },
  statValue: { fontFamily: fontFamily.sans, fontSize: fontSize.lg, fontWeight: '700', color: colors.foreground, ...tabularNums },
  statOf: { fontFamily: fontFamily.sans, fontSize: fontSize.base, fontWeight: '500', color: colors.mutedForeground, ...tabularNums },
  // Home journey card.
  homeBottom: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  homeTitles: { flex: 1, minWidth: 0 },
  homeDates: { marginBottom: 0, color: colors.foreground82 },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ringCenter: { position: 'absolute', alignItems: 'center', maxWidth: RING - 16 },
  ringSub: { fontFamily: fontFamily.sans, fontSize: 10, fontWeight: '500', color: colors.foreground82, ...tabularNums },
  ringText: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.white,
    ...tabularNums,
    ...onImageTextShadow,
  },
  todayBlock: {},
  todayMain: { fontFamily: fontFamily.heading, fontSize: fontSize['2xl'], fontWeight: '700', color: colors.foreground },
  todayOver: { color: colors.mutedForeground },
  todaySub: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, fontWeight: '500', color: colors.mutedForeground, marginTop: 2 },
}));
