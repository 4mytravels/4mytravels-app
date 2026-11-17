// M11 — max-width layout for tablet and desktop.
// Every screen renders in ONE centred column of CONTENT_MAX_WIDTH (560 px) on
// a wide window, instead of stretching rows and cards edge to edge. The
// Statistics tab and the Stats pages get WIDE_MAX_WIDTH from WIDE_BREAKPOINT
// up, where Statistics switches to two columns. The floating nav stays on the
// 560 px column on every screen. Phones (< 560 px) are unaffected.
//
// A separate component (not inline in app/_layout) so its hooks never sit
// behind the root layout's early returns (pattern 41).
import { type ReactNode } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { usePathname } from 'expo-router';
import { colors } from '../theme/theme';
import { CONTENT_MAX_WIDTH, frameMaxWidth } from '../theme/layout';

export function AppFrame({ children, nav }: { children: ReactNode; nav: ReactNode }) {
  const { width } = useWindowDimensions();
  const pathname = usePathname() ?? '';
  const maxWidth = frameMaxWidth(width, pathname);
  return (
    <View style={styles.outer}>
      <View style={[styles.column, { maxWidth }]}>{children}</View>
      {/* The nav keeps the narrow column even on the wide Stats layout. */}
      <View pointerEvents="box-none" style={styles.navLayer}>
        <View pointerEvents="box-none" style={[styles.column, { maxWidth: CONTENT_MAX_WIDTH }]}>{nav}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.background },
  // alignSelf (not a parent alignItems) — see pattern 24: a percentage width
  // under an alignItems:center parent resolves against a shrink-to-fit box.
  column: { flex: 1, width: '100%', alignSelf: 'center' },
  navLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
