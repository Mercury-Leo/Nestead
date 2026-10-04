/**
 * Address search: suggestions for the address form's street field.
 *
 * Framework-agnostic like ../search: `(request: Request) => Promise<Response>`,
 * run as a Cloudflare Pages Function (functions/api/places.ts) and as Vite
 * middleware (vite.config.ts). The service behind it is an AddressProvider,
 * chosen in provider.ts; the browser only ever calls /api/places.
 */

export { createPlacesHandler, planQuery } from './handler';
export { photonProvider, photonUrl, toSuggestions } from './photon';
export type { PhotonOptions } from './photon';
export { defaultAddressProvider } from './provider';
export { PlacesProviderError } from './types';
export type { AddressProvider, AddressQuery, AddressSuggestion, PlacesError, PlacesOptions } from './types';
