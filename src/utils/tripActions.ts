// Trip-level actions shared by the ⋯ menu on trip detail, the long-press on a
// TripCard and the trip editor (Q17, M9). One implementation per action, so the
// three entry points can never drift apart (pattern 27/36: one shared copy).
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import type { Trip } from '../types';
import { useTripStore } from '../store/tripStore';
import { useExpenseStore } from '../store/expenseStore';
import { loadExpensesForList } from '../db/expenseRepo';
import { expensesToCsv } from '../services/csv';
import { processPhoto } from './image';
import { confirmDestructive } from './confirm';
import { showStatus } from './statusDialog';

/**
 * Open the photo library and return the processed cover (≤2000px, ≤500KB, EXIF
 * stripped), or null when the user cancelled. 16:9 crop = the card stage (Q13).
 */
export async function pickTripCoverBytes(): Promise<Uint8Array | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    base64: true,
    quality: 0.7,
    allowsEditing: true,
    aspect: [16, 9],
  });
  if (res.canceled || !res.assets[0]?.base64) return null;
  // Picker dimensions are passed so no extra decode pass is needed (pattern 15).
  return processPhoto(res.assets[0].base64, {
    width: res.assets[0].width,
    height: res.assets[0].height,
  });
}

/** Pick a new cover and store it on the trip directly (no editor round-trip). */
export async function changeTripCover(trip: Trip): Promise<boolean> {
  try {
    const bytes = await pickTripCoverBytes();
    if (!bytes) return false;
    const { updateTrip } = await import('../db/tripRepo');
    // Explicit bytes = replace (pattern 19: undefined keeps, null clears).
    await updateTrip(trip, bytes);
    useTripStore.getState().updateTrip(trip.id, { coverBytes: bytes });
    return true;
  } catch (e) {
    showStatus('Could not change photo', e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** Export ONE trip's expenses as CSV through the share sheet. */
export async function exportTripCsv(trip: Trip): Promise<void> {
  try {
    const list = await loadExpensesForList(trip.id);
    if (list.length === 0) {
      showStatus('Nothing to export', `"${trip.name}" has no expenses yet.`);
      return;
    }
    const csv = expensesToCsv(list, { [trip.id]: trip.name });
    const safe = trip.name.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'trip';
    const file = new File(Paths.cache, `4mt-${safe}.csv`);
    await file.write(csv);
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export expenses' });
  } catch {
    // share-sheet cancellation is not an error
  }
}

/**
 * Ask, then delete the trip and all its expenses. Resolves true only when the
 * trip was actually deleted. Uses confirmDestructive (never Alert.alert /
 * window.confirm — patterns 35 and 42).
 */
export async function deleteTripWithConfirm(trip: Trip): Promise<boolean> {
  const ok = await confirmDestructive({
    title: 'Delete trip',
    message: `Delete "${trip.name}" and all its expenses?`,
  });
  if (!ok) return false;
  const { deleteTrip } = await import('../db/tripRepo');
  useTripStore.getState().removeTrip(trip.id);
  try {
    await deleteTrip(trip.id);
    // M1: the trip's rows leave the shared expense list too.
    useExpenseStore.getState().removeTrip(trip.id);
    return true;
  } catch (e) {
    showStatus('Delete failed', e instanceof Error ? e.message : String(e));
    return false;
  }
}
