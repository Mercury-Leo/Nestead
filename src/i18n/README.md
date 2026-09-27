# i18n
Translation and locale: the i18next instance, the provider that owns language and reading direction, and Intl formatting helpers.

## Files
| File | Responsibility |
| --- | --- |
| `index.ts` | The public surface: screens import from `../i18n`, never the files below. |
| `i18n.ts` (+ `i18n.test.ts`) | i18next with English bundled; `LOCALES`, `loadLocale()`, `localeReady`, `readLocale()`. |
| `LocaleProvider.tsx` | `LocaleProvider` and `useLocale()`: owns `lang` and `dir` on `<html>`; `setLocale()` loads, then switches. |
| `format.ts` | `formatNumber`, `formatDate`, `formatRelative`, `daysFromToday`, `formatList`, `formatListParts`, `localizeDigits`, `isolateNumber`. |
| `i18next.d.ts` | Types `t()` keys from `locales/en.json`, so an unknown key fails to compile. |
| `literals.test.ts` | Fails on English interface text written straight into code. |
| `locales/en.json` | English strings, bundled. |
| `locales/he.json` | Hebrew strings, a separate chunk fetched on first use. |

## How it works
- Other locales load through `LOADERS` (`i18n.ts`); `main.tsx` waits for `localeReady`, so a Hebrew page never shows English first.
- The locale is the person's choice per device, under the device preference `locale`; there is no language detector (`i18n.ts`).
- `index.html` sets `lang` and `dir` from the same key before first paint; `LocaleProvider` then takes over (`LocaleProvider.tsx`).
- In right-to-left locales `formatList()` and `isolateNumber()` add Unicode isolates, so English names and "1½" keep their order (`format.ts`).
- The language picker is on the Family page (`../features/family/FamilyPage.tsx`).

## Connections
- Uses: `../data/local/localStore.ts` (device preferences).
- Used by: `../main.tsx`, `../app/`, and every feature.

## Rules & gotchas
- A new language needs `locales/<code>.json`, an entry in `LOCALES` and one in `LOADERS` (`i18n.ts`); `i18n.test.ts` fails if any is missing.
- `literals.test.ts` scans `src/` except `domain/`, `data/`, `i18n/`, any `/seed/` path, `defaultColumns.ts` and `larder/labels.ts`, all matched by path. Mark deliberate English with an `i18n:` comment.
- Only `en.json` types the keys: other locales use their own plural categories (Hebrew adds `_two`) (`i18n.ts`).
- English copy is British, and Intl formats English as `en-GB` (`LOCALES` in `i18n.ts`).

## Tests
`i18n.test.ts`: every key the source uses exists, plural forms, each locale file matches `en.json` (keys, placeholders, tags), `index.html` agrees with the provider, right-to-left formatting. `literals.test.ts`: the untranslated-text net and a check that it still catches strays.
