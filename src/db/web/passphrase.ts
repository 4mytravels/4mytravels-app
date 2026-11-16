// Generated PWA passphrase: 6 random EFF-large words (~77 bits), CSPRNG with
// rejection sampling so every word is exactly uniform.
import { WORDLIST } from './wordlist';

function randomIndex(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

export function generatePassphrase(words = 6): string {
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(WORDLIST[randomIndex(WORDLIST.length)]);
  return out.join('-');
}
