import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Flame, Globe, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../../i18n';
import { cx } from '../../../components/ui';
import { EstTag, SourceBadge, WarningBadge } from './badges';
import { MatchBlock } from './MatchBlock';
import { Stars } from './Rating';
import { RecipePhoto } from './RecipePhoto';
import type { RecipeView } from './recipeView';
import { recipePath, siteOf } from './recipeView';
import s from './RecipeCard.module.css';

function Meta({ view, wrap }: { view: RecipeView; wrap?: boolean }): JSX.Element {
  const { recipe, rating, kcal, total } = view;
  return (
    <div className={cx(s.meta, wrap === true && s.metaWrap)}>
      {rating !== undefined && (
        <span className={s.metaItem}>
          <Stars value={rating} />
          <span className="tabular">{formatNumber(rating, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
        </span>
      )}
      {kcal !== null && (
        <span className={s.metaItem}>
          <Flame size={15} strokeWidth={2} aria-hidden />
          <span className="tabular" dir="auto">
            {kcal}
          </span>
          {recipe.kcalEstimated && <EstTag />}
        </span>
      )}
      <span className={s.metaItem}>
        <Clock size={15} strokeWidth={2} aria-hidden />
        <span className="tabular" dir="auto">
          {total}
        </span>
      </span>
    </div>
  );
}

/** A photo the recipe really has: its own upload, or one from the web. */
function hasPhoto(recipe: RecipeView['recipe']): boolean {
  return recipe.photoId !== undefined || recipe.photoUrl !== undefined;
}

/**
 * The vertical card: library and search grids on desktop. Without a photo
 * there is no placeholder plate; the space goes to the description and what
 * you would need to buy, so the card is shorter and says more.
 */
export function RecipeCard({ view, showNeed = false }: { view: RecipeView; showNeed?: boolean }): JSX.Element {
  const { recipe, fit, diet } = view;
  const photo = hasPhoto(recipe);
  const site = siteOf(recipe);
  return (
    <article className={cx(s.card, !photo && s.cardPlain)}>
      <Link to={recipePath(recipe)} className={s.cardLink}>
        {photo ? (
          <div className={s.photo}>
            <RecipePhoto recipe={recipe} />
            <SourceBadge kind={recipe.source.kind} className={s.badge} />
            {/* i18n: diet.label is a sentence the domain builds in English (diet.ts). */}
            {!diet.ok && <WarningBadge className={s.warn}>{diet.label}</WarningBadge>}
          </div>
        ) : (
          <div className={s.plainHead}>
            <SourceBadge kind={recipe.source.kind} className={s.plainBadge} />
            {site !== null && <span className={s.plainSite}>{site}</span>}
          </div>
        )}
        <div className={s.body}>
          <h3 className={s.title} dir="auto">
            {recipe.title}
          </h3>
          {recipe.tags.length > 0 && (
            <p className={s.tags} dir="auto">
              {recipe.tags.join(' · ')}
            </p>
          )}
          {!photo && recipe.description !== undefined && (
            <p className={s.description} dir="auto">
              {recipe.description}
            </p>
          )}
          {!photo && !diet.ok && <WarningBadge className={s.plainWarn}>{diet.label}</WarningBadge>}
          <Meta view={view} wrap />
          <div className={s.divider} />
          <MatchBlock
            have={fit.have + fit.staple}
            total={fit.total}
            missing={fit.missing}
            need={showNeed || !photo ? view.need : undefined}
          />
        </div>
      </Link>
    </article>
  );
}

/** The horizontal row: every list on mobile. */
export function RecipeRow({ view, showNeed = false, onChoose }: { view: RecipeView; showNeed?: boolean; onChoose?: () => void }): JSX.Element {
  const { t } = useTranslation();
  const { recipe, fit, diet } = view;
  const site = siteOf(recipe);
  const photo = hasPhoto(recipe);
  const content = (
    <>
      {photo && (
        <div className={s.rowPhoto}>
          <RecipePhoto recipe={recipe} />
        </div>
      )}
      <div className={s.rowBody}>
        <p className={s.rowSource}>
          {recipe.source.kind === 'web' ? <Globe size={14} strokeWidth={2} aria-hidden /> : <User size={14} strokeWidth={2} aria-hidden />}
          {recipe.source.kind === 'web' ? t('recipe.sourceWeb', { site }) : t('recipe.sourceMine')}
        </p>
        <h3 className={s.rowTitle} dir="auto">
          {recipe.title}
        </h3>
        {!photo && recipe.description !== undefined && (
          <p className={s.rowDescription} dir="auto">
            {recipe.description}
          </p>
        )}
        {!diet.ok && <WarningBadge className={s.rowWarn}>{diet.label}</WarningBadge>}
        <Meta view={view} wrap />
        <MatchBlock
          compact
          have={fit.have + fit.staple}
          total={fit.total}
          missing={fit.missing}
          need={showNeed || !photo ? view.need : undefined}
        />
      </div>
    </>
  );
  return (
    <article className={cx(s.row, !photo && s.rowPlain)}>
      {onChoose !== undefined ? (
        <button type="button" className={s.rowLink} onClick={onChoose}>
          {content}
        </button>
      ) : (
        <Link to={recipePath(recipe)} className={s.rowLink}>
          {content}
        </Link>
      )}
    </article>
  );
}

export function RecipeGrid({ children, dense = false }: { children: ReactNode; dense?: boolean }): JSX.Element {
  return <div className={cx(s.grid, dense && s.gridDense)}>{children}</div>;
}

export function RecipeList({ children }: { children: ReactNode }): JSX.Element {
  return <div className={s.list}>{children}</div>;
}
