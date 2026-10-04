import type { Address } from '../types';

/*
 * Navigation links for an address. Only the street and city go into a link:
 * an apartment number confuses geocoding, and the door code must never leave
 * the app (no URL, no history entry, no referrer).
 */

type Place = Pick<Address, 'street' | 'city'>;

/** "<street>, <city>", what a maps app is asked to find. */
export function destination(place: Place): string {
  return `${place.street.trim()}, ${place.city.trim()}`;
}

/** Opens Waze (the app if installed, else its site) routing to the address. */
export function wazeUrl(place: Place): string {
  return `https://waze.com/ul?q=${encodeURIComponent(destination(place))}&navigate=yes`;
}

/** Google Maps directions to the address: the app on a phone, the site on desktop. */
export function googleMapsUrl(place: Place): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination(place))}`;
}
