// Q17: ONE trip actions menu — opened by the ⋯ button on trip detail, the ⋯ on
// a TripCard and a long-press on a TripCard. Edit, Change photo, Export CSV,
// and Delete (red, LAST, behind a confirmation).
//
// Backdrop and sheet are SIBLINGS (pattern 23): a tap on the sheet can never
// reach the backdrop's close handler. The sheet stays open while the delete
// confirmation is pending and closes only after the answer (pattern 42).
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { Trip } from '../types';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme/theme';
import { changeTripCover, deleteTripWithConfirm, exportTripCsv } from '../utils/tripActions';

type IconName = keyof typeof Ionicons.glyphMap;

export function TripActionsMenu({
  trip,
  onClose,
  onDeleted,
}: {
  trip: Trip | null;
  onClose: () => void;
  /** Runs after a confirmed, successful delete (e.g. leave the detail screen). */
  onDeleted?: (trip: Trip) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!trip) return null;

  const item = (icon: IconName, label: string, onPress: () => void, destructive = false) => (
    <Pressable
      key={label}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={destructive ? colors.destructive : colors.foreground} />
      <Text style={[styles.itemText, destructive && { color: colors.destructive }]}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu">
        <View style={styles.backdrop} />
      </Pressable>
      <View style={styles.anchor} pointerEvents="box-none">
        <View style={[styles.sheet, { marginBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.title} numberOfLines={1}>
            {trip.name}
          </Text>
          {item('create-outline', 'Edit trip', () => {
            router.push({ pathname: '/trips/new', params: { editId: trip.id } });
            // Close AFTER the push (on web the backdrop swallowed the tap otherwise).
            onClose();
          })}
          {item('image-outline', 'Change photo', () => {
            onClose();
            void changeTripCover(trip);
          })}
          {item('document-text-outline', 'Export CSV', () => {
            onClose();
            void exportTripCsv(trip);
          })}
          <View style={styles.rule} />
          {item(
            'trash-outline',
            'Delete trip',
            () => {
              void (async () => {
                const deleted = await deleteTripWithConfirm(trip);
                onClose();
                if (deleted) onDeleted?.(trip);
              })();
            },
            true,
          )}
          <Pressable style={[styles.item, styles.cancel]} onPress={onClose} accessibilityRole="button">
            <Text style={[styles.itemText, styles.cancelText]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  anchor: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', paddingHorizontal: spacing.md },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  title: {
    fontFamily: fontFamily.heading,
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.foreground,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  itemPressed: { backgroundColor: colors.surfaceSoft },
  itemText: { fontFamily: fontFamily.sans, fontSize: fontSize.md, fontWeight: '600', color: colors.foreground },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  cancel: { justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.xs },
  cancelText: { color: colors.mutedForeground },
});
