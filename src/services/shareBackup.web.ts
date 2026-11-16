// Web/PWA: Web Share API with the file (in-memory Blob); download fallback.
import { shareBackupWeb, type ShareOutcome } from './backupShareCore';

export function shareBackup(content: string): Promise<ShareOutcome> {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator) : undefined;
  return shareBackupWeb(content, {
    makeFile: (text, name, type) => new File([text], name, { type }),
    canShare: nav?.canShare ? (d) => nav.canShare(d as ShareData) : undefined,
    share: nav?.share ? (d) => nav.share(d as ShareData) : undefined,
    download: (text, name, type) => {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
  });
}
