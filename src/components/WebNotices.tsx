// Web-only notice column, rendered IN the layout flow directly under a screen's
// header (user request: the storage-health warning belongs at the top too, next
// to the install nudge — not floating above the nav).
//
// Order: the storage warning first (it is about data the user might lose), then
// the install nudge. Both children are opaque cards with their own horizontal
// margin, so this wrapper only groups them for one mount point per screen.
//
// Native renders nothing (both children are web-only by themselves).
import { Platform, View } from 'react-native';
import { PwaInstallBanner } from './PwaInstallBanner';
import { StorageHealthBanner } from './StorageHealthBanner';

export function WebNotices() {
  if (Platform.OS !== 'web') return null;
  return (
    <View>
      <StorageHealthBanner />
      <PwaInstallBanner />
    </View>
  );
}
