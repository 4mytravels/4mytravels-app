// Bottom fade-out scrim for scrolling lists that sit behind the floating nav.
//
// Why: the floating nav is translucent and floats over the content, so the last
// rows of a list end in a hard cut right at the nav's edge. This scrim paints a
// linear gradient from the page background up top to fully transparent, letting
// the data fade out under the bar (user request, Expenses tab — "test of dit
// mooier is"; set FADE_UNDER_NAV = false in the screen to switch it back off).
//
// Uses react-native-svg (already a dependency for the statistics charts) so the
// gradient is smooth on native AND on the PWA — banded alpha Views look stepped
// at this size.
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../theme/theme';

// One switch for every screen: set to false to get the old hard cut back.
export const FADE_UNDER_NAV = true;

/**
 * Drop-in scrim for a screen: fades the scrolling content out underneath the
 * floating nav. Render it after the list/scroll view (and before the FAB), it
 * sizes itself from the safe-area inset. Screens that show it also pad their
 * content by `insets.bottom + 106` so the last row stays reachable.
 */
export function NavFadeScrim() {
  const insets = useSafeAreaInsets();
  if (!FADE_UNDER_NAV) return null;
  return <FadeScrim height={insets.bottom + 78 + 46} />;
}

export function FadeScrim({
  /** Total height of the scrim, measured from the bottom of the screen. */
  height,
  /** Distance of the opaque end from the top of the scrim (the nav's top edge). */
  solidFrom = 46,
  id = 'fade-scrim',
}: {
  height: number;
  solidFrom?: number;
  id?: string;
}) {
  const gradId = `${id}-gradient`;
  const solidOffset = Math.max(0.01, Math.min(1, solidFrom / height));
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.background} stopOpacity={0} />
            <Stop offset={String(solidOffset)} stopColor={colors.background} stopOpacity={1} />
            <Stop offset="1" stopColor={colors.background} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradId})`} />
      </Svg>
    </View>
  );
}