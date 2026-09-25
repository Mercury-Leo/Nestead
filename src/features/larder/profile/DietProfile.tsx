import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, Plus, X } from 'lucide-react';
import { useSession } from '../../../auth/session';
import { PageHeader } from '../../../components/PageHeader';
import { Button, RadioList, TextField, cx } from '../../../components/ui';
import { WarningBadge } from '../recipe/badges';
import type { DietProfile, PresetId } from '../../../domain/types';
import { checkDiet, parseCustomRule, PRESETS } from '../../../domain/kitchen/diet';
import type { Preset } from '../../../domain/kitchen/diet';
import { useKitchen } from '../KitchenContext';
import { RecipePhoto } from '../recipe/RecipePhoto';
import { recipePath } from '../recipe/recipeView';
import s from './DietProfile.module.css';

type Patch = Partial<Pick<DietProfile, 'presets' | 'custom' | 'conflictMode'>>;

/** A whole tile that is one switch: name, one-line rule, and the track. */
function Tile({ preset, on, onToggle }: { preset: Preset; on: boolean; onToggle: () => void }): JSX.Element {
  return (
    <button type="button" role="switch" aria-checked={on} className={cx(s.tile, on && s.tileOn)} onClick={onToggle}>
      <span className={s.tileText}>
        <span className={s.tileName}>{preset.name}</span>
        <span className={s.tileRule}>{preset.rule}</span>
      </span>
      <span className={cx(s.track, on && s.trackOn)} aria-hidden>
        <span className={s.thumb} />
      </span>
    </button>
  );
}

export function DietProfilePage(): JSX.Element {
  const { store } = useSession();
  const kitchen = useKitchen();
  const profile = kitchen.profile;
  const [draft, setDraft] = useState('');

  const presets = profile?.presets ?? {};
  const custom = profile?.custom ?? [];
  const conflictMode = profile?.conflictMode ?? 'hide';

  // Changes apply as they are made: there is no save button.
  const save = (patch: Patch): void => {
    if (profile === null) {
      void store.dietProfiles.create({ presets, custom, conflictMode, ...patch });
    } else {
      void store.dietProfiles.update(profile.id, patch);
    }
  };

  const toggle = (id: PresetId): void => save({ presets: { ...presets, [id]: presets[id] !== true } });

  const addRule = (): void => {
    const rule = parseCustomRule(draft);
    if (rule === null) return;
    setDraft('');
    save({ custom: [...custom, rule] });
  };

  const group = (name: Preset['group']): Preset[] => PRESETS.filter((preset) => preset.group === name);
  const allergiesOn = group('allergy').filter((preset) => presets[preset.id] === true).length;

  const conflicts = kitchen.recipes
    .map((recipe) => ({ recipe, diet: checkDiet(recipe, profile) }))
    .filter(({ diet }) => !diet.ok);

  const tiles = (name: Preset['group']): JSX.Element => (
    <div className={s.tiles}>
      {group(name).map((preset) => (
        <Tile key={preset.id} preset={preset} on={presets[preset.id] === true} onToggle={() => toggle(preset.id)} />
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader title="Diet profile" subtitle="Larder checks every recipe against these rules before showing it to you." />

      <div className={s.layout}>
        <section className={s.card} aria-label="Rules">
          <h2 className={s.sectionTitle}>
            Eating style <span className={s.sectionAside}>Pick any that apply</span>
          </h2>
          {tiles('style')}

          <h2 className={s.sectionTitle}>
            Allergies &amp; intolerances <span className={s.sectionAside}>{allergiesOn} on</span>
          </h2>
          {tiles('allergy')}

          <h2 className={s.sectionTitle}>Religious &amp; cultural</h2>
          {tiles('religious')}

          <h2 className={s.sectionTitle}>
            Your own rules <span className={s.sectionAside}>Anything else to avoid</span>
          </h2>
          <form
            className={s.ruleForm}
            onSubmit={(event) => {
              event.preventDefault();
              addRule();
            }}
          >
            <TextField
              label="Add an ingredient or allergy"
              placeholder="Add an ingredient or allergy — e.g. “no mushrooms”"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              wrapClassName={s.ruleInput}
            />
            <Button type="submit" variant="dark" size="lg" icon={Plus} disabled={draft.trim() === ''}>
              Add
            </Button>
          </form>
          {custom.length > 0 && (
            <ul className={s.rules}>
              {custom.map((rule) => (
                <li key={rule.id} className={s.rule}>
                  <span className={s.ruleText}>
                    <span className={s.ruleLabel}>{rule.label}</span>
                    <span className={s.ruleHint}>{rule.hint}</span>
                  </span>
                  <button
                    type="button"
                    className={s.ruleRemove}
                    aria-label={`Remove rule ${rule.label}`}
                    onClick={() => save({ custom: custom.filter((r) => r.id !== rule.id) })}
                  >
                    <X size={18} strokeWidth={2} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className={s.side}>
          <section className={s.card} aria-labelledby="conflict-title">
            <h2 id="conflict-title" className={s.cardTitle}>
              When a recipe conflicts
            </h2>
            <RadioList
              label="When a recipe conflicts"
              value={conflictMode}
              onChange={(value) => save({ conflictMode: value })}
              options={[
                {
                  value: 'hide',
                  label: 'Hide it',
                  hint: 'It won’t appear in search or pantry suggestions. You can still reveal hidden results from a search.',
                },
                {
                  value: 'warn',
                  label: 'Show it with a warning',
                  hint: (
                    <>
                      It appears in results with a badge like this:
                      <span className={s.sample}>
                        <WarningBadge>Contains peanuts, sesame</WarningBadge>
                      </span>
                    </>
                  ),
                },
              ]}
            />
          </section>

          <section className={s.card} aria-labelledby="saved-title">
            <h2 id="saved-title" className={cx(s.cardTitle, s.cardTitleRow)}>
              Saved recipes that conflict <span className={s.count}>{conflicts.length}</span>
            </h2>
            {conflicts.length > 0 && (
              <ul className={s.conflicts}>
                {conflicts.map(({ recipe, diet }) => (
                  <li key={recipe.id}>
                    <Link to={recipePath(recipe)} className={s.conflict}>
                      <span className={s.recipeThumb}>
                        <RecipePhoto recipe={recipe} />
                      </span>
                      <span className={s.conflictText}>
                        <span className={s.conflictTitle}>{recipe.title}</span>
                        <WarningBadge>{diet.label}</WarningBadge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className={s.muted}>Recipes you’ve saved stay in your library and carry a warning, so nothing disappears on you.</p>
          </section>

          <p className={s.info}>
            <Info size={18} strokeWidth={2} aria-hidden />
            Rules apply everywhere: your library, search, pantry matches and recipes you import from the web. Everyone in the family shares them.
          </p>
        </aside>
      </div>
    </div>
  );
}
