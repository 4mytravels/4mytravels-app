// M4: keep trips.cover_thumb filled and the store in sync with it.
// Runs in the background after storage init and after a backup restore — the
// two moments a cover can exist without a thumbnail (pre-M4 data, restored
// backups, which carry only the full cover).
import { backfillCoverThumbs } from '../db/tripRepo';
import { useTripStore } from '../store/tripStore';
import { makeCoverThumb } from './image';

let running: Promise<void> | null = null;

export function syncCoverThumbs(): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      const written = await backfillCoverThumbs(makeCoverThumb);
      const { updateTrip } = useTripStore.getState();
      for (const [id, thumb] of Object.entries(written)) {
        // Thumb in, full cover out of memory (a restore put full covers here).
        updateTrip(id, { coverThumb: thumb, coverBytes: undefined });
      }
    } catch (e) {
      // Not fatal: cards fall back to the full cover / gradient until next start.
      console.warn('cover thumbnail backfill failed', e);
    } finally {
      running = null;
    }
  })();
  return running;
}
