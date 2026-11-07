// SharedImportHost — web: finish an import that arrived through the share sheet.
//
// Flow: Android "Delen → 4MyTravels" POSTs the file to /import → public/sw.js
// stores the file text in a Cache entry and 303-redirects to /?shared=1 → the
// app boots (passphrase gate, then storage init) → THIS component pops the
// stored file, imports it with the shared csvImport service, and reports the
// outcome through the in-app status dialog.
//
// Only mounted when storage is ready (app/_layout.tsx passes it inside the ready
// branch), because the import writes to the encrypted database.
import { useEffect, useRef } from 'react';
import {
  clearSharedMarker,
  sharedErrorFromLocation,
  takeSharedFile,
} from '../services/sharedFile';
import { importExpensesFromCsv } from '../services/csvImport';
import { showStatus } from '../utils/statusDialog';

export function SharedImportHost() {
  // One shot per app start: a re-render (or React strict-mode double invoke)
  // must not import the same share twice.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      // The worker could not parse the shared POST (e.g. the share carried no
      // file). Report it instead of failing silently.
      if (sharedErrorFromLocation()) {
        clearSharedMarker();
        showStatus(
          'Share received, but no file',
          'The shared item contained no readable file. Try sharing the CSV again from the app it lives in.',
        );
        return;
      }

      const shared = await takeSharedFile();
      if (!shared) {
        // Landed here without a pending file (a bookmark of ?shared=1, or the
        // entry was already consumed): clean the URL and stay quiet.
        clearSharedMarker();
        return;
      }

      try {
        const { count, tripName, skippedNote } = await importExpensesFromCsv(
          shared.text,
          { targetTripId: null }, // share = auto: create the trip from the file
        );
        showStatus(
          'Import complete',
          `${count} expense(s) imported into "${tripName}"${skippedNote}.`,
        );
      } catch (e) {
        showStatus(
          'Import failed',
          `${shared.name}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      // One handler run per URL: drop the marker so a later reload does not
      // re-evaluate the share state.
      clearSharedMarker();
    })();
  }, []);

  return null;
}
