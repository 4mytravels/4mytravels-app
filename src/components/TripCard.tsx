// Trip card — ONE implementation, used by the Trips tab and the trip detail
// screen, so both show the exact same layout and the exact same numbers.
//
// Layout (MatthyB's design): the trip photo is a fixed 224px stage (same format
// as the home-screen journey card) with the badge, the name, the dates, the day
// bar and the pace verdict ON it; the daily/total figures sit on a flat surface
// BELOW the photo, so the image never runs behind the numbers.
import { useMemo, useRef } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, radius, fontSize, spacing, cardShadow } from '../theme/theme';
import type { Expense, Trip, TripStatus } from '../types';
import { deriveTripStatus } from '../store/tripStore';
import { computeTripStats } from '../utils/tripStats';
import { dayProgressRatio, formatDayProgress } from '../utils/pace';
import { formatDateRange } from '../utils/days';
import { formatMoney, formatMoneyWhole } from '../utils/currency';
import { bytesToDataUri, TRIP_COVER_HEIGHT } from '../utils/image';

// Scrim colour = the app background; only the opacity changes over the photo.
const SCRIM = '#0A0A1A';

const BADGE: Record<TripStatus, { label: string; fg: string; bg: string }> = {
  active: { label: 'ACTIVE', fg: '#5EEAD4', bg: 'rgba(13,148,136,0.32)' },
  upcoming: { label: 'UPCOMING', fg: '#BFDBFE', bg: 'rgba(59,130,246,0.28)' },
  past: { label: 'PAST', fg: 'rgba(226,232,240,0.72)', bg: 'rgba(148,163,184,0.22)' },
};

export function TripCard({
  trip,
  expenses,
  onPress,
  onManage,
  style,
}: {
  trip: Trip;
  expenses: Expense[];
  /** Omit both handlers to render a static card (trip detail screen). */
  onPress?: () => void;
  onManage?: () => void;
  style?: object;
}) {
  const status = deriveTripStatus(trip);
  const badge = BADGE[status];
  // SAME helper as every other screen → the numbers can never disagree.
  const stats = useMemo(() => computeTripStats(trip, expenses), [trip, expenses]);
  const budget = stats.tripBudget;

  // The bar shows the DAY you are on, not the money spent: day 7 of 14 → half
  // full. Finished trips are always full (daysElapsed == totalDays).
  const ratio = dayProgressRatio(stats.pace.daysElapsed, stats.totalDays);
  const overBudget = stats.totalSpend > budget;
  const paceOver = stats.pace.status === 'over_budget';
  const verdict = overBudget || paceOver
    ? { text: 'Over budget', color: colors.destructive }
    : { text: 'On track', color: colors.success };
  // TWO colours only (user rule): blue for every trip that is still running or
  // not started yet — including one that is over budget — and grey ONLY once the
  // trip is finished. No red bar, ever; the "Over budget" label carries that.
  // Both fills are TRANSLUCENT so the cover photo shows through the bar
  // (user request: "maak de blauwe lijn doorzichtig zodat de afbeelding er
  // achter beter zichtbaar wordt"). A solid fill hid the photo underneath.
  const fill = status === 'past' ? colors.mutedBar : colors.primaryBar;

  const coverBytes = (trip as Trip & { coverBytes?: Uint8Array | null }).coverBytes;
  const tripCoverUri = coverBytes && coverBytes.length > 0 ? bytesToDataUri(coverBytes) : null;
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

        <CardScrim />

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
              <Ionicons name="ellipsis-horizontal" size={17} color={colors.foreground} />
            </Pressable>
          )}
        </View>

        {/* On the photo: name → dates → the day bar → verdict + day counter. */}
        <View style={styles.cardBottom}>
          <Text style={styles.tripName} numberOfLines={1}>
            {trip.name}
          </Text>
          <Text style={styles.dates} numberOfLines={1}>
            {formatDateRange(trip.startDate, trip.endDate)}
          </Text>

          <View style={styles.track}>
            <View
              style={{
                width: `${Math.round(ratio * 100)}%`,
                height: '100%',
                borderRadius: radius.full,
                backgroundColor: fill,
              }}
            />
          </View>

          <View style={styles.verdictRow}>
            <Text style={[styles.verdictText, { color: verdict.color }]} numberOfLines={1}>
              {verdict.text}
            </Text>
            <Text style={styles.verdictDay} numberOfLines={1}>
              {dayText}
            </Text>
          </View>
        </View>
      </View>

      {/* Footer: flat card surface, NO photo behind it — daily pace left, trip
          total right, same numbers as the detail screen. */}
      <View style={styles.footer}>
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
      </View>
    </View>
  );

  // Static on screens that already have their own actions (trip detail).
  if (!onPress && !onManage) {
    return <View style={style}>{body}</View>;
  }

  return (
    <PressableScale onPress={onPress} onLongPress={onManage} style={style}>
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
function CardScrim() {
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="tripScrimTop" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={SCRIM} stopOpacity="0.38" />
          <Stop offset="1" stopColor={SCRIM} stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="tripScrimBottom" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={SCRIM} stopOpacity="0" />
          <Stop offset="0.45" stopColor={SCRIM} stopOpacity="0.72" />
          <Stop offset="1" stopColor={SCRIM} stopOpacity="0.92" />
        </LinearGradient>
        {/* Surface for a trip without a photo yet — brand gradient. */}
        <LinearGradient id="tripNoPhoto" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1B1E46" />
          <Stop offset="0.55" stopColor="#2A2560" />
          <Stop offset="1" stopColor="#141432" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="45" fill="url(#tripScrimTop)" />
      <Rect x="0" y="38" width="100" height="62" fill="url(#tripScrimBottom)" />
    </Svg>
  );
}

/** No photo yet → brand gradient + the airplane mark. */
function PhotoFallback() {
  return (
    <>
      <Svg
        style={StyleSheet.absoluteFill}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        pointerEvents="none"
      >
        <Rect x="0" y="0" width="100" height="100" fill="url(#tripNoPhoto)" />
      </Svg>
      <View style={styles.photoFallbackMark} pointerEvents="none">
        <Ionicons name="airplane-outline" size={40} color="rgba(226,232,240,0.28)" />
      </View>
    </>
  );
}

/** Cards compress to 0.98 on press — the handoff's tactile response. */
function PressableScale({
  children,
  onPress,
  onLongPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
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
      onPressIn={() => to(0.98)}
      onPressOut={() => to(1)}
      style={style}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  // Photo box: SAME 224px format as the new/edit-trip preview (shared
  // TRIP_COVER_HEIGHT constant in src/utils/image.ts). The overflow keeps the
  // scrim and the absolute rows inside — the image never bleeds into the
  // figure footer below.
  stage: { width: '100%', height: TRIP_COVER_HEIGHT, overflow: 'hidden' },
  // Brightening lift: a low white veil over the photo (under the scrim), so the
  // native Android JPEG — darker than the web canvas re-encode — matches the
  // PWA. 6% keeps it subtle; text contrast is unaffected (scrim sits on top).
  brighten: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(255,255,255,0.06)' },
  pastVeil: { backgroundColor: 'rgba(10,10,26,0.46)' },
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
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  managePressed: { backgroundColor: 'rgba(255,255,255,0.20)' },
  cardBottom: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    bottom: spacing.lg,
  },
  // SAME type as the home-screen journey title (fontSize.xl / 700 / heading).
  tripName: { fontFamily: fontFamily.heading, fontSize: fontSize.xl, fontWeight: '700', color: '#FFFFFF' },
  dates: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: '500',
    color: 'rgba(226,232,240,0.72)',
    marginTop: 3,
    marginBottom: spacing.md,
  },
  track: { height: 4, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.10)', overflow: 'hidden' },
  // Verdict + day counter, on the photo (the image is their background).
  verdictRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  verdictText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, fontWeight: '700', letterSpacing: 0.3 },
  verdictDay: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, fontWeight: '600', color: 'rgba(226,232,240,0.82)' },
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
  statLabel: { fontFamily: fontFamily.sans, fontSize: 10, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', color: colors.mutedForeground, marginBottom: 4 },
  statValue: { fontFamily: fontFamily.sans, fontSize: fontSize.lg, fontWeight: '700', color: colors.foreground },
  statOf: { fontFamily: fontFamily.sans, fontSize: fontSize.base, fontWeight: '500', color: colors.mutedForeground },
});
