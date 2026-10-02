import { useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { BookmarkPlus, Check, ChevronDown, Clock, ExternalLink, Flame, Pencil, Play, ShoppingBag, Soup, Timer } from 'lucide-react';
import { useSession } from '../../../auth/session';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import { BackArrow, Button, ButtonLink, EmptyState, Stepper, cx } from '../../../components/ui';
import { RatingInput, Stars } from '../recipe/Rating';
import { EstTag, SourceBadge, WarningBadge } from '../recipe/badges';
import type { AnyRecipe, IngredientLine } from '../../../domain/types';
import { checkDiet } from '../../../domain/kitchen/diet';
import { detectDurations } from '../../../domain/kitchen/durations';
import { pantryFit } from '../../../domain/kitchen/fit';
import type { LineStatus } from '../../../domain/kitchen/fit';
import { formatNumber } from '../../../i18n';
import { totalMinutes } from '../../../domain/kitchen/search';
import type { ListHandoff } from '../../lists/useJustAdded';
import { addRecipeToList, saveToLibrary } from '../actions';
import { dietLabel, formatMinutes, servingUnitWord, servingsCaption } from '../labels';
import { useHint } from '../hints';
import { useKitchen } from '../KitchenContext';
import { RecipePhoto } from '../recipe/RecipePhoto';
import { recipePath } from '../recipe/recipeView';
import { scaledAmount, useServings } from '../recipe/servings';
import { equipmentIcon } from '../recipe/equipment';
import { StatusMarker } from '../recipe/StatusMarker';
import { StepText } from '../recipe/StepText';
import s from './RecipeDetail.module.css';

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
  const [statsOpen, setStatsOpen] = useState(false);
  const statsId = useId();
  const timersHint = useHint('timers');

  const inLibrary = recipe.inLibrary === true;
  const fit = pantryFit(recipe, kitchen.pantry);
  const diet = checkDiet(recipe, kitchen.profile);
  const factor = servings / recipe.servings;
  const site = recipe.source.kind === 'web' ? recipe.source.site : null;
  const total = totalMinutes(recipe);
  const timed = recipe.steps.filter((step, i) => detectDurations(step.text, i + 1).length > 0).length;

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

  // Tags get their own line, so a wrap never starts a line with a separator.
  const sourceLine = (
    <>
      <p className={s.sourceLine}>
        <SourceBadge kind={recipe.source.kind} className={s.sourceBadge} />
        {recipe.source.kind === 'web' && (
          <a href={recipe.source.url} target="_blank" rel="noreferrer" className={s.siteLink}>
            {site} <ExternalLink size={13} strokeWidth={2.2} aria-hidden />
            <span className="visually-hidden">{t('detail.newTab')}</span>
          </a>
        )}
      </p>
      {recipe.tags.length > 0 && (
        <p className={s.tags} dir="auto">
          {recipe.tags.join(' · ')}
        </p>
      )}
    </>
  );

  // The stars say the rating; their group keeps the "Your rating" name for screen readers.
  const ratingRow = (
    <div className={s.ratingRow}>
      <span role="group" aria-label={t('detail.rating.yours')} className={s.stars}>
        {inLibrary ? (
          <RatingInput value={recipe.userRating} onChange={rate} />
        ) : (
          <span className={s.readOnlyStars}>
            <Stars value={recipe.sourceRating ?? 0} size={22} />
          </span>
        )}
      </span>
      {!inLibrary && <span className={s.ratingNote}>{t('detail.rating.saveToRate')}</span>}
      {recipe.sourceRating !== undefined && site !== null && (
        <span className={s.ratingNote}>{t('detail.rating.onSite', { rating: rating(recipe.sourceRating), site })}</span>
      )}
    </div>
  );

  // Time, calories and what to buy on one line; how each was worked out behind the toggle.
  const kcal = recipe.kcalPerServing;
  const unit = recipe.servingUnit === undefined ? t('detail.stats.serving') : servingUnitWord(t, recipe.servingUnit);
  const stats = (
    <div className={s.stats}>
      <div className={s.statLine}>
        <p className={s.statItems}>
          <span className={s.statItem}>
            <Clock size={18} strokeWidth={2} aria-hidden />
            <span className="visually-hidden">{t('detail.stats.totalTime')}</span>{' '}
            <span dir="auto">{formatMinutes(t, total)}</span>
          </span>{' '}
          <span className={s.statItem}>
            <Flame size={18} strokeWidth={2} aria-hidden />
            <span className="visually-hidden">{t('detail.stats.calories')}</span>{' '}
            <span className="tabular" dir="auto">
              {kcal === undefined ? '—' : t('detail.stats.kcalValue', { kcal })}
            </span>
            {recipe.kcalEstimated && kcal !== undefined && <EstTag />}
          </span>{' '}
          <span className={cx(s.statItem, fit.missing > 0 ? s.statAccent : s.statSage)}>
            {fit.missing > 0 ? <ShoppingBag size={18} strokeWidth={2} aria-hidden /> : <Check size={18} strokeWidth={2.4} aria-hidden />}
            <span className="tabular">{fit.missing > 0 ? t('recipe.badge.toBuy', { count: fit.missing }) : t('recipe.badge.nothingToBuy')}</span>
          </span>
        </p>
        <button
          type="button"
          className={cx(s.statsToggle, statsOpen && s.statsToggleOpen)}
          aria-expanded={statsOpen}
          aria-controls={statsId}
          aria-label={t('detail.stats.more')}
          onClick={() => setStatsOpen(!statsOpen)}
        >
          <ChevronDown size={20} strokeWidth={2.2} aria-hidden />
        </button>
      </div>
      <ul id={statsId} className={s.statDetails} hidden={!statsOpen}>
        <li>
          <Clock size={15} strokeWidth={2} aria-hidden />
          {t('detail.stats.prepCook', { prep: recipe.prepMin, cook: recipe.cookMin })}
        </li>
        <li>
          <Flame size={15} strokeWidth={2} aria-hidden />
          {kcal === undefined
            ? t('detail.stats.notEnough')
            : t(recipe.kcalEstimated ? 'detail.stats.perEstimated' : 'detail.stats.per', { unit })}
        </li>
        <li>
          <ShoppingBag size={15} strokeWidth={2} aria-hidden />
          <span>
            <Trans
              i18nKey="recipe.match.haveCompact"
              values={{ have: fit.have + fit.staple, total: fit.total }}
              components={{ strong: <strong className="tabular" /> }}
            />
          </span>
        </li>
      </ul>
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
        <h2 id="ingredients-title" className={s.cardTitle}>
          {t('detail.ingredients')}
        </h2>
        <Stepper
          label={t('detail.servings')}
          fewerLabel={t('detail.fewerServings')}
          moreLabel={t('detail.moreServings')}
          caption={servingsCaption(t, recipe.servingUnit)}
          value={servings}
          min={1}
          max={12}
          onChange={setServings}
        />
      </header>
      <ul className={s.ingredients}>
        {recipe.ingredients.map((line) => (
          <IngredientRow key={line.id} line={line} status={fit.status[line.id] ?? 'missing'} amount={scaledAmount(line, factor)} />
        ))}
      </ul>
    </section>
  );

  const equipment =
    recipe.equipment.length > 0 ? (
      <section className={cx(s.card, s.equipmentCard)} aria-labelledby="equipment-title">
        <h2 id="equipment-title" className={s.cardTitle}>
          {t('detail.equipment')}
        </h2>
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
      {/* Steps are numbered and timers are chips, so the heading needs no count. */}
      <h2 id="steps-title" className={cx(s.sectionTitle, s.stepsTitle)}>
        {t('detail.steps')}
      </h2>
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
      {timed > 0 && timersHint && (
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
          {!diet.ok && <WarningBadge className={s.dietWarn}>{dietLabel(t, diet)}</WarningBadge>}
          {ratingRow}
          {stats}
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
          {!diet.ok && <WarningBadge className={s.dietWarn}>{dietLabel(t, diet)}</WarningBadge>}
          {ratingRow}
          {stats}
          {actions}
        </div>
      </div>

      <div className={s.below}>
        <div className={s.requires}>
          {ingredients}
          {equipment}
        </div>
        {steps}
      </div>
    </article>
  );
}
