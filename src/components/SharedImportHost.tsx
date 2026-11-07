// SharedImportHost — native implementation: nothing to do.
//
// The web share target is a PWA-only feature (an Android/iOS share sheet entry
// backed by a service worker). Native receives files through the document picker
// and expo-file-system, which handles content:// URIs correctly.
export function SharedImportHost() {
  return null;
}
