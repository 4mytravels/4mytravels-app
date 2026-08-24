// App logo (the 4MT mark from the Obsidian vault /assets/icon.png).
// Use this in headers instead of the placeholder globe icon.
import { Image, StyleSheet } from 'react-native';
import { colors } from '../theme/theme';

export function AppLogo({ size = 28 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icon.png')}
      style={[styles.logo, { width: size, height: size, borderRadius: size * 0.22 }]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  logo: { backgroundColor: colors.background },
});
