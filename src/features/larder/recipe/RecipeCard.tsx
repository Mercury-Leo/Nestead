import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, Clock, Flame, Globe, ShoppingBag, Star, User } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { formatNumber } from '../../../i18n';
import { cx } from '../../../components/ui';
import { EstTag, WarningBadge } from './badges';
import { MatchBar, NeedLine } from './MatchBlock';
import { RecipePhoto } from './RecipePhoto';
import { dietLabel } from '../labels';
import type { RecipeView } from './recipeView';
import { recipePath, siteOf } from './recipeView';
import s from './RecipeCard.module.css';

/*
 * Cards and rows show what you scan for (title, time, rating, what to buy, the
 * fit bar and any diet warning) and keep the rest behind a per-card toggle.
 * Only the title and photo open the recipe, so the toggle can be a real button
 * beside them rather than a control nested in a link.
 */

/** A photo the recipe really has: its own upload, or one from the web. */
function hasPhoto(recipe: RecipeView['recipe']): boolean {
  return recipe.photoId !== undefined || recipe.photoUrl !== undefined;
}

/**
 * The title, and the photo when there is one, go to the recipe, or choose it
 * in Import. The photo repeats the title's target, so it stays out of the tab
 * order and the accessibility tree.
 */
function Target({ view, onChoose, className, decorative = false, children }: {
  view: RecipeView;
  onChoose?: () => void;
  className: string;
  decorative?: boolean;
  children: ReactNode;
}): JSX.Element {
  const hidden = decorative ? ({ tabIndex: -1, 'aria-hidden': true } as const) : {};
  return onChoose !== undefined ? (
    <button type="button" className={className} onClick={onChoose} {...hidden}>
      {children}
    </button>
  ) : (
    <Link to={recipePath(view.recipe)} className={className} {...hidden}>
      {children}
    </Link>
  );
}

/** Time, rating and what to buy: the one line you scan. */
function Meta({ view }: { view: RecipeView }): JSX.Element {
  const { t } = useTranslation();
  const { rating, total, fit } = view;
  const stars = rating === undefined ? null : formatNumber(rating, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <p className={s.meta}>
      <span className={s.metaItem}>
        <Clock size={15} strokeWidth={2} aria-hidden />
        <span className="tabular" dir="auto">
          {total}
        </span>
      </span>
      {stars !== null && (
        <span className={s.metaItem}>
          <Star size={15} strokeWidth={0} fill="var(--honey)" aria-hidden />
          <span className="tabular" aria-hidden>
            {stars}
          </span>
          <span className="visually-hidden">{t('recipe.stars', { value: stars })}</span>
        </span>
      )}
      {fit.missing === 0 ? (
        <span className={cx(s.metaItem, s.nothing)}>
          <Check size={15} strokeWidth={2.4} aria-hidden />
          {t('recipe.badge.nothingToBuy')}
        </span>
      ) : (
        <span className={cx(s.metaItem, s.toBuy)}>
          <ShoppingBag size={15} strokeWidth={2} aria-hidden />
          <span className="tabular">{t('recipe.badge.toBuy', { count: fit.missing })}</span>
        </span>
      )}
    </p>
  );
}

/** The fit bar, and the toggle for the details that explain it. */
function BarRow({ view, open, controls, onToggle }: { view: RecipeView; open: boolean; controls: string; onToggle: () => void }): JSX.Element {
  const { t } = useTranslation();
  const { recipe, fit } = view;
  return (
    <div className={s.barRow}>
      <MatchBar have={fit.have + fit.staple} total={fit.total} />
      <button
        type="button"
        className={cx(s.toggle, open && s.toggleOpen)}
        aria-expanded={open}
        aria-controls={controls}
        aria-label={t('recipe.card.more', { title: recipe.title })}
        onClick={onToggle}
      >
        <ChevronDown size={20} strokeWidth={2.2} aria-hidden />
      </button>
    </div>
  );
}

/** Behind the toggle: tags, description, calories, the fit in numbers, what to buy and where it came from. */
function Details({ view, id, open }: { view: RecipeView; id: string; open: boolean }): JSX.Element {
  const { t } = useTranslation();
  const { recipe, fit, kcal, need } = view;
  const site = siteOf(recipe);
  return (
    <div id={id} className={s.details} hidden={!open}>
      {recipe.tags.length > 0 && (
        <p className={s.tags} dir="auto">
          {recipe.tags.join(' · ')}
        </p>
      )}
      {recipe.description !== undefined && (
        <p className={s.description} dir="auto">
          {recipe.description}
        </p>
      )}
      <p className={s.facts}>
        {kcal !== null && (
          <span className={s.metaItem}>
            <Flame size={15} strokeWidth={2} aria-hidden />
            <span className="tabular" dir="auto">
              {kcal}
            </span>
            {recipe.kcalEstimated && <EstTag />}
          </span>
        )}
        <span>
          <Trans
            i18nKey="recipe.match.haveCompact"
            values={{ have: fit.have + fit.staple, total: fit.total }}
            components={{ strong: <strong className="tabular" /> }}
          />
        </span>
      </p>
      <NeedLine need={need} />
      <p className={s.source}>
        {recipe.source.kind === 'web' ? <Globe size={14} strokeWidth={2} aria-hidden /> : <User size={14} strokeWidth={2} aria-hidden />}
        <span dir="auto">{recipe.source.kind === 'web' ? t('recipe.sourceWeb', { site }) : t('recipe.sourceMine')}</span>
      </p>
    </div>
  );
}

/** Title, warning, meta line, bar and details: the same in a card and a row. */
function Body({ view, onChoose, titleClass }: { view: RecipeView; onChoose?: () => void; titleClass: string }): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const id = useId();
  const { recipe, diet } = view;
  return (
    <>
      <h3 className={titleClass} dir="auto">
        <Target view={view} onChoose={onChoose} className={s.titleLink}>
          {recipe.title}
        </Target>
      </h3>
      {!diet.ok && <WarningBadge className={s.warn}>{dietLabel(t, diet)}</WarningBadge>}
      <Meta view={view} />
      <BarRow view={view} open={open} controls={id} onToggle={() => setOpen(!open)} />
      <Details view={view} id={id} open={open} />
    </>
  );
}

/** The vertical card: library and search grids on desktop. */
export function RecipeCard({ view }: { view: RecipeView }): JSX.Element {
  return (
    <article className={s.card}>
      {hasPhoto(view.recipe) && (
        <Target view={view} className={s.photo} decorative>
          <RecipePhoto recipe={view.recipe} />
        </Target>
      )}
      <div className={s.body}>
        <Body view={view} titleClass={s.title} />
      </div>
    </article>
  );
}

/** The horizontal row: every list on mobile, and Import's results, where it chooses instead of opening. */
export function RecipeRow({ view, onChoose }: { view: RecipeView; onChoose?: () => void }): JSX.Element {
  return (
    <article className={s.row}>
      {hasPhoto(view.recipe) && (
        <Target view={view} onChoose={onChoose} className={s.rowPhoto} decorative>
          <RecipePhoto recipe={view.recipe} />
        </Target>
      )}
      <div className={s.body}>
        <Body view={view} onChoose={onChoose} titleClass={s.rowTitle} />
      </div>
    </article>
  );
}

export function RecipeGrid({ children, dense = false }: { children: ReactNode; dense?: boolean }): JSX.Element {
  return <div className={cx(s.grid, dense && s.gridDense)}>{children}</div>;
}

export function RecipeList({ children }: { children: ReactNode }): JSX.Element {
  return <div className={s.list}>{children}</div>;
}
