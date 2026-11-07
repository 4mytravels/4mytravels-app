// StatusHost — native implementation: nothing to render.
//
// `showStatus` calls Alert.alert on native (see utils/statusDialog.ts), so the
// host is only needed on web. Metro resolves StatusHost.web.tsx there; this file
// is what the native bundle gets.
export function StatusHost() {
  return null;
}
