import { Link } from 'react-router-dom';

/** The mark: a dark lid, a terracotta body and a light band. */
export function BrandMark({ size = 28 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden focusable="false">
      <rect x="7" y="3" width="14" height="5" rx="1.6" fill="#29231E" />
      <rect x="5" y="8" width="18" height="18" rx="4" fill="#B04A2A" />
      <rect x="5" y="13" width="18" height="4" fill="#F4DFD4" />
    </svg>
  );
}

export function Brand(): JSX.Element {
  return (
    <Link
      to="/"
      aria-label="Nestead home"
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
      Nestead
    </Link>
  );
}
