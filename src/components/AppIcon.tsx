// One icon renderer: Ionicons by default, MaterialCommunityIcons for `mci:`
// names (see src/utils/tripIcons.ts).
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { StyleProp, TextStyle } from 'react-native';
import { splitIconName } from '../utils/tripIcons';

export type AppIconName = keyof typeof Ionicons.glyphMap | `mci:${string}`;

export function AppIcon({ name, size, color, style }: {
  name: AppIconName; size: number; color: string; style?: StyleProp<TextStyle>;
}) {
  const { family, glyph } = splitIconName(name);
  if (family === 'mci') {
    return <MaterialCommunityIcons name={glyph as keyof typeof MaterialCommunityIcons.glyphMap} size={size} color={color} style={style} />;
  }
  return <Ionicons name={glyph as keyof typeof Ionicons.glyphMap} size={size} color={color} style={style} />;
}
