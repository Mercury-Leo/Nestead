/**
 * A family's OpenRouter key, encrypted by the server: AES-256-GCM under
 * AI_KEY_SECRET, with the family id as additional authenticated data, so a
 * ciphertext opens only for the family it was made for. Stored as
 * v1:<iv>:<ciphertext>, both base64url; the version leaves room for a second
 * secret later. Postgres never sees the secret or the plaintext.
 */

const VERSION = 'v1';
const IV_BYTES = 12;
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array | null {
  if (text === '' || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/** The AES key from AI_KEY_SECRET (32 bytes, base64), or null when it is missing or the wrong size. */
export async function importSecret(base64: string | undefined): Promise<CryptoKey | null> {
  const raw = (base64 ?? '').trim();
  if (raw === '') return null;
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(raw), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
  if (bytes.byteLength !== 32) return null;
  return crypto.subtle.importKey('raw', bytes as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptKey(plain: string, familyId: string, secret: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: encoder.encode(familyId) as BufferSource },
    secret,
    encoder.encode(plain) as BufferSource,
  );
  return `${VERSION}:${toBase64Url(iv)}:${toBase64Url(new Uint8Array(sealed))}`;
}

/** The key, or null when the text is not ours, was changed, or belongs to another family. */
export async function decryptKey(stored: string, familyId: string, secret: CryptoKey): Promise<string | null> {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const iv = fromBase64Url(parts[1] as string);
  const sealed = fromBase64Url(parts[2] as string);
  if (iv === null || sealed === null || iv.byteLength !== IV_BYTES) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: encoder.encode(familyId) as BufferSource },
      secret,
      sealed as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
