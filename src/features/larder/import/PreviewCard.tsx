import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Check, Clock, Flame, Globe, Leaf, Pencil, Plus, Timer } from 'lucide-react';
import { useSession } from '../../../auth/session';
import { Button, Chip, SelectButton, cx } from '../../../components/ui';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import { EstTag, SourceBadge } from '../recipe/badges';
import { MatchBlock } from '../recipe/MatchBlock';
import { Stars } from '../recipe/Rating';
import type { AnyRecipe, Unit } from '../../../domain/types';
import { checkDiet, fitsProfileLine } from '../../../domain/kitchen/diet';
import { detectDurations } from '../../../domain/kitchen/durations';
import { pantryFit } from '../../../domain/kitchen/fit';
import { formatAmount, formatDuration } from '../../../domain/kitchen/quantity';
import { totalMinutes } from '../../../domain/kitchen/search';
import { saveToLibrary } from '../actions';
import type { ImportHandoff } from '../add/AddRecipe';
import { UNITS } from '../add/draft';
import { equipmentIcon } from '../recipe/equipment';
import { StatusMarker } from '../recipe/StatusMarker';
import { useKitchen } from '../KitchenContext';
import { RecipePhoto } from '../recipe/RecipePhoto';
import { recipeView } from '../recipe/recipeView';
import { applyFixes, suggestedTags, whatWeRead } from './imported';
import type { Fix } from './imported';
import s from './ImportRecipe.module.css';

/** The imported recipe, checked against the pantry and diet, with fixes to apply before saving. */

export interface Preview {
  recipe: AnyRecipe;
  stated: { photo: boolean; servings: boolean; times: boolean };
}

export function PreviewCard({ preview, onSaved }: { preview: Preview; onSaved: (id: string) => void }): JSX.Element {
  const { store, me } = useSession();
  const kitchen = useKitchen();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const suggestions = useMemo(() => suggestedTags(preview.recipe), [preview.recipe]);
  const [tags, setTags] = useState<string[]>(() => suggestions.filter((t) => t.preselected).map((t) => t.tag));
  const [fixes, setFixes] = useState<Record<string, Fix>>({});
  const [saving, setSaving] = useState(false);

  const recipe = applyFixes(preview.recipe, fixes, tags);
  const view = recipeView(recipe, kitchen.pantry, kitchen.profile);
  const fit = pantryFit(recipe, kitchen.pantry);
  const diet = checkDiet(recipe, kitchen.profile);
  const site = recipe.source.kind === 'web' ? recipe.source.site : '';
  const flagged = preview.recipe.ingredients.filter((line) => line.needsFix === true);
  const timers = recipe.steps.reduce((n, step, i) => n + detectDurations(step.text, i + 1).length, 0);
  // Read from the fixed recipe, so a quantity typed in stops being a warning.
  const read = whatWeRead(recipe, preview.stated);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const saved = await saveToLibrary(store, recipe, me.id);
      onSaved(saved.id);
    } finally {
      setSaving(false);
    }
  };
  const edit = (): void => {
    const handoff: ImportHandoff = { draft: recipe };
    navigate('/add', { state: handoff });
  };

  const setFix = (id: string, patch: Partial<Fix>): void => {
    const current = fixes[id] ?? { qty: '', unit: null };
    setFixes({ ...fixes, [id]: { ...current, ...patch } });
  };

  const actions = (
    <>
      <Button variant="secondary" size="lg" icon={Pencil} onClick={edit}>
        Edit before saving
      </Button>
      <Button variant="primary" size="lg" icon={Check} disabled={saving} onClick={() => void save()}>
        Save to library
      </Button>
    </>
  );

  return (
    <section className={s.preview} aria-labelledby="preview-title">
      <header className={s.previewHead}>
        <span className={s.eyebrow}>Preview</span>
        <span className={s.muted}>Check the details, then save</span>
      </header>

      <div className={s.previewGrid}>
        <div className={s.previewLeft}>
          <div className={s.photo}>
            <RecipePhoto recipe={recipe} />
            <SourceBadge kind="web" className={s.photoBadge} />
          </div>
          <div>
            <p className={s.site}>{site}</p>
            <h2 id="preview-title" className={s.title}>
              {recipe.title}
            </h2>
            <div className={s.meta}>
              {view.rating !== undefined && (
                <span>
                  <Stars value={view.rating} /> <span className="tabular">{view.rating.toFixed(1)}</span>
                </span>
              )}
              {view.kcal !== null && (
                <span>
                  <Flame size={15} strokeWidth={2} aria-hidden /> {view.kcal} {recipe.kcalEstimated && <EstTag />}
                </span>
              )}
              <span>
                <Clock size={15} strokeWidth={2} aria-hidden /> {formatDuration(totalMinutes(recipe))}
              </span>
            </div>
          </div>
          <div className={s.divider} />
          <MatchBlock have={fit.have + fit.staple} total={fit.total} missing={fit.missing} need={view.need} />

          {diet.ok ? (
            <div className={s.dietOk}>
              <Leaf size={20} strokeWidth={2} aria-hidden />
              <span>
                <strong>Fits your diet profile</strong>
                <span className={s.dietSub}>{fitsProfileLine(kitchen.profile)}</span>
              </span>
            </div>
          ) : (
            <div className={s.dietBad}>
              <AlertTriangle size={20} strokeWidth={2} aria-hidden />
              <span>
                <strong>Conflicts with your diet profile</strong>
                <span className={s.dietSub}>{diet.label}</span>
              </span>
            </div>
          )}

          <div className={s.read}>
            <p className={s.eyebrow}>What we read</p>
            <ul>
              {read.map((line) => (
                <li key={line.text} className={cx(!line.ok && s.readWarn)}>
                  {line.ok ? <Check size={16} strokeWidth={2.4} aria-hidden /> : <AlertTriangle size={16} strokeWidth={2.2} aria-hidden />}
                  {line.text}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={s.previewRight}>
          <div className={s.sectionHead}>
            <h3 className={s.sectionTitle}>Ingredients · {recipe.ingredients.length}</h3>
            <span className={s.legend}>
              <StatusMarker status="have" /> Have <StatusMarker status="staple" /> Staple <StatusMarker status="missing" /> To buy
            </span>
          </div>
          <ul className={s.lines}>
            {recipe.ingredients
              .filter((line) => !flagged.some((f) => f.id === line.id))
              .map((line) => {
                const status = fit.status[line.id] ?? 'missing';
                return (
                  <li key={line.id} className={s.line}>
                    <StatusMarker status={status} />
                    <span className={cx(s.lineQty, 'tabular')}>{formatAmount(line.qty, line.unit, line.qtyMax)}</span>
                    <span className={s.lineItem}>
                      {line.item}
                      {line.note !== undefined && `, ${line.note}`}
                    </span>
                    {status === 'staple' && <span className={s.stapleLabel}>Staple</span>}
                    {status === 'missing' && <span className={s.toBuy}>To buy</span>}
                  </li>
                );
              })}
          </ul>
          {flagged.map((line) => {
            const fix = fixes[line.id] ?? { qty: '', unit: null };
            return (
              <div key={line.id} className={s.flag}>
                <p className={s.flagTitle}>
                  <AlertTriangle size={17} strokeWidth={2.2} aria-hidden /> Couldn’t read a quantity for “{line.raw ?? line.item}”
                </p>
                <div className={s.flagFields}>
                  <input
                    className={s.flagQty}
                    aria-label={`Quantity for ${line.item}`}
                    placeholder="Qty"
                    inputMode="decimal"
                    value={fix.qty}
                    onChange={(event) => setFix(line.id, { qty: event.target.value })}
                  />
                  <SelectButton<string>
                    label={`Unit for ${line.item}`}
                    shape="field"
                    className={s.flagUnit}
                    value={fix.unit ?? ''}
                    display={fix.unit ?? 'Unit'}
                    onChange={(value) => setFix(line.id, { unit: value === '' ? null : (value as Unit) })}
                    options={[{ value: '', label: '—' }, ...UNITS.map((unit) => ({ value: unit, label: unit }))]}
                  />
                  <span className={s.flagItem}>{line.item}</span>
                </div>
              </div>
            );
          })}

          {recipe.equipment.length > 0 && (
            <>
              <h3 className={s.sectionTitle}>Equipment · {recipe.equipment.length}</h3>
              <div className={s.tools}>
                {recipe.equipment.map((name) => {
                  const Icon = equipmentIcon(name);
                  return (
                    <span key={name} className={s.tool}>
                      <Icon size={16} strokeWidth={2} aria-hidden /> {name}
                    </span>
                  );
                })}
              </div>
            </>
          )}

          <div className={s.sectionHead}>
            <h3 className={s.sectionTitle}>Steps · {recipe.steps.length}</h3>
            <span className={s.muted}>
              {timers} timer{timers === 1 ? '' : 's'} found
            </span>
          </div>
          <ol className={s.steps}>
            {recipe.steps.map((step, index) => {
              const durations = detectDurations(step.text, index + 1);
              return (
                <li key={step.id}>
                  <span className={s.stepNumber}>{index + 1}</span>
                  <span>
                    {step.text}{' '}
                    {durations.map((d) => (
                      <span key={d.start} className={s.timerChip}>
                        <Timer size={13} strokeWidth={2.2} aria-hidden /> {formatDuration(d.seconds / 60)}
                      </span>
                    ))}
                  </span>
                </li>
              );
            })}
          </ol>

          {suggestions.length > 0 && (
            <>
              <h3 className={s.sectionTitle}>Suggested tags</h3>
              <div className={s.tags}>
                {suggestions.map(({ tag }) => {
                  const on = tags.includes(tag);
                  return (
                    <Chip key={tag} selected={on} icon={on ? Check : Plus} onClick={() => setTags(on ? tags.filter((t) => t !== tag) : [...tags, tag])}>
                      {tag}
                    </Chip>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <footer className={s.previewFoot}>
        <p className={s.savedAs}>
          <Globe size={16} strokeWidth={2} aria-hidden /> Saved as <strong>Web · {site}</strong> — the original link stays attached
        </p>
        {desktop && <div className={s.footActions}>{actions}</div>}
      </footer>
      {!desktop && <div className={s.stickyBar}>{actions}</div>}
    </section>
  );
}
