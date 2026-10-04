import { photonProvider } from './photon';
import type { AddressProvider } from './types';

/**
 * The address-search service the app uses: the one place that names it.
 * functions/api/places.ts and vite.config.ts both take it from here, so
 * swapping services is a new provider beside photon.ts and this one line.
 */
export function defaultAddressProvider(): AddressProvider {
  return photonProvider();
}
