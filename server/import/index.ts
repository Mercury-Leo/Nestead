/**
 * Recipe import: fetch a web page and read the recipe out of it.
 *
 * Framework-agnostic on purpose: `(request: Request) => Promise<Response>`.
 * It runs as a Cloudflare Pages Function in production (functions/api/import.ts)
 * and as Vite dev-server middleware locally (vite.config.ts). No dependencies:
 * schema.org JSON-LD is read with JSON.parse, and the microdata fallback with a
 * small tag scanner.
 *
 * It returns the recipe as the page states it: ingredient lines stay as text
 * and the app parses them with the same parser it uses everywhere else.
 *
 * Fetching arbitrary URLs from a server is an SSRF risk, so: only http(s), no
 * private, loopback or link-local addresses (checked again on every redirect),
 * a 10 second timeout and a 5 MB cap.
 */

export { checkUrl, isPrivateAddress } from './guard';
export { createImportHandler, handleImport } from './handler';
export { decodeEntities, detectEquipment, isoMinutes, parseRecipeHtml } from './parse';
export type { ImportError, ImportOptions, ImportReport, ImportedRecipe } from './types';
