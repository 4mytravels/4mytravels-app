import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { colors, fontFamily, radius, fontSize, spacing, navShadow } from '../../src/theme/theme';

type NavItem = {
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
};

const NAV_ITEMS: NavItem[] = [
  { name: '/home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { name: '/trips', label: 'Trips', icon: 'airplane-outline', activeIcon: 'airplane' },
  { name: '/expenses', label: 'Expenses', icon: 'wallet-outline', activeIcon: 'wallet' },
  { name: '/statistics', label: 'Stats', icon: 'bar-chart-outline', activeIcon: 'bar-chart' },
];

export function FloatingNav() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();

  const HIDDEN_ROUTES = ['/trips/new'];
  const shouldHide = HIDDEN_ROUTES.some(p => pathname === p || pathname.startsWith(`${p}/`));
  if (shouldHide) return null;

  const isActive = (path: string) => {
    if (path === '/home') return pathname === '/' || pathname === '/home' || pathname.startsWith('/home/');
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <View
      style={[
        styles.navContainer,
        { bottom: insets.bottom + 18 },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.name);
          return (
            <Pressable
              key={item.name}
              onPress={() => {
            // Web: push() stacks screens on every tab switch (the old screen
            // stays mounted underneath — duplicated content, dead overlays).
            // replace() swaps the tab route; native keeps push semantics.
            if (Platform.OS === 'web') {
              router.replace(item.name as never);
            } else {
              router.push(item.name as never);
            }
          }}
              style={({ pressed }) => [
                styles.navItem,
                active && styles.navItemActive,
                pressed && styles.navItemPressed,
              ]}
            >
              <Ionicons
                name={active ? item.activeIcon : item.icon}
                size={20}
                color={active ? colors.primaryForeground : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.navLabel,
                  { color: active ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Full-bleed: the nav must span edge to edge so the items sit in one straight
  // row from the left edge to the right edge. On web, `left:0/right:0` +
  // `alignItems:'center'` + a child with `width:'100%'` makes react-native-web
  // resolve the percentage against a shrink-to-fit parent — the bar came out
  // as a centred pill instead. `alignSelf: 'stretch'` removes the dependency on
  // percentage resolution entirely.
  navContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignSelf: 'stretch',
    // Small horizontal inset so the rounded pill is not flush against the edges.
    paddingHorizontal: spacing.sm,
  },
  nav: {
    flexDirection: 'row',
    height: 60,
    padding: 5,
    gap: 2,
    alignSelf: 'stretch',
    borderRadius: radius.full,
    backgroundColor: colors.navSurface,
    borderWidth: 1,
    borderColor: colors.border,
    ...navShadow,
  },
  navItem: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  navItemActive: {
    backgroundColor: colors.primary,
  },
  navItemPressed: {
    transform: [{ scale: 0.94 }],
  },
  navLabel: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: fontFamily.sans,
    lineHeight: 11,
  },
});
