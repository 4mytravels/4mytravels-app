// Native: write backup to the cache dir, open the share sheet, delete it again.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { shareBackupNative, type ShareOutcome } from './backupShareCore';

export function shareBackup(content: string): Promise<ShareOutcome> {
  return shareBackupNative(content, {
    isAvailable: () => Sharing.isAvailableAsync(),
    listCache: () =>
      Paths.cache.list().filter((e): e is File => e instanceof File).map((f) => f.name),
    writeTemp: (name, text) => {
      const f = new File(Paths.cache, name);
      if (f.exists) f.delete();
      f.create();
      f.write(text);
      return f.uri;
    },
    deleteTemp: (name) => {
      const f = new File(Paths.cache, name);
      if (f.exists) f.delete();
    },
    share: (uri, opts) => Sharing.shareAsync(uri, opts),
  });
}
