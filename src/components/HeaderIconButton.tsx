// HeaderIconButton — the bare icon button used in every screen title row
// (settings gear, search). Design rule: WHITE icon, no circle background, no
// border; the 44x44 box keeps the touch target accessible.

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { colors, themedStyles } from '../theme/theme';

export function HeaderIconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = 22,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
}) {
  return (
    <Pressable
      style={styles.btn}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
    >
      <Ionicons name={icon} size={size} color={colors.foreground} />
    </Pressable>
  );
}

/** Settings gear for the right end of a screen title row. */
export function SettingsGear() {
  const router = useRouter();
  return <HeaderIconButton icon="settings-outline" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />;
}

const styles = themedStyles(() => StyleSheet.create({
  btn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
}));
