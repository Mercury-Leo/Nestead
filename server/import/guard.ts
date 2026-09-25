import type { ImportError } from './types';

/**
 * The SSRF guard: only http(s), and no private, loopback or link-local
 * addresses, whether written literally or resolved from a name.
 */

function ipv4Private(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function ipv6Private(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (lower === '::' || lower === '::1') return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped !== null) return ipv4Private(mapped[1] as string);
  return /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || /^ff/.test(lower);
}

export function isPrivateAddress(address: string): boolean {
  return address.includes(':') ? ipv6Private(address) : ipv4Private(address);
}

function isIpLiteral(host: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[') || host.includes(':');
}

/** Why a URL may not be fetched, or null when it may. */
export async function checkUrl(raw: string, resolveHost?: (host: string) => Promise<string[]>): Promise<ImportError | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'invalid-url';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'invalid-url';
  if (url.username !== '' || url.password !== '') return 'blocked';
  const host = url.hostname.toLowerCase();
  if (host === '' || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return 'blocked';
  }
  if (isIpLiteral(host)) return isPrivateAddress(host) ? 'blocked' : null;
  if (!host.includes('.')) return 'blocked';
  if (resolveHost !== undefined) {
    try {
      const addresses = await resolveHost(host);
      if (addresses.length === 0 || addresses.some(isPrivateAddress)) return 'blocked';
    } catch {
      return 'fetch-failed';
    }
  }
  return null;
}
