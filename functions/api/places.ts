import { createPlacesHandler, defaultAddressProvider } from '../../server/places';

/**
 * Cloudflare Pages Function at /api/places: address suggestions for the
 * address form. No secret: the service is chosen in server/places/provider.ts.
 */
const handler = createPlacesHandler({ provider: defaultAddressProvider() });

export const onRequest = (context: { request: Request }): Promise<Response> => handler(context.request);
