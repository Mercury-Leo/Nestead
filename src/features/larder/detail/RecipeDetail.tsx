import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookmarkPlus, Check, Clock, CookingPot, ExternalLink, Info, Pencil, Play, ShoppingBag, Soup, Timer } from 'lucide-react';
import { useSession } from '../../../auth/session';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import { BackArrow, Button, ButtonLink, EmptyState, Stepper, cx } from '../../../components/ui';
import { RatingInput, Stars } from '../recipe/Rating';
import { SourceBadge, WarningBadge } from '../recipe/badges';
import type { AnyRecipe, IngredientLine } from '../../../domain/types';
import { checkDiet } from '../../../domain/kitchen/diet';
import { detectDurations } from '../../../domain/kitchen/durations';
import { pantryFit } from '../../../domain/kitchen/fit';
import type { LineStatus } from '../../../domain/kitchen/fit';
import { formatDuration } from '../../../domain/kitchen/quantity';
import { formatNumber } from '../../../i18n';
import { totalMinutes } from '../../../domain/kitchen/search';
import type { ListHandoff } from '../../lists/useJustAdded';
import { addRecipeToList, saveToLibrary } from '../actions';
import { useKitchen } from '../KitchenContext';
import { RecipePhoto } from '../recipe/RecipePhoto';
import { recipePath } from '../recipe/recipeView';
import { scaledAmount, useServings } from '../recipe/servings';
import { equipmentIcon } from '../recipe/equipment';
import { StatusMarker } from '../recipe/StatusMarker';
import { StepText } from '../recipe/StepText';
import s from './RecipeDetail.module.css';

function Legend({ have, staple, missing }: { have: number; staple: number; missing: number }): JSX.Element {
  const { t } = useTranslation();
  return (
    <p className={s.legend}>
      <span>
        <StatusMarker status="have" className={s.legendMarker} /> {t('detail.legend.have', { count: have })}
      </span>
      <span>
        <StatusMarker status="staple" className={s.legendMarker} /> {t('detail.legend.staple', { count: staple })}
      </span>
      <span>
        <StatusMarker status="missing" className={s.legendMarker} /> {t('detail.legend.toBuy', { count: missing })}
      </span>
    </p>
  );
}

function IngredientRow({ line, status, amount }: { line: IngredientLine; status: LineStatus; amount: string }): JSX.Element {
  const { t } = useTranslation();
  return (
    <li className={cx(s.ingredient, status === 'missing' && s.ingredientMissing)}>
      <StatusMarker status={status} />
      <span className={cx(s.qty, 'tabular')} dir="auto">
        {amount}
      </span>
      <span className={s.item}>
        <span dir="auto">{line.item}</span>
        {line.note !== undefined && (
          <span className={s.note} dir="auto">
            {line.note}
          </span>
        )}
      </span>
      {status === 'staple' && <span className={s.stapleLabel}>{t('recipe.status.staple')}</span>}
      {status === 'missing' && <span className={s.toBuy}>{t('recipe.status.toBuy')}</span>}
    </li>
  );
}

function DurationChip({ phrase }: { phrase: string }): JSX.Element {
  return (
    <span className={s.chip}>
      <Timer size={14} strokeWidth={2.2} aria-hidden />
      {phrase}
    </span>
  );
}

function NotFound(): JSX.Element {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={Soup}
      title={t('detail.notFound.title')}
      actions={
        <ButtonLink to="/library" variant="primary" size="lg">
          {t('common.backToLibrary')}
        </ButtonLink>
      }
    >
      <p>{t('detail.notFound.body')}</p>
    </EmptyState>
  );
}

export function RecipeDetail(): JSX.Element {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const kitchen = useKitchen();
  const recipe = kitchen.findRecipe(decodeURIComponent(id));

  if (recipe === undefined) {
    return kitchen.loaded ? <NotFound /> : <p className="centred">{t('common.loading')}</p>;
  }
  return <Detail key={recipe.id} recipe={recipe} />;
}

function Detail({ recipe }: { recipe: AnyRecipe }): JSX.Element {
  const { t } = useTranslation();
  const { store, me } = useSession();
  const kitchen = useKitchen();
  const desktop = useIsDesktop();
  const navigate = useNavigate();
  const [servings, setServings] = useServings(recipe);
  const [busy, setBusy] = useState(false);

  const inLibrary = recipe.inLibrary === true;
  const fit = pantryFit(recipe, kitchen.pantry);
  const diet = checkDiet(recipe, kitchen.profile);
  const factor = servings / recipe.servings;
  const site = recipe.source.kind === 'web' ? recipe.source.site : null;
  const total = totalMinutes(recipe);
  const timed = recipe.steps.filter((step, i) => detectDurations(step.text, i + 1).length > 0).length;
  const have = fit.have + fit.staple;

  const makeList = async (): Promise<void> => {
    setBusy(true);
    try {
      const added = await addRecipeToList(store, kitchen.listItems, recipe, servings, kitchen.pantry);
      const handoff: ListHandoff = { added };
      navigate('/lists', { state: handoff });
    } finally {
      setBusy(false);
    }
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      const saved = await saveToLibrary(store, recipe, me.id);
      navigate(recipePath(saved), { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const rate = (rating: number): void => {
    if (inLibrary) void store.recipes.update(recipe.id, { userRating: rating });
  };

  const listLabel =
    fit.missing === 0
      ? t('detail.list.none')
      : desktop
        ? t('detail.list.make', { count: fit.missing })
        : t('detail.list.short', { count: fit.missing });
  const rating = (value: number): string => formatNumber(value);

  const sourceLine = (
    <p className={s.sourceLine}>
      <SourceBadge kind={recipe.source.kind} className={s.sourceBadge} />
      {recipe.source.kind === 'web' && (
        <a href={recipe.source.url} target="_blank" rel="noreferrer" className={s.siteLink}>
          {site} <ExternalLink size={13} strokeWidth={2.2} aria-hidden />
          <span className="visually-hidden">{t('detail.newTab')}</span>
        </a>
      )}
      {recipe.tags.length > 0 && <span className={s.sourceTags} dir="auto">· {recipe.tags.join(' · ')}</span>}
    </p>
  );

  const ratingRow = (
    <div className={s.ratingRow}>
      <div className={s.ratingTop}>
        <span className={s.eyebrow}>{t('detail.rating.yours')}</span>
        {inLibrary ? (
          <RatingInput value={recipe.userRating} onChange={rate} />
        ) : (
          <span className={s.readOnlyStars}>
            <Stars value={recipe.sourceRating ?? 0} size={22} />
          </span>
        )}
      </div>
      <p className={s.ratingNote}>
        {recipe.userRating !== undefined ? (
          <strong>{t('detail.rating.ofFive', { rating: rating(recipe.userRating) })}</strong>
        ) : inLibrary ? (
          t('detail.rating.notRated')
        ) : (
          t('detail.rating.saveToRate')
        )}
        {recipe.sourceRating !== undefined && site !== null && t('detail.rating.onSite', { rating: rating(recipe.sourceRating), site })}
      </p>
    </div>
  );

  const kcalCell = (
    <>
      <span className={s.statLabel}>{desktop ? t('detail.stats.calories') : t('detail.stats.perServing')}</span>
      <span className={s.statValue}>
        {recipe.kcalPerServing === undefined
          ? '—'
          : desktop
            ? t('detail.stats.kcalValue', { kcal: recipe.kcalPerServing })
            : formatNumber(recipe.kcalPerServing)}
      </span>
      <span className={s.statSub}>
        {recipe.kcalPerServing === undefined
          ? t('detail.stats.notEnough')
          : desktop
            ? t('detail.stats.per', { unit: recipe.servingUnit ?? t('detail.stats.serving') })
            : t('detail.stats.kcal')}
      </span>
      {recipe.kcalEstimated && recipe.kcalPerServing !== undefined && (
        <span className={s.estimated} title={t('detail.stats.estimatedWhy')} tabIndex={0}>
          <Info size={12} strokeWidth={2.4} aria-hidden /> {t('detail.stats.estimated')}
          <span className="visually-hidden">{t('detail.stats.estimatedWhySr')}</span>
        </span>
      )}
    </>
  );

  const stats = (
    <div className={s.stats}>
      <div className={s.stat}>
        <span className={s.statLabel}>{desktop ? t('detail.stats.totalTime') : t('detail.stats.total')}</span>
        <span className={s.statValue} dir="auto">
          {/* i18n: formatDuration (domain/kitchen/quantity.ts) writes English units; the phone drops " min" from "1 h 20 min" to fit. */}
          {desktop || total < 60 ? formatDuration(total) : formatDuration(total).replace(' min', '')}
        </span>
        <span className={s.statSub}>{t('detail.stats.prepCook', { prep: recipe.prepMin, cook: recipe.cookMin })}</span>
      </div>
      <div className={s.stat}>{kcalCell}</div>
      <div className={s.stat}>
        <span className={s.statLabel}>{t('detail.stats.toBuy')}</span>
        <span className={cx(s.statValue, fit.missing > 0 && s.statAccent)}>
          {desktop ? t('detail.stats.items', { count: fit.missing }) : formatNumber(fit.missing)}
        </span>
        <span className={s.statSub}>{t(desktop ? 'detail.stats.youHave' : 'detail.stats.have', { have, total: fit.total })}</span>
      </div>
    </div>
  );

  const actions = (
    <div className={s.actions}>
      <ButtonLink to={recipePath(recipe, '/cook')} variant="primary" size={desktop ? 'xl' : 'bar'} icon={Play} block className={s.cookButton}>
        {t('detail.startCooking')}
      </ButtonLink>
      <Button
        variant="secondary"
        size={desktop ? 'xl' : 'bar'}
        icon={fit.missing === 0 ? Check : ShoppingBag}
        disabled={fit.missing === 0 || busy}
        onClick={() => void makeList()}
        className={s.listButton}
      >
        {listLabel}
      </Button>
    </div>
  );

  const ingredients = (
    <section className={s.card} aria-labelledby="ingredients-title">
      <header className={s.cardHead}>
        <h3 id="ingredients-title" className={s.cardTitle}>
          {t('detail.ingredients')}
        </h3>
        <Stepper
          label={t('detail.servings')}
          fewerLabel={t('detail.fewerServings')}
          moreLabel={t('detail.moreServings')}
          caption={recipe.servingUnit !== undefined ? t('detail.servingsCaptionUnit', { unit: recipe.servingUnit }) : t('detail.servingsCaption')}
          value={servings}
          min={1}
          max={12}
          onChange={setServings}
        />
      </header>
      <Legend have={fit.have} staple={fit.staple} missing={fit.missing} />
      <ul className={s.ingredients}>
        {recipe.ingredients.map((line) => (
          <IngredientRow key={line.id} line={line} status={fit.status[line.id] ?? 'missing'} amount={scaledAmount(line, factor)} />
        ))}
      </ul>
      {fit.missing > 0 && desktop && (
        <Button variant="secondary" size="lg" block icon={ShoppingBag} disabled={busy} onClick={() => void makeList()}>
          {t('detail.addMissing', { count: fit.missing })}
        </Button>
      )}
    </section>
  );

  const equipment =
    recipe.equipment.length > 0 ? (
      <section className={cx(s.card, s.equipmentCard)} aria-labelledby="equipment-title">
        <h3 id="equipment-title" className={s.cardTitle}>
          {t('detail.equipment')}
        </h3>
        <ul className={s.equipment}>
          {recipe.equipment.map((name) => {
            const Icon = equipmentIcon(name);
            return (
              <li key={name} dir="auto">
                <span className={s.equipmentIcon} aria-hidden>
                  <Icon size={17} strokeWidth={2} />
                </span>
                {name}
              </li>
            );
          })}
        </ul>
      </section>
    ) : null;

  const steps = (
    <section className={s.steps} aria-labelledby="steps-title">
      <header className={s.stepsHead}>
        <h2 id="steps-title" className={s.sectionTitle}>
          {t('detail.steps')}
        </h2>
        <span className={s.stepsMeta}>
          {desktop
            ? t('detail.stepsMeta', { steps: t('detail.stepCount', { count: recipe.steps.length }), timers: timed })
            : t('detail.stepsMetaCompact', {
                steps: t('detail.stepCount', { count: recipe.steps.length }),
                timers: t('detail.timerCount', { count: timed }),
              })}
        </span>
      </header>
      <ol className={s.stepList}>
        {recipe.steps.map((step, index) => (
          <li key={step.id} className={s.step}>
            <span className={s.stepNumber} aria-hidden>
              {index + 1}
            </span>
            <p className={s.stepText} dir="auto">
              <StepText text={step.text} stepNumber={index + 1} renderChip={(duration) => <DurationChip phrase={duration.phrase} />} />
            </p>
          </li>
        ))}
      </ol>
      {timed > 0 && desktop && (
        <p className={s.footnote}>
          <Timer size={16} strokeWidth={2} aria-hidden /> {t('detail.footnote')}
        </p>
      )}
    </section>
  );

  const topRight = inLibrary ? (
    <ButtonLink to={`/add?edit=${encodeURIComponent(recipe.id)}`} variant="ghost" icon={Pencil}>
      {t('detail.edit')}
    </ButtonLink>
  ) : (
    <Button variant="secondary" icon={BookmarkPlus} disabled={busy} onClick={() => void save()}>
      {t('detail.saveToLibrary')}
    </Button>
  );

  if (!desktop) {
    return (
      <article className={s.mobile}>
        <div className={s.hero}>
          <RecipePhoto recipe={recipe} eager />
          <button type="button" className={s.heroBack} aria-label={t('detail.back')} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/library'))}>
            <BackArrow size={22} strokeWidth={2} aria-hidden />
          </button>
          <div className={s.heroAction}>{topRight}</div>
        </div>
        <div className={s.sheet}>
          {sourceLine}
          <h1 className={s.title} dir="auto">
            {recipe.title}
          </h1>
          {recipe.description !== undefined && (
            <p className={s.description} dir="auto">
              {recipe.description}
            </p>
          )}
          {!diet.ok && <WarningBadge className={s.dietWarn}>{diet.label}</WarningBadge>}
          {ratingRow}
          {stats}
          <h2 className={s.sectionTitle}>{t('detail.requires')}</h2>
          {ingredients}
          {equipment}
          {steps}
        </div>
        <div className={s.stickyBar}>{actions}</div>
      </article>
    );
  }

  return (
    <article>
      <div className={s.topBar}>
        <Link to="/library" className={s.back}>
          <BackArrow size={18} strokeWidth={2} aria-hidden /> {t('common.library')}
        </Link>
        {topRight}
      </div>

      <div className={s.top}>
        <div className={s.photo}>
          <RecipePhoto recipe={recipe} eager />
        </div>
        <div className={s.info}>
          {sourceLine}
          <h1 className={s.title} dir="auto">
            {recipe.title}
          </h1>
          {recipe.description !== undefined && (
            <p className={s.description} dir="auto">
              {recipe.description}
            </p>
          )}
          {!diet.ok && <WarningBadge className={s.dietWarn}>{diet.label}</WarningBadge>}
          {ratingRow}
          {stats}
          {actions}
        </div>
      </div>

      <div className={s.below}>
        <div className={s.requires}>
          <h2 className={s.sectionTitle}>{t('detail.requires')}</h2>
          <div className={s.summary}>
            <span className={s.summaryItem}>
              <span className={s.summaryIcon} aria-hidden>
                <Clock size={18} strokeWidth={2} />
              </span>
              <span>
                <strong dir="auto">{formatDuration(total)}</strong>
                <span className={s.summarySub}>{t('detail.summary.totalTime')}</span>
              </span>
            </span>
            <span className={s.summaryItem}>
              <span className={s.summaryIcon} aria-hidden>
                <ShoppingBag size={18} strokeWidth={2} />
              </span>
              <span>
                <strong>{t('common.ingredients', { count: fit.total })}</strong>
                <span className={s.summarySub}>{t('detail.summary.toBuy', { count: fit.missing })}</span>
              </span>
            </span>
            <span className={s.summaryItem}>
              <span className={s.summaryIcon} aria-hidden>
                <CookingPot size={18} strokeWidth={2} />
              </span>
              <span>
                <strong>{t('detail.summary.tools', { count: recipe.equipment.length })}</strong>
                <span className={s.summarySub}>{t('detail.summary.equipment')}</span>
              </span>
            </span>
          </div>
          {ingredients}
          {equipment}
        </div>
        {steps}
      </div>
    </article>
  );
}
