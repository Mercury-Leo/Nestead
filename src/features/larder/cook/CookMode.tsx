import { useEffect, useRef, useState } from 'react';
import type { TouchEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Check, Hand, List, X } from 'lucide-react';
import { useDirection } from '../../../hooks/useDirection';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import { BackArrow, ForwardArrow, cx } from '../../../components/ui';
import type { AnyRecipe } from '../../../domain/types';
import type { DetectedDuration } from '../../../domain/kitchen/durations';
import { useKitchen } from '../KitchenContext';
import { recipePath } from '../recipe/recipeView';
import { scaledAmount, servingsFor } from '../recipe/servings';
import { chipKey, StepText } from '../recipe/StepText';
import { clearFinished, findTimer, pause, resume, start, useNow, useTimers } from '../timers/store';
import { useWakeLock } from '../../../hooks/useWakeLock';
import { formatNumber } from '../../../i18n';
import s from './CookMode.module.css';
import { stepIngredients, stepTitle } from './steps';
import { TimerChip, TrayCard } from './TimerChips';

export default function CookMode(): JSX.Element {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const kitchen = useKitchen();
  const recipe = kitchen.findRecipe(decodeURIComponent(id));
  if (recipe === undefined) {
    return (
      <div className={s.root}>
        <p className={s.missing}>
          {kitchen.loaded ? t('cook.missing') : t('common.loading')} <Link to="/library">{t('common.backToLibrary')}</Link>
        </p>
      </div>
    );
  }
  return <Cook recipe={recipe} />;
}

function Cook({ recipe }: { recipe: AnyRecipe }): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const last = recipe.steps.length - 1;
  const [index, setIndex] = useState(() => Math.min(last, Math.max(0, Number(params.get('step') ?? '1') - 1 || 0)));
  const [drawer, setDrawer] = useState(desktop);
  const [allIngredients, setAllIngredients] = useState(false);
  const timers = useTimers();
  const now = useNow();
  const swipe = useRef<{ x: number; y: number } | null>(null);
  // Forward is to the right in LTR and to the left in RTL, for keys and swipes.
  const forward = useDirection() === 'rtl' ? -1 : 1;
  useWakeLock();

  const factor = servingsFor(recipe) / recipe.servings;
  const step = recipe.steps[index];
  const next = recipe.steps[index + 1];
  const detail = recipePath(recipe);

  const go = (to: number): void => {
    const clamped = Math.max(0, Math.min(last, to));
    setIndex(clamped);
    setAllIngredients(false);
    setParams({ step: String(clamped + 1) }, { replace: true });
  };

  const finish = (): void => {
    clearFinished(recipe.id);
    navigate(detail);
  };

  // Keys only while cook mode is on screen: the listener goes with it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target !== null && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key === 'ArrowRight') go(index + forward);
      else if (event.key === 'ArrowLeft') go(index - forward);
      else if (event.key === 'Escape') {
        // Esc closes the phone's ingredient sheet first, then leaves.
        if (drawer && !desktop) setDrawer(false);
        else navigate(detail);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onTouchStart = (event: TouchEvent): void => {
    const touch = event.touches[0];
    if (touch !== undefined) swipe.current = { x: touch.clientX, y: touch.clientY };
  };
  const onTouchEnd = (event: TouchEvent): void => {
    const origin = swipe.current;
    const touch = event.changedTouches[0];
    swipe.current = null;
    if (origin === null || touch === undefined) return;
    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;
    if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx * forward < 0 ? index + 1 : index - 1);
  };

  const pressChip = (duration: DetectedDuration): void => {
    const key = chipKey(index, duration);
    const timer = findTimer(recipe.id, key);
    if (timer === undefined || timer.state === 'done') {
      start({
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        stepIndex: index,
        chipKey: key,
        label: duration.label,
        phrase: duration.phrase,
        durationSec: duration.seconds,
      });
    } else if (timer.state === 'running') pause(timer.id);
    else resume(timer.id);
  };

  const tray = timers
    .filter((timer) => !(timer.state === 'done' && timer.acknowledged))
    .sort((a, b) => (a.state === 'done' ? 0 : 1) - (b.state === 'done' ? 0 : 1));

  const ingredients = allIngredients ? recipe.ingredients : stepIngredients(recipe, step);
  const ingredientList = (
    <>
      <ul className={s.ingredients}>
        {ingredients.map((line) => (
          <li key={line.id}>
            <span className={cx(s.ingredientQty, 'tabular')} dir="auto">{scaledAmount(line, factor)}</span>
            <span dir="auto">
              {line.item}
              {line.note !== undefined && <span className={s.ingredientNote}>, {line.note}</span>}
            </span>
          </li>
        ))}
        {ingredients.length === 0 && <li className={s.none}>{t('cook.nothingToMeasure')}</li>}
      </ul>
      <button type="button" className={s.allLink} onClick={() => setAllIngredients(!allIngredients)}>
        {allIngredients ? t('cook.justStep', { step: index + 1 }) : t('cook.allIngredients', { count: recipe.ingredients.length })} <ForwardArrow size={16} strokeWidth={2.2} aria-hidden />
      </button>
    </>
  );

  const title = stepTitle(step, index);
  const nextTitle = stepTitle(next, index + 1);

  return (
    <div className={cx(s.root, drawer && desktop && s.withDrawer)}>
      <div className={s.main} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <header className={s.header}>
          {desktop ? (
            <Link to={detail} className={s.exit}>
              <X size={20} strokeWidth={2.2} aria-hidden /> {t('cook.exit')}
            </Link>
          ) : (
            <Link to={detail} className={s.squareButton} aria-label={t('cook.exitLabel')}>
              <X size={24} strokeWidth={2.2} aria-hidden />
            </Link>
          )}
          <div className={s.headerCentre}>
            {desktop ? (
              <>
                <span className={s.eyebrow}>{t('cook.eyebrow')}</span>
                <span className={s.recipeTitle} dir="auto">
                  {recipe.title}
                </span>
              </>
            ) : (
              <>
                <span className={s.stepOf}>
                  <Trans i18nKey="cook.stepOf" values={{ step: index + 1, total: recipe.steps.length }} components={{ of: <span className={s.of} /> }} />
                </span>
                {title !== undefined && (
                  <span className={s.stepName} dir="auto">
                    {title}
                  </span>
                )}
              </>
            )}
          </div>
          {desktop ? (
            <button type="button" className={cx(s.ingredientsToggle, drawer && s.toggleOn)} aria-expanded={drawer} onClick={() => setDrawer(!drawer)}>
              <List size={20} strokeWidth={2.2} aria-hidden /> {t('cook.ingredients')}
            </button>
          ) : (
            <button type="button" className={s.squareButton} aria-label={t('cook.ingredientsForStep', { count: stepIngredients(recipe, step).length })} onClick={() => setDrawer(true)}>
              <List size={22} strokeWidth={2.2} aria-hidden /> <span className="tabular">{formatNumber(stepIngredients(recipe, step).length)}</span>
            </button>
          )}
        </header>

        <ol className={s.progress} aria-label={t('cook.progress', { step: index + 1, total: recipe.steps.length })}>
          {recipe.steps.map((item, i) => (
            <li key={item.id} className={cx(s.segment, i < index && s.segmentDone, i === index && s.segmentNow)} />
          ))}
        </ol>

        <section className={s.stepArea} aria-live="polite">
          {desktop && (
            <p className={s.stepLine}>
              <span className={s.stepOf}>
                <Trans i18nKey="cook.stepOf" values={{ step: index + 1, total: recipe.steps.length }} components={{ of: <span className={s.of} /> }} />
              </span>
              {title !== undefined && (
                <span className={s.stepName} dir="auto">
                  {' '}
                  · {title}
                </span>
              )}
            </p>
          )}
          {step !== undefined && (
            <p className={s.stepText} dir="auto">
              <StepText
                text={step.text}
                stepNumber={index + 1}
                renderChip={(duration) => (
                  <TimerChip duration={duration} timer={findTimer(recipe.id, chipKey(index, duration))} now={now} onPress={() => pressChip(duration)} />
                )}
              />
            </p>
          )}
        </section>

        <section className={s.tray} aria-label={t('cook.timers')}>
          {desktop && (
            <p className={s.trayLabel}>
              <Trans i18nKey="cook.trayLabel" components={{ eyebrow: <span className={s.eyebrow} /> }} />
            </p>
          )}
          <div className={s.trayCards}>
            {tray.length === 0 ? (
              <p className={s.trayEmpty}>{t('cook.trayEmpty')}</p>
            ) : (
              tray.map((timer) => <TrayCard key={timer.id} timer={timer} now={now} desktop={desktop} />)
            )}
          </div>
        </section>

        <nav className={s.nav} aria-label={t('cook.steps')}>
          <button type="button" className={s.back} disabled={index === 0} onClick={() => go(index - 1)}>
            <BackArrow size={22} strokeWidth={2.2} aria-hidden /> {t('cook.back')}
          </button>
          {desktop && (
            <p className={s.keysHint}>
              <Trans i18nKey="cook.keysHint" />
            </p>
          )}
          {index < last ? (
            <button type="button" className={s.next} onClick={() => go(index + 1)}>
              <span className={s.nextText}>
                <span className={s.nextLabel}>{t('cook.next')}</span>
                {nextTitle !== undefined && (
                  <span className={s.nextSub} dir="auto">
                    {nextTitle}
                  </span>
                )}
              </span>
              <ForwardArrow size={26} strokeWidth={2.2} aria-hidden />
            </button>
          ) : (
            <button type="button" className={cx(s.next, s.finish)} onClick={finish}>
              <span className={s.nextLabel}>{t('cook.finish')}</span>
              <Check size={26} strokeWidth={2.4} aria-hidden />
            </button>
          )}
        </nav>
        {!desktop && (
          <p className={s.swipeHint}>
            <Hand size={18} strokeWidth={2} aria-hidden /> {t('cook.swipeHint')}
          </p>
        )}
      </div>

      {drawer && desktop && (
        <aside className={s.drawer} aria-label={t('cook.ingredients')}>
          <header className={s.drawerHead}>
            <div>
              <span className={s.eyebrow}>{allIngredients ? t('cook.allSteps') : t('cook.forStep', { step: index + 1 })}</span>
              <h2 className={s.drawerTitle}>{t('cook.ingredients')}</h2>
            </div>
            <button type="button" className={s.round} aria-label={t('cook.closeIngredients')} onClick={() => setDrawer(false)}>
              <X size={22} strokeWidth={2.2} />
            </button>
          </header>
          {ingredientList}
        </aside>
      )}

      {drawer && !desktop && (
        <div className={s.sheetLayer} onClick={() => setDrawer(false)}>
          <div className={s.sheet} role="dialog" aria-modal="true" aria-label={t('cook.ingredients')} onClick={(event) => event.stopPropagation()}>
            <span className={s.sheetHandle} aria-hidden />
            <header className={s.drawerHead}>
              <div>
                <span className={s.eyebrow}>{allIngredients ? t('cook.allSteps') : t('cook.forStep', { step: index + 1 })}</span>
                <h2 className={s.drawerTitle}>{t('cook.ingredients')}</h2>
              </div>
              <button type="button" className={s.round} aria-label={t('cook.closeIngredients')} onClick={() => setDrawer(false)}>
                <X size={22} strokeWidth={2.2} />
              </button>
            </header>
            {ingredientList}
          </div>
        </div>
      )}
    </div>
  );
}
