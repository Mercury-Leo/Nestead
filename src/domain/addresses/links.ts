import type { Address } from '../types';

/*
 * Navigation links for an address. Only the street and city go into a link:
 * an apartment number confuses geocoding, and the door code must never leave
 * the app (no URL, no history entry, no referrer).
 */

type Place = Pick<Address, 'street' | 'city'>;

/** Which kind of device a link is for: each hands directions over differently. */
export type NavigationPlatform = 'android' | 'ios' | 'other';

/** "<street>, <city>", what a maps app is asked to find. */
export function destination(place: Place): string {
  return `${place.street.trim()}, ${place.city.trim()}`;
}

/**
 * A geo: URI. Android hands it to the system, which asks which navigation app
 * to use (Waze, Google Maps, …), or opens the one set as the default.
 */
export function geoUrl(place: Place): string {
  return `geo:0,0?q=${encodeURIComponent(destination(place))}`;
}

/** Apple Maps directions. iOS has no app chooser and no geo: scheme, so this is its system route. */
export function appleMapsUrl(place: Place): string {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(destination(place))}`;
}

/** Google Maps directions in a browser tab, for desktops and anything else. */
export function googleMapsUrl(place: Place): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination(place))}`;
}

/** The link that opens the device's own navigation. */
export function navigationUrl(place: Place, platform: NavigationPlatform): string {
  if (platform === 'android') return geoUrl(place);
  if (platform === 'ios') return appleMapsUrl(place);
  return googleMapsUrl(place);
}
