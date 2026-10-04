import { useState } from 'react';
import { Car, Map as MapIcon, Navigation } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, ForwardChevron, Sheet } from '../../../components/ui';
import { destination, googleMapsUrl, wazeUrl } from '../../../domain/addresses/links';
import type { Address } from '../../../domain/types';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import s from './Addresses.module.css';

/*
 * Directions to an address. On a phone (below the desktop breakpoint, where
 * the tab bar shows) a sheet offers Waze and Google Maps; each is a plain link
 * to the service's universal link, so the installed app opens, or its website
 * if it is not installed. On desktop it is one link to Google Maps.
 *
 * Links carry the street and city only (../../../domain/addresses/links.ts).
 */

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;

export function NavigateButton({ address }: { address: Address }): JSX.Element {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const label = t('addresses.navigateTo', { name: address.name });

  if (desktop) {
    return (
      <a href={googleMapsUrl(address)} {...EXTERNAL} className={s.navigate} aria-label={label}>
        <Navigation size={18} strokeWidth={2} aria-hidden />
        {t('addresses.navigate')}
      </a>
    );
  }

  const close = (): void => setOpen(false);
  return (
    <>
      <Button variant="primary" icon={Navigation} aria-label={label} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {t('addresses.navigate')}
      </Button>
      <Sheet open={open} onClose={close} title={<bdi>{address.name}</bdi>}>
        <p className={s.destination}>
          <bdi>{destination(address)}</bdi>
        </p>
        <ul className={s.apps}>
          <li>
            <a href={wazeUrl(address)} {...EXTERNAL} className={s.app} onClick={close}>
              <Car size={22} strokeWidth={2} aria-hidden />
              <span>{t('addresses.waze')}</span>
              <ForwardChevron size={18} strokeWidth={2} aria-hidden className={s.appChevron} />
            </a>
          </li>
          <li>
            <a href={googleMapsUrl(address)} {...EXTERNAL} className={s.app} onClick={close}>
              <MapIcon size={22} strokeWidth={2} aria-hidden />
              <span>{t('addresses.googleMaps')}</span>
              <ForwardChevron size={18} strokeWidth={2} aria-hidden className={s.appChevron} />
            </a>
          </li>
        </ul>
      </Sheet>
    </>
  );
}
