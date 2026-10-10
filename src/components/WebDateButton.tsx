// WebDateButton — calendar icon that opens the BROWSER's native date picker
// on web (the community DateTimePicker has no web implementation). Native
// platforms never render this; they keep the existing picker flow.

import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable } from 'react-native';
import { colors, spacing } from '../theme/theme';

export function WebDateButton({
  value,
  onChange,
}: {
  value: string; // 'YYYY-MM-DD' or ''
  onChange: (iso: string) => void;
}) {
  // Hooks BEFORE any conditional return (rules of hooks).
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  if (Platform.OS !== 'web') return null;
  return (
    <Pressable hitSlop={8} style={{ flexShrink: 0 }} onPress={() => inputRef.current?.showPicker?.()}>
      <Ionicons
        name="calendar-outline"
        size={20}
        color={colors.mutedForeground}
        style={{ paddingHorizontal: spacing.lg }}
      />
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, border: 'none', padding: 0 }}
        tabIndex={-1}
      />
    </Pressable>
  );
}
