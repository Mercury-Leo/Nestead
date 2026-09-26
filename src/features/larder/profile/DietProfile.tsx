import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../auth/session';
import { PageHeader } from '../../../components/PageHeader';
import { Button, RadioList, TextField, cx } from '../../../components/ui';
import { WarningBadge } from '../recipe/badges';
import type { DietProfile, PresetId } from '../../../domain/types';
import { checkDiet, parseCustomRule, PRESETS } from '../../../domain/kitchen/diet';
import type { Preset } from '../../../domain/kitchen/diet';
import { formatNumber } from '../../../i18n';
import { useKitchen } from '../KitchenContext';
import { presetName, presetRule } from '../labels';
import { RecipePhoto } from '../recipe/RecipePhoto';
import { recipePath } from '../recipe/recipeView';
import s from './DietProfile.module.css';

type Patch = Partial<Pick<DietProfile, 'presets' | 'custom' | 'conflictMode'>>;

/** A whole tile that is one switch: name, one-line rule, and the track. */
function Tile({ preset, on, onToggle }: { preset: Preset; on: boolean; onToggle: () => void }): JSX.Element {
  const { t } = useTranslation();
  return (
    <button type="button" role="switch" aria-checked={on} className={cx(s.tile, on && s.tileOn)} onClick={onToggle}>
      <span className={s.tileText}>
        <span className={s.tileName}>{presetName(t, preset.id)}</span>
        <span className={s.tileRule}>{presetRule(t, preset.id)}</span>
      </span>
      <span className={cx(s.track, on && s.trackOn)} aria-hidden>
        <span className={s.thumb} />
      </span>
    </button>
  );
}

export function DietProfilePage(): JSX.Element {
  const { t } = useTranslation();
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
      <PageHeader title={t('diet.title')} subtitle={t('diet.subtitle')} />

      <div className={s.layout}>
        <section className={s.card} aria-label={t('diet.rules')}>
          <h2 className={s.sectionTitle}>
            {t('diet.style')} <span className={s.sectionAside}>{t('diet.pickAny')}</span>
          </h2>
          {tiles('style')}

          <h2 className={s.sectionTitle}>
            {t('diet.allergies')} <span className={s.sectionAside}>{t('diet.allergiesOn', { count: allergiesOn })}</span>
          </h2>
          {tiles('allergy')}

          <h2 className={s.sectionTitle}>{t('diet.religious')}</h2>
          {tiles('religious')}

          <h2 className={s.sectionTitle}>
            {t('diet.own')} <span className={s.sectionAside}>{t('diet.ownAside')}</span>
          </h2>
          <form
            className={s.ruleForm}
            onSubmit={(event) => {
              event.preventDefault();
              addRule();
            }}
          >
            <TextField
              label={t('diet.addRule')}
              placeholder={t('diet.addRulePlaceholder')}
              dir="auto"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              wrapClassName={s.ruleInput}
            />
            <Button type="submit" variant="dark" size="lg" icon={Plus} disabled={draft.trim() === ''}>
              {t('common.add')}
            </Button>
          </form>
          {custom.length > 0 && (
            <ul className={s.rules}>
              {custom.map((rule) => (
                <li key={rule.id} className={s.rule}>
                  <span className={s.ruleText}>
                    <span className={s.ruleLabel} dir="auto">
                      {rule.label}
                    </span>
                    {/* i18n: the hint was written in English by parseCustomRule (domain/kitchen/diet.ts) and is stored with the rule. */}
                    <span className={s.ruleHint}>{rule.hint}</span>
                  </span>
                  <button
                    type="button"
                    className={s.ruleRemove}
                    aria-label={t('diet.removeRule', { label: rule.label })}
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
              {t('diet.conflictTitle')}
            </h2>
            <RadioList
              label={t('diet.conflictTitle')}
              value={conflictMode}
              onChange={(value) => save({ conflictMode: value })}
              options={[
                {
                  value: 'hide',
                  label: t('diet.hide'),
                  hint: t('diet.hideHint'),
                },
                {
                  value: 'warn',
                  label: t('diet.warn'),
                  hint: (
                    <>
                      {t('diet.warnHint')}
                      <span className={s.sample}>
                        <WarningBadge>{t('diet.sampleBadge')}</WarningBadge>
                      </span>
                    </>
                  ),
                },
              ]}
            />
          </section>

          <section className={s.card} aria-labelledby="saved-title">
            <h2 id="saved-title" className={cx(s.cardTitle, s.cardTitleRow)}>
              {t('diet.saved')} <span className={s.count}>{formatNumber(conflicts.length)}</span>
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
                        <span className={s.conflictTitle} dir="auto">
                          {recipe.title}
                        </span>
                        <WarningBadge>{diet.label}</WarningBadge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className={s.muted}>{t('diet.savedNote')}</p>
          </section>

          <p className={s.info}>
            <Info size={18} strokeWidth={2} aria-hidden />
            {t('diet.info')}
          </p>
        </aside>
      </div>
    </div>
  );
}
