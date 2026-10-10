// PickerSheet — the shared bottom-sheet used by every currency / country /
// trip picker.
//
// WHY THIS EXISTS (the bug it fixes)
// A picker was built as a NESTED structure:
//   <Pressable onPress={close}>        <- backdrop, fills the screen
//     <Pressable onPress={stopPropagation}>   <- the sheet
//       <TextInput/> ...
//     </Pressable>
//   </Pressable>
// and relied on `stopPropagation()` to keep taps inside the sheet from closing
// it. That is unreliable: the backdrop handler still fired in the web build, so
// on the PWA the currency search field could not be focused at all ("add
// expense") and in the trip editor the sheet closed the instant it opened.
//
// The fix is structural, not a stopPropagation patch: the backdrop and the sheet
// are SIBLINGS. The backdrop is an absolutely positioned fill behind the sheet;
// the sheet is a sibling above it. A tap on the sheet can never reach the
// backdrop handler, on any platform, because they are not ancestors of each
// other.
//
// Wrapped in SheetPortal: a real <Modal> on native, a document.body portal on
// web (react-native-web cannot nest a Modal inside the modal route /trips/new).

import { PropsWithChildren, ReactNode, useEffect, useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SheetPortal } from './SheetPortal';
import { useKeyboardHeight } from '../utils/useKeyboardHeight';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme/theme';

export function PickerSheet({
  visible,
  onClose,
  title,
  query,
  onQueryChange,
  queryPlaceholder,
  /** Rows, each already filtered. */
  children,
  maxListHeight = 380,
  /** Shown under the search field, e.g. a result count. */
  footer,
}: PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  title: string;
  query: string;
  onQueryChange: (v: string) => void;
  queryPlaceholder: string;
  maxListHeight?: number;
  footer?: ReactNode;
}>) {
  const keyboardHeight = useKeyboardHeight();
  const searchRef = useRef<TextInput>(null);
  // Focus the search field once the sheet is open. Done in an effect (NOT via
  // the TextInput `autoFocus` prop): autoFocus inside a web portal overlay is
  // unreliable — the field appears focused but typing does not register (the
  // "search werkt niet" regression). A ref + effect focuses the real node
  // after mount on web and native alike.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => searchRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [visible]);
  // Android/OEM keyboards and mobile-web virtual keyboards do not resize the
  // window reliably; pad the sheet by the measured overlap so the search field
  // stays reachable.
  const pad =
    Platform.OS !== 'ios' && keyboardHeight > 0 ? { paddingBottom: spacing.xl + keyboardHeight } : null;
  // While the keyboard is up there is only a strip of screen left: shrink the
  // list so the field and a few rows remain visible. 180px (not 220) keeps the
  // total sheet height below typical viewport heights, which is what stops the
  // Samsung keyboard from opening at all (an input lower in the sheet can force
  // it even when the sheet is already padded).
  const listHeight = keyboardHeight > 0 ? Math.min(maxListHeight, 180) : maxListHeight;

  return (
    <SheetPortal visible={visible} onRequestClose={onClose}>
      {/* SIBLING 1: backdrop. Absolutely positioned, painted behind the sheet. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      {/* SIBLING 2: the sheet. Not a descendant of the backdrop, so no tap on
          the search field can bubble into "close". */}
      <View style={[styles.sheet, Platform.OS === 'web' && styles.sheetWeb, pad]}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            ref={searchRef}
            style={styles.searchInput}
            value={query}
            onChangeText={onQueryChange}
            placeholder={queryPlaceholder}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            // No `autoFocus` here (it broke typing in the web portal — see the
            // focus effect above). Explicit props keep typing reliable.
          />
          {query !== '' && (
            <Pressable hitSlop={8} onPress={() => onQueryChange('')}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
        {footer}
        {/* A real ScrollView (not a plain View): on web a View never scrolls, so
            the long currency/country lists were cut off with no way to reach the
            rest. ScrollView scrolls on web AND native. */}
        <ScrollView style={{ maxHeight: listHeight }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </SheetPortal>
  );
}

/** One selectable row inside a PickerSheet. */
export function PickerRow({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.row, active && styles.rowActive]} onPress={onPress}>
      <Text style={[styles.rowText, active && { color: colors.primary, fontWeight: '700' }]} numberOfLines={1}>
        {label}
      </Text>
      {active && <Ionicons name="checkmark" size={18} color={colors.primary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetWeb: {
    width: '100%',
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.foreground,
    fontSize: fontSize.xl,
    fontWeight: '700',
    fontFamily: fontFamily.heading,
  },
  done: { color: colors.primary, fontWeight: '700', fontSize: fontSize.md, fontFamily: fontFamily.sans },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.secondary,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    // Without minWidth:0 an <input> on web refuses to shrink and pushes the
    // clear button out of the row.
    minWidth: 0,
    color: colors.foreground,
    fontSize: fontSize.lg,
    fontFamily: fontFamily.sans,
    paddingVertical: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowActive: {},
  rowText: { flex: 1, color: colors.foreground, fontSize: fontSize.md, fontFamily: fontFamily.sans },
});