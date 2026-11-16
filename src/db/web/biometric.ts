// Biometric / device-credential unlock for the PWA (WebAuthn PRF extension).
//
// The passkey never leaves the authenticator. Its PRF output is a stable,
// credential-bound secret; we HKDF it into an AES-GCM key that wraps the
// Argon2id-derived database key. Only ciphertext is stored (localStorage), so
// the passphrase stays the recovery path and the raw key is never persisted.
// If the browser/authenticator has no PRF support, enroll() throws
// BiometricUnsupported and the app keeps using the passphrase.

const STORE_KEY = '4mytravels.biometric.v1';
const DISMISS_KEY = '4mytravels.biometric.dismissed';
const INFO = '4mytravels-pwa-prf-wrap-v1';

export class BiometricUnsupported extends Error {
  constructor(msg = 'Biometric unlock is not supported on this device/browser') {
    super(msg);
    this.name = 'BiometricUnsupported';
  }
}

interface Stored { credId: string; prfSalt: string; iv: string; ct: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
const nav = (): any => (globalThis as any).navigator;

const b64 = (b: ArrayBuffer | Uint8Array): string => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s);
};
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rand = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));

function load(): Stored | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

export function isBiometricEnrolled(): boolean {
  return load() !== null;
}

export function wasBiometricDismissed(): boolean {
  try { return globalThis.localStorage?.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}
export function dismissBiometricPrompt(): void {
  try { globalThis.localStorage?.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
}

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const PKC = (globalThis as any).PublicKeyCredential;
    if (!PKC || !nav()?.credentials?.create || !window.isSecureContext) return false;
    return !!(await PKC.isUserVerifyingPlatformAuthenticatorAvailable?.());
  } catch {
    return false;
  }
}

export function disableBiometric(): void {
  try { globalThis.localStorage?.removeItem(STORE_KEY); } catch { /* ignore */ }
}

async function prfSecret(credId: Uint8Array | null, prfSalt: Uint8Array): Promise<Uint8Array> {
  const assertion = await nav().credentials.get({
    publicKey: {
      challenge: rand(32),
      userVerification: 'required',
      timeout: 60000,
      ...(credId ? { allowCredentials: [{ type: 'public-key', id: credId }] } : {}),
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  const first = assertion?.getClientExtensionResults?.()?.prf?.results?.first;
  if (!first) throw new BiometricUnsupported('This authenticator did not return a PRF secret');
  return new Uint8Array(first);
}

async function wrapKey(secret: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', secret as BufferSource, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode(INFO) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Create a passkey and wrap the (session) database key with its PRF secret. */
export async function enrollBiometric(keyHex: string): Promise<void> {
  if (!(await isBiometricAvailable())) throw new BiometricUnsupported();
  const prfSalt = rand(32);
  const cred = await nav().credentials.create({
    publicKey: {
      challenge: rand(32),
      rp: { name: '4MyTravels' },
      user: { id: rand(16), name: '4MyTravels', displayName: '4MyTravels' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  if (!cred || !cred.getClientExtensionResults?.()?.prf?.enabled) {
    throw new BiometricUnsupported('This device does not support the WebAuthn PRF extension');
  }
  const credId = new Uint8Array(cred.rawId);
  // Some browsers only return the PRF result on get(), not on create().
  const created = cred.getClientExtensionResults().prf?.results?.first;
  const secret = created ? new Uint8Array(created) : await prfSecret(credId, prfSalt);
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    await wrapKey(secret),
    new TextEncoder().encode(keyHex),
  );
  const rec: Stored = { credId: b64(credId), prfSalt: b64(prfSalt), iv: b64(iv), ct: b64(ct) };
  globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(rec));
}

/** Prompt for biometrics and return the database key, or null if cancelled/failed. */
export async function unlockWithBiometric(): Promise<string | null> {
  const rec = load();
  if (!rec) return null;
  try {
    const secret = await prfSecret(unb64(rec.credId), unb64(rec.prfSalt));
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(rec.iv) as BufferSource },
      await wrapKey(secret),
      unb64(rec.ct) as BufferSource,
    );
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}
