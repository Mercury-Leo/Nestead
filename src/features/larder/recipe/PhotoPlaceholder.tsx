import { cx } from '../../../components/ui/cx';
import s from './PhotoPlaceholder.module.css';

const LINENS = ['#E9D9C4', '#DCE3D3', '#EAD3C8', '#D6DEE2', '#EDDDB9', '#E2D5DD', '#D5E0D6', '#F0D9C6'];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** A warm linen tile with a plain plate on it, for recipes without a photo. */
export function PhotoPlaceholder({ title, className }: { title: string; className?: string }): JSX.Element {
  const h = hash(title);
  const linen = LINENS[h % LINENS.length];
  const stripe = LINENS[(h + 3) % LINENS.length];
  return (
    <div className={cx(s.placeholder, className)} style={{ background: linen }} aria-hidden>
      <svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMid slice" className={s.placeholderSvg}>
        <defs>
          <radialGradient id={`plate-${h}`} cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#fffdf8" />
            <stop offset="100%" stopColor="#f3ece1" />
          </radialGradient>
        </defs>
        <g opacity="0.55">
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} x={-10 + i * 9} y="95" width="4" height="80" fill={stripe} transform="rotate(-20 20 130)" />
          ))}
        </g>
        <ellipse cx="102" cy="80" rx="58" ry="58" fill="rgba(41,35,30,0.10)" />
        <circle cx="100" cy="75" r="58" fill={`url(#plate-${h})`} />
        <circle cx="100" cy="75" r="42" fill="none" stroke="rgba(41,35,30,0.06)" strokeWidth="2" />
      </svg>
    </div>
  );
}
