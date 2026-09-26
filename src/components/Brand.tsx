import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/** The mark: a lid in the ink colour, a terracotta body and a light band. */
export function BrandMark({ size = 28 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden focusable="false">
      <rect x="7" y="3" width="14" height="5" rx="1.6" style={{ fill: 'var(--ink)' }} />
      <rect x="5" y="8" width="18" height="18" rx="4" fill="#B04A2A" />
      <rect x="5" y="13" width="18" height="4" fill="#F4DFD4" />
    </svg>
  );
}

export function Brand(): JSX.Element {
  const { t } = useTranslation();
  return (
    <Link
      to="/"
      aria-label={t('nav.home')}
      style={{
        display: 'inline-flex',
        gap: 10,
        alignItems: 'center',
        padding: '0 12px',
        color: 'var(--ink)',
        fontFamily: 'var(--serif)',
        fontSize: 30,
        fontWeight: 600,
        letterSpacing: '-0.01em',
        textDecoration: 'none',
      }}
    >
      <BrandMark />
      {/* The product's name: not translated. */}
      Nestead
    </Link>
  );
}
