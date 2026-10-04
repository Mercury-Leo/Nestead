import { Navigation } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { navigationUrl } from '../../../domain/addresses/links';
import type { NavigationPlatform } from '../../../domain/addresses/links';
import type { Address } from '../../../domain/types';
import s from './Addresses.module.css';

/*
 * Directions to an address, through the device's own navigation:
 *   * Android: a geo: link, so the system asks which app to use (Waze, Google
 *     Maps, …), or opens the default one if the person has set it.
 *   * iPhone and iPad: Apple Maps. iOS has no chooser and no geo: scheme.
 *   * Anything else (a computer): Google Maps in a new tab.
 *
 * This reads the user agent rather than the width: it picks how a link is
 * handed to the operating system, not a layout, and a narrow desktop window
 * has no app chooser to open.
 *
 * Links carry the street and city only (../../../domain/addresses/links.ts).
 */

export function navigationPlatform(): NavigationPlatform {
  const agent = navigator.userAgent;
  if (/Android/i.test(agent)) return 'android';
  // iPadOS asks for desktop pages and calls itself a Mac; only its touch screen gives it away.
  if (/iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) return 'ios';
  return 'other';
}

export function NavigateButton({ address }: { address: Address }): JSX.Element {
  const { t } = useTranslation();
  const platform = navigationPlatform();
  // geo: hands over to the system; a new tab would be left open and blank.
  const external = platform === 'android' ? {} : ({ target: '_blank', rel: 'noopener noreferrer' } as const);
  return (
    <a href={navigationUrl(address, platform)} {...external} className={s.navigate} aria-label={t('addresses.navigateTo', { name: address.name })}>
      <Navigation size={18} strokeWidth={2} aria-hidden />
      {t('addresses.navigate')}
    </a>
  );
}
