import { PlacesProviderError } from './types';
import type { AddressProvider, AddressQuery, AddressSuggestion } from './types';

/*
 * Photon (https://photon.komoot.io): OpenStreetMap search-as-you-type, free
 * and keyless on komoot's shared server, which asks for fair use and promises
 * no uptime. A self-hosted Photon takes the same requests: pass its URL.
 *
 * Photon names places in English, German or French when asked, and otherwise
 * in the local language, which in Israel is Hebrew. It refuses `lang=he` with
 * a 400, so a Hebrew query asks for no language and gets the local names.
 *
 * Results lean towards Israel (a point with a low zoom) without being limited
 * to it, so a street of the same name elsewhere still shows.
 */

const PHOTON = 'https://photon.komoot.io/api/';
const BIAS = { lat: '31.5', lon: '34.9', zoom: '7' };

export interface PhotonOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Sent with every request, as komoot asks of apps using its server. */
  userAgent?: string;
}

export function photonProvider(options: PhotonOptions = {}): AddressProvider {
  const baseUrl = options.baseUrl ?? PHOTON;
  const userAgent = options.userAgent ?? 'Nestead family app (https://nestead.pages.dev)';
  return {
    // OpenStreetMap's licence asks for this wherever its data is shown.
    attribution: '© OpenStreetMap contributors',
    async suggest(query, signal) {
      const doFetch = options.fetch ?? fetch;
      const response = await doFetch(photonUrl(baseUrl, query), {
        signal,
        headers: { accept: 'application/json', 'user-agent': userAgent },
      });
      if (response.status === 429) throw new PlacesProviderError('limit');
      if (!response.ok) throw new PlacesProviderError('places-failed');
      const body = (await response.json()) as { features?: unknown };
      return toSuggestions(body.features, query.limit);
    },
  };
}

export function photonUrl(baseUrl: string, query: AddressQuery): string {
  const url = new URL(baseUrl);
  url.searchParams.set('q', query.text);
  // Ask for more than are shown: duplicates and places without a city are dropped.
  url.searchParams.set('limit', String(query.limit * 2));
  if (query.language === 'en') url.searchParams.set('lang', 'en');
  url.searchParams.append('layer', 'house');
  url.searchParams.append('layer', 'street');
  url.searchParams.set('lat', BIAS.lat);
  url.searchParams.set('lon', BIAS.lon);
  url.searchParams.set('zoom', BIAS.zoom);
  return url.toString();
}

const clean = (value: unknown): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/**
 * Photon's GeoJSON features as suggestions. A house is its street and number;
 * a street is its name. The city is the city, else the town or village Photon
 * files under locality or district. Each street and city shows once.
 */
export function toSuggestions(features: unknown, limit: number): AddressSuggestion[] {
  if (!Array.isArray(features)) return [];
  const out: AddressSuggestion[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    if (typeof feature !== 'object' || feature === null) continue;
    const props = (feature as { properties?: unknown }).properties;
    if (typeof props !== 'object' || props === null) continue;
    const p = props as Record<string, unknown>;

    const kind = clean(p.type);
    const streetName = kind === 'house' ? clean(p.street) : kind === 'street' ? clean(p.name) : '';
    if (streetName === '') continue;
    const number = kind === 'house' ? clean(p.housenumber) : '';
    const street = number === '' ? streetName : `${streetName} ${number}`;
    const city = clean(p.city) || clean(p.locality) || clean(p.district);
    if (city === '') continue;

    const key = `${street}|${city}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const suggestion: AddressSuggestion = { street, city };
    const country = clean(p.country);
    if (country !== '') suggestion.country = country;
    out.push(suggestion);
    if (out.length === limit) break;
  }
  return out;
}
