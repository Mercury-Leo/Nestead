import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookmarkPlus,
  Check,
  Clock,
  CookingPot,
  ExternalLink,
  Info,
  Layers,
  Pencil,
  Play,
  Plus,
  ShoppingBag,
  Soup,
  Timer,
  Utensils,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSession } from '../../../auth/session';
import { useIsDesktop } from '../../../components/useMediaQuery';
import { Button, ButtonLink, EmptyState, RatingInput, SourceBadge, Stars, Stepper, WarningBadge, cx } from '../../../components/ui';
import type { AnyRecipe, IngredientLine } from '../../../domain/types';
import { checkDiet } from '../../../domain/kitchen/diet';
import { detectDurations } from '../../../domain/kitchen/durations';
import { pantryFit } from '../../../domain/kitchen/fit';
import type { LineStatus } from '../../../domain/kitchen/fit';
import { formatDuration } from '../../../domain/kitchen/quantity';
import { totalMinutes } from '../../../domain/kitchen/search';
import { addRecipeToList, saveToLibrary } from '../actions';
import { useKitchen } from '../KitchenContext';
import { RecipePhoto } from '../RecipePhoto';
import { recipePath } from '../recipeView';
import { scaledAmount, useServings } from '../servings';
import { StepText } from '../StepText';
import s from './RecipeDetail.module.css';

export function StatusMarker({ status }: { status: LineStatus }): JSX.Element {
  if (status === 'have') {
    return (
      <span className={cx(s.marker, s.markerHave)} aria-label="Have">
        <Check size={14} strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (status === 'staple') {
    return (
      <span className={cx(s.marker, s.markerStaple)} aria-label="Staple">
        <span className={s.stapleDot} />
      </span>
    );
  }
  return (
    <span className={cx(s.marker, s.markerMissing)} aria-label="To buy">
      <Plus size={14} strokeWidth={2.6} aria-hidden />
    </span>
  );
}

export function Legend({ have, staple, missing }: { have: number; staple: number; missing: number }): JSX.Element {
  return (
    <p className={s.legend}>
      <span>
        <StatusMarker status="have" /> Have · {have}
      </span>
      <span>
        <StatusMarker status="staple" /> Staple · {staple}
      </span>
      <span>
        <StatusMarker status="missing" /> To buy · {missing}
      </span>
    </p>
  );
}

export function IngredientRow({ line, status, amount }: { line: IngredientLine; status: LineStatus; amount: string }): JSX.Element {
  return (
    <li className={cx(s.ingredient, status === 'missing' && s.ingredientMissing)}>
      <StatusMarker status={status} />
      <span className={cx(s.qty, 'tabular')}>{amount}</span>
      <span className={s.item}>
        <span>{line.item}</span>
        {line.note !== undefined && <span className={s.note}>{line.note}</span>}
      </span>
      {status === 'staple' && <span className={s.stapleLabel}>Staple</span>}
      {status === 'missing' && <span className={s.toBuy}>To buy</span>}
    </li>
  );
}

export function equipmentIcon(name: string): LucideIcon {
  const lower = name.toLowerCase();
  if (/foil|lid|paper|wrap/.test(lower)) return Layers;
  if (/bowl/.test(lower)) return Soup;
  if (/skillet|pan|pot|oven|wok|dish|tin|tray/.test(lower)) return CookingPot;
  return Utensils;
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
  return (
    <EmptyState
      icon={Soup}
      title="Recipe not found"
      actions={
        <ButtonLink to="/library" variant="primary" size="lg">
          Back to the library
        </ButtonLink>
      }
    >
      <p>It may have been removed from the library.</p>
    </EmptyState>
  );
}

export function RecipeDetail(): JSX.Element {
  const { id = '' } = useParams();
  const kitchen = useKitchen();
  const recipe = kitchen.findRecipe(decodeURIComponent(id));

  if (recipe === undefined) {
    return kitchen.loaded ? <NotFound /> : <p className="centred">Loading…</p>;
  }
  return <Detail key={recipe.id} recipe={recipe} />;
}

function Detail({ recipe }: { recipe: AnyRecipe }): JSX.Element {
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
      await addRecipeToList(store, kitchen.listItems, recipe, servings, kitchen.pantry);
      navigate('/lists');
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

  const listLabel = fit.missing === 0 ? 'Nothing to buy' : desktop ? `Make shopping list · ${fit.missing}` : `List · ${fit.missing}`;

  const sourceLine = (
    <p className={s.sourceLine}>
      <SourceBadge kind={recipe.source.kind} className={s.sourceBadge} />
      {recipe.source.kind === 'web' && (
        <a href={recipe.source.url} target="_blank" rel="noreferrer" className={s.siteLink}>
          {site} <ExternalLink size={13} strokeWidth={2.2} aria-hidden />
          <span className="visually-hidden">(opens in a new tab)</span>
        </a>
      )}
      {recipe.tags.length > 0 && <span className={s.sourceTags}>· {recipe.tags.join(' · ')}</span>}
    </p>
  );

  const ratingRow = (
    <div className={s.ratingRow}>
      <div className={s.ratingTop}>
        <span className={s.eyebrow}>Your rating</span>
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
          <strong>{recipe.userRating} of 5</strong>
        ) : inLibrary ? (
          'Not rated yet'
        ) : (
          'Save it to rate it'
        )}
        {recipe.sourceRating !== undefined && site !== null && ` · ${recipe.sourceRating} on ${site}`}
      </p>
    </div>
  );

  const kcalCell = (
    <>
      <span className={s.statLabel}>{desktop ? 'Calories' : 'Per serving'}</span>
      <span className={s.statValue}>
        {recipe.kcalPerServing === undefined ? '—' : desktop ? `${recipe.kcalPerServing} kcal` : recipe.kcalPerServing}
      </span>
      <span className={s.statSub}>
        {recipe.kcalPerServing === undefined ? 'Not enough data' : desktop ? `per ${recipe.servingUnit ?? 'serving'}` : 'kcal'}
      </span>
      {recipe.kcalEstimated && recipe.kcalPerServing !== undefined && (
        <span className={s.estimated} title="Not provided by the source — estimated from ingredients" tabIndex={0}>
          <Info size={12} strokeWidth={2.4} aria-hidden /> Estimated
          <span className="visually-hidden">: not provided by the source — estimated from ingredients</span>
        </span>
      )}
    </>
  );

  const stats = (
    <div className={s.stats}>
      <div className={s.stat}>
        <span className={s.statLabel}>{desktop ? 'Total time' : 'Total'}</span>
        <span className={s.statValue}>{desktop || total < 60 ? formatDuration(total) : formatDuration(total).replace(' min', '')}</span>
        <span className={s.statSub}>
          {recipe.prepMin} prep · {recipe.cookMin} cook
        </span>
      </div>
      <div className={s.stat}>{kcalCell}</div>
      <div className={s.stat}>
        <span className={s.statLabel}>To buy</span>
        <span className={cx(s.statValue, fit.missing > 0 && s.statAccent)}>
          {desktop ? `${fit.missing} item${fit.missing === 1 ? '' : 's'}` : fit.missing}
        </span>
        <span className={s.statSub}>
          {desktop ? 'you have' : 'have'} {have} of {fit.total}
        </span>
      </div>
    </div>
  );

  const actions = (
    <div className={s.actions}>
      <ButtonLink to={recipePath(recipe, '/cook')} variant="primary" size={desktop ? 'xl' : 'bar'} icon={Play} block className={s.cookButton}>
        Start cooking
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
          Ingredients
        </h3>
        <Stepper label="Servings" caption={recipe.servingUnit !== undefined ? `${recipe.servingUnit}s` : 'servings'} value={servings} min={1} max={12} onChange={setServings} />
      </header>
      <Legend have={fit.have} staple={fit.staple} missing={fit.missing} />
      <ul className={s.ingredients}>
        {recipe.ingredients.map((line) => (
          <IngredientRow key={line.id} line={line} status={fit.status[line.id] ?? 'missing'} amount={scaledAmount(line, factor)} />
        ))}
      </ul>
      {fit.missing > 0 && desktop && (
        <Button variant="secondary" size="lg" block icon={ShoppingBag} disabled={busy} onClick={() => void makeList()}>
          Add {fit.missing} missing item{fit.missing === 1 ? '' : 's'} to shopping list
        </Button>
      )}
    </section>
  );

  const equipment =
    recipe.equipment.length > 0 ? (
      <section className={cx(s.card, s.equipmentCard)} aria-labelledby="equipment-title">
        <h3 id="equipment-title" className={s.cardTitle}>
          Equipment
        </h3>
        <ul className={s.equipment}>
          {recipe.equipment.map((name) => {
            const Icon = equipmentIcon(name);
            return (
              <li key={name}>
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
          Steps
        </h2>
        <span className={s.stepsMeta}>
          {recipe.steps.length} steps · {desktop ? `timers found in ${timed}` : `${timed} timers`}
        </span>
      </header>
      <ol className={s.stepList}>
        {recipe.steps.map((step, index) => (
          <li key={step.id} className={s.step}>
            <span className={s.stepNumber} aria-hidden>
              {index + 1}
            </span>
            <p className={s.stepText}>
              <StepText text={step.text} stepNumber={index + 1} renderChip={(duration) => <DurationChip phrase={duration.phrase} />} />
            </p>
          </li>
        ))}
      </ol>
      {timed > 0 && desktop && (
        <p className={s.footnote}>
          <Timer size={16} strokeWidth={2} aria-hidden /> Times in the steps become tap-to-start timers in Cook mode.
        </p>
      )}
    </section>
  );

  const topRight = inLibrary ? (
    <ButtonLink to={`/add?edit=${encodeURIComponent(recipe.id)}`} variant="ghost" icon={Pencil}>
      Edit
    </ButtonLink>
  ) : (
    <Button variant="secondary" icon={BookmarkPlus} disabled={busy} onClick={() => void save()}>
      Save to library
    </Button>
  );

  if (!desktop) {
    return (
      <article className={s.mobile}>
        <div className={s.hero}>
          <RecipePhoto recipe={recipe} eager />
          <button type="button" className={s.heroBack} aria-label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/library'))}>
            <ArrowLeft size={22} strokeWidth={2} aria-hidden />
          </button>
          <div className={s.heroAction}>{topRight}</div>
        </div>
        <div className={s.sheet}>
          {sourceLine}
          <h1 className={s.title}>{recipe.title}</h1>
          {recipe.description !== undefined && <p className={s.description}>{recipe.description}</p>}
          {!diet.ok && <WarningBadge className={s.dietWarn}>{diet.label}</WarningBadge>}
          {ratingRow}
          {stats}
          <h2 className={s.sectionTitle}>What it requires</h2>
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
          <ArrowLeft size={18} strokeWidth={2} aria-hidden /> Library
        </Link>
        {topRight}
      </div>

      <div className={s.top}>
        <div className={s.photo}>
          <RecipePhoto recipe={recipe} eager />
        </div>
        <div className={s.info}>
          {sourceLine}
          <h1 className={s.title}>{recipe.title}</h1>
          {recipe.description !== undefined && <p className={s.description}>{recipe.description}</p>}
          {!diet.ok && <WarningBadge className={s.dietWarn}>{diet.label}</WarningBadge>}
          {ratingRow}
          {stats}
          {actions}
        </div>
      </div>

      <div className={s.below}>
        <div className={s.requires}>
          <h2 className={s.sectionTitle}>What it requires</h2>
          <div className={s.summary}>
            <span className={s.summaryItem}>
              <span className={s.summaryIcon} aria-hidden>
                <Clock size={18} strokeWidth={2} />
              </span>
              <span>
                <strong>{formatDuration(total)}</strong>
                <span className={s.summarySub}>total time</span>
              </span>
            </span>
            <span className={s.summaryItem}>
              <span className={s.summaryIcon} aria-hidden>
                <ShoppingBag size={18} strokeWidth={2} />
              </span>
              <span>
                <strong>{fit.total} ingredients</strong>
                <span className={s.summarySub}>{fit.missing} to buy</span>
              </span>
            </span>
            <span className={s.summaryItem}>
              <span className={s.summaryIcon} aria-hidden>
                <CookingPot size={18} strokeWidth={2} />
              </span>
              <span>
                <strong>
                  {recipe.equipment.length} tool{recipe.equipment.length === 1 ? '' : 's'}
                </strong>
                <span className={s.summarySub}>equipment</span>
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
