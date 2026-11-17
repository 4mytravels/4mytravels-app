// Generated PWA passphrase: 6 random EFF-large words (~77 bits), CSPRNG with
// rejection sampling so every word is exactly uniform.
// M5: the 7 776-word list (~60 KB) is only needed on first use, so it is
// loaded on demand instead of sitting in the entry bundle.

function randomIndex(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

export async function generatePassphrase(words = 6): Promise<string> {
  const { WORDLIST } = await import('./wordlist');
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(WORDLIST[randomIndex(WORDLIST.length)]);
  return out.join('-');
}
