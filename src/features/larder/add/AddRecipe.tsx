import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Check, ImagePlus, List, Plus, Timer, Trash2, User, X } from 'lucide-react';
import { useSession } from '../../../auth/session';
import { PageHeader } from '../../../components/PageHeader';
import { BackArrow, Button, IconButton, RemovableChip, Segmented, SelectButton, Stepper, TextField, cx } from '../../../components/ui';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import type { AnyRecipe, NewRow, Recipe, Unit } from '../../../domain/types';
import { CATALOG } from '../../../domain/kitchen/catalog';
import { detectDurations } from '../../../domain/kitchen/durations';
import { parseIngredientBlock } from '../../../domain/kitchen/parse';
import { formatDuration } from '../../../domain/kitchen/quantity';
import { formatList } from '../../../i18n';
import { removeRecipeFromList } from '../actions';
import { useKitchen } from '../KitchenContext';
import { equipmentIcon } from '../recipe/equipment';
import { recipePath } from '../recipe/recipeView';
import { emptyDraft, emptyIngredient, emptyStep, fromRecipe, rowFromLine, toRecipe, UNITS, validate } from './draft';
import type { Draft, DraftErrors, IngredientRow, StepRow } from './draft';
import { PHOTO_TYPES, resizePhoto } from './photo';
import s from './AddRecipe.module.css';
import { Card, ErrorText } from './FormCard';
import { Handle, move, useDragList } from './reorder';

/** State handed over by the import screen's "Edit before saving". */
export interface ImportHandoff {
  draft: AnyRecipe;
}

export default function AddRecipe(): JSX.Element {
  const [params] = useSearchParams();
  const kitchen = useKitchen();
  const location = useLocation();
  const editId = params.get('edit');
  const editing = editId === null ? undefined : kitchen.recipes.find((recipe) => recipe.id === editId);
  const handoff = (location.state as ImportHandoff | null)?.draft;

  if (editId !== null && editing === undefined) {
    return (
      <p className="centred">
        <Trans i18nKey="add.missing" components={{ link: <Link to="/library" /> }} />
      </p>
    );
  }
  return <RecipeForm key={editId ?? 'new'} editing={editing} start={handoff} />;
}

function RecipeForm({ editing, start }: { editing: Recipe | undefined; start: AnyRecipe | undefined }): JSX.Element {
  const { t } = useTranslation();
  const { store, me } = useSession();
  const kitchen = useKitchen();
  const desktop = useIsDesktop();
  const navigate = useNavigate();
  const listId = useId();

  const [draft, setDraft] = useState<Draft>(() => {
    if (editing !== undefined) return fromRecipe(editing);
    if (start !== undefined) return fromRecipe(start);
    return emptyDraft();
  });
  const [errors, setErrors] = useState<DraftErrors>({});
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [existingPhoto, setExistingPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [tag, setTag] = useState('');
  const [tool, setTool] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<Draft>): void => setDraft((current) => ({ ...current, ...patch }));

  useEffect(() => {
    let active = true;
    if (draft.photoId !== undefined) {
      void store.photos.url(draft.photoId).then((url) => {
        if (active) setExistingPhoto(url);
      });
    } else {
      setExistingPhoto(draft.photoUrl ?? null);
    }
    return () => {
      active = false;
    };
  }, [store, draft.photoId, draft.photoUrl]);

  useEffect(() => () => {
    if (photo !== null) URL.revokeObjectURL(photo.url);
  }, [photo]);

  /* ------------------------------------------------------------ photo -- */

  const takePhoto = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return;
    setPhotoError(null);
    try {
      const blob = await resizePhoto(file);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : t('add.photo.unusable'));
    }
  };

  const removePhoto = (): void => {
    setPhoto(null);
    set({ photoId: undefined, photoUrl: undefined });
  };

  const preview = photo?.url ?? existingPhoto;

  /* ------------------------------------------------------ ingredients -- */

  const setRows = (rows: IngredientRow[]): void => {
    // There is always one empty row at the end to type into.
    const last = rows[rows.length - 1];
    set({ ingredients: last === undefined || last.item !== '' || last.qty !== '' ? [...rows, emptyIngredient()] : rows });
  };
  const setRow = (index: number, patch: Partial<IngredientRow>): void =>
    setRows(draft.ingredients.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const dragRow = useDragList(draft.ingredients, setRows);
  const filled = draft.ingredients.filter((row) => row.item.trim() !== '').length;

  const addPasted = (): void => {
    const lines = parseIngredientBlock(pasted);
    const kept = draft.ingredients.filter((row) => row.item.trim() !== '' || row.qty.trim() !== '');
    setRows([...kept, ...lines.map(rowFromLine)]);
    setPasted('');
    setPasting(false);
  };

  /* ------------------------------------------------------------ steps -- */

  const setSteps = (steps: StepRow[]): void => {
    const last = steps[steps.length - 1];
    set({ steps: last === undefined || last.text !== '' ? [...steps, emptyStep()] : steps });
  };
  const dragStep = useDragList(draft.steps, setSteps);

  /* ------------------------------------------------------------- save -- */

  const save = async (): Promise<void> => {
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      let photoId = draft.photoId;
      if (photo !== null) photoId = await store.photos.put(photo.blob);
      const content = toRecipe({ ...draft, photoId });
      // A replaced or removed photo is deleted once the recipe no longer needs it.
      const oldPhoto = editing?.photoId;
      let saved: Recipe;
      if (editing !== undefined) {
        const patch: Partial<NewRow<Recipe>> = { ...content };
        // Clearing optional fields needs them present as undefined.
        for (const key of ['description', 'photoId', 'photoUrl', 'servingUnit', 'kcalPerServing'] as const) {
          if (!(key in patch)) patch[key] = undefined;
        }
        saved = await store.recipes.update(editing.id, patch);
      } else {
        saved = await store.recipes.create({ ...content, createdBy: me.id });
      }
      if (oldPhoto !== undefined && oldPhoto !== photoId) await store.photos.remove(oldPhoto).catch(() => undefined);
      navigate(recipePath(saved), { replace: true });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (editing === undefined) return;
    setSaving(true);
    try {
      await removeRecipeFromList(store, kitchen.listItems, editing.id);
      await store.recipes.remove(editing.id);
      if (editing.photoId !== undefined) await store.photos.remove(editing.photoId).catch(() => undefined);
      navigate('/library', { replace: true });
    } finally {
      setSaving(false);
    }
  };

  const cancel = (): void => {
    if (editing !== undefined) navigate(recipePath(editing));
    else navigate('/library');
  };

  const isWeb = draft.source.kind === 'web';
  const heading = editing !== undefined ? t('add.headingEdit') : t('add.headingAdd');

  /* ---------------------------------------------------------- sections -- */

  const photoZone = (
    <div
      className={cx(s.dropzone, dragOver && s.dropzoneOver, preview !== null && s.dropzoneFilled)}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        void takePhoto(event.dataTransfer.files[0]);
      }}
    >
      <input
        ref={fileInput}
        type="file"
        accept={PHOTO_TYPES.join(',')}
        className="visually-hidden"
        aria-label={t('add.photo.choose')}
        onChange={(event) => {
          void takePhoto(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {preview !== null ? (
        <>
          <img src={preview} alt={t('add.photo.alt')} className={s.preview} />
          <div className={s.photoActions}>
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              {t('add.photo.replace')}
            </Button>
            <Button variant="secondary" icon={Trash2} onClick={removePhoto}>
              {t('common.remove')}
            </Button>
          </div>
        </>
      ) : (
        <div className={s.dropText}>
          <span className={s.dropIcon} aria-hidden>
            <ImagePlus size={24} strokeWidth={2} />
          </span>
          <span className={s.dropTitle}>{t('add.photo.add')}</span>
          <span className={s.dropHint}>
            <Trans
              i18nKey="add.photo.drag"
              components={{ browse: <button type="button" className={s.browse} onClick={() => fileInput.current?.click()} /> }}
            />
          </span>
        </div>
      )}
      {photoError !== null && <ErrorText>{photoError}</ErrorText>}
    </div>
  );

  const basics = (
    <Card title={t('add.basics')}>
      <TextField
        label={t('add.title')}
        showLabel
        dir="auto"
        value={draft.title}
        placeholder={t('add.titlePlaceholder')}
        aria-invalid={errors.title !== undefined}
        onChange={(event) => set({ title: event.target.value })}
      />
      {errors.title !== undefined && <ErrorText>{errors.title}</ErrorText>}
      <div className={s.numbers}>
        <div>
          <span className={s.label}>{t('add.servings')}</span>
          <Stepper
            label={t('add.servings')}
            fewerLabel={t('add.fewerServings')}
            moreLabel={t('add.moreServings')}
            value={draft.servings}
            min={1}
            max={24}
            onChange={(servings) => set({ servings })}
          />
        </div>
        <TextField label={t('add.prepTime')} showLabel suffix={t('add.min')} inputMode="numeric" value={draft.prepMin} onChange={(event) => set({ prepMin: event.target.value.replace(/\D/g, '') })} />
        <TextField label={t('add.cookTime')} showLabel suffix={t('add.min')} inputMode="numeric" value={draft.cookMin} onChange={(event) => set({ cookMin: event.target.value.replace(/\D/g, '') })} />
      </div>
      <div>
        <span className={s.label}>{t('add.tags')}</span>
        <div className={s.tagBox}>
          {draft.tags.map((name) => (
            <RemovableChip key={name} removeLabel={t('add.removeTag', { tag: name })} onRemove={() => set({ tags: draft.tags.filter((x) => x !== name) })}>
              <span dir="auto">{name}</span>
            </RemovableChip>
          ))}
          <input
            className={s.inlineInput}
            aria-label={t('add.addTag')}
            placeholder={t('add.addTag')}
            dir="auto"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            onKeyDown={(event) => {
              if ((event.key === 'Enter' || event.key === ',') && tag.trim() !== '') {
                event.preventDefault();
                const name = tag.trim().replace(/,$/, '');
                if (!draft.tags.includes(name)) set({ tags: [...draft.tags, name] });
                setTag('');
              } else if (event.key === 'Backspace' && tag === '' && draft.tags.length > 0) {
                set({ tags: draft.tags.slice(0, -1) });
              }
            }}
          />
        </div>
      </div>
      <p className={s.mine}>
        {isWeb ? (
          <Trans
            i18nKey="add.savedWeb"
            values={{ site: draft.source.kind === 'web' ? draft.source.site : '' }}
            components={{ badge: <span className={s.webBadge} /> }}
          />
        ) : (
          <Trans
            i18nKey="add.savedMine"
            components={{ badge: <span className={s.mineBadge} />, icon: <User size={12} strokeWidth={2.4} aria-hidden /> }}
          />
        )}
      </p>
    </Card>
  );

  const ingredients = (
    <Card
      title={
        <>
          {t('add.ingredients')} <span className={s.count}>· {filled}</span>
        </>
      }
      aside={
        <Button variant="ghost" icon={List} onClick={() => setPasting(!pasting)} aria-expanded={pasting}>
          {t('add.pasteList')}
        </Button>
      }
    >
      {pasting && (
        <div className={s.paste}>
          <label htmlFor="paste-list" className={s.label}>
            {t('add.pasteHelp')}
          </label>
          <textarea id="paste-list" className={s.textarea} rows={5} dir="auto" value={pasted} onChange={(event) => setPasted(event.target.value)} />
          <div className={s.pasteActions}>
            <Button variant="ghost" onClick={() => setPasting(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" disabled={pasted.trim() === ''} onClick={addPasted}>
              {t('add.addParsed', { count: parseIngredientBlock(pasted).length })}
            </Button>
          </div>
        </div>
      )}
      <div className={s.ingredientHead} aria-hidden>
        <span />
        <span>{t('add.qty')}</span>
        <span>{t('add.unit')}</span>
        <span>{t('add.item')}</span>
        <span />
      </div>
      <datalist id={listId}>
        {CATALOG.map((item) => (
          <option key={item.id} value={item.name.toLowerCase()} />
        ))}
      </datalist>
      <ol className={s.ingredientRows}>
        {draft.ingredients.map((row, index) => {
          const trailing = index === draft.ingredients.length - 1 && row.item === '' && row.qty === '';
          return (
            <li key={row.key} className={s.ingredientRow} {...(desktop && !trailing ? dragRow(index) : {})}>
              {desktop ? (
                trailing ? (
                  <span className={s.handleSpace} />
                ) : (
                  <Handle label={t('add.move', { name: row.item || t('add.ingredientFallback') })} onMove={(delta) => setRows(move(draft.ingredients, index, index + delta))} />
                )
              ) : null}
              <input
                className={s.qty}
                aria-label={t('add.quantity')}
                placeholder={t('add.qty')}
                inputMode="decimal"
                value={row.qty}
                onChange={(event) => setRow(index, { qty: event.target.value })}
              />
              <SelectButton<string>
                label={t('add.unit')}
                shape="field"
                className={s.unit}
                value={row.unit ?? ''}
                // i18n: unit names (g, tbsp, bunch) are the parser's own words, from draft.ts UNITS.
                display={row.unit ?? (trailing ? t('add.unit') : '—')}
                onChange={(value) => setRow(index, { unit: value === '' ? null : (value as Unit) })}
                options={[{ value: '', label: '—' }, ...UNITS.map((unit) => ({ value: unit, label: unit }))]}
              />
              <input
                className={s.itemInput}
                aria-label={t('add.ingredient')}
                placeholder={t('add.ingredientPlaceholder')}
                list={listId}
                dir="auto"
                value={row.item}
                onChange={(event) => setRow(index, { item: event.target.value })}
              />
              <IconButton
                label={t('add.removeNamed', { name: row.item || t('add.ingredientFallback') })}
                icon={X}
                disabled={trailing}
                onClick={() => setRows(draft.ingredients.filter((_, i) => i !== index))}
              />
            </li>
          );
        })}
      </ol>
      {errors.ingredients !== undefined && <ErrorText>{errors.ingredients}</ErrorText>}
      <Button variant="secondary" icon={Plus} className={s.addButton} onClick={() => set({ ingredients: [...draft.ingredients, emptyIngredient()] })}>
        {t('add.addIngredient')}
      </Button>
    </Card>
  );

  const addTool = (): void => {
    const name = tool.trim();
    if (name !== '' && !draft.equipment.includes(name)) set({ equipment: [...draft.equipment, name] });
    setTool('');
  };

  const equipment = (
    <Card title={t('add.equipment')}>
      <div className={s.tools}>
        {draft.equipment.map((name) => (
          <RemovableChip key={name} icon={equipmentIcon(name)} removeLabel={t('add.removeNamed', { name })} onRemove={() => set({ equipment: draft.equipment.filter((e) => e !== name) })}>
            <span dir="auto">{name}</span>
          </RemovableChip>
        ))}
        <input
          className={s.toolInput}
          aria-label={t('add.addEquipment')}
          placeholder={t('add.addEquipmentPlaceholder')}
          dir="auto"
          value={tool}
          onChange={(event) => setTool(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addTool();
            }
          }}
          onBlur={addTool}
        />
      </div>
    </Card>
  );

  const steps = (
    <Card title={t('add.steps')} aside={<span className={s.aside}>{t('add.stepsAside')}</span>}>
      <ol className={s.steps}>
        {draft.steps.map((row, index) => {
          const trailing = index === draft.steps.length - 1 && row.text === '';
          const timers = detectDurations(row.text, index + 1);
          return (
            <li key={row.key} className={s.step} {...(!trailing ? dragStep(index) : {})}>
              {trailing ? (
                <span className={s.handleSpace} />
              ) : (
                <Handle label={t('add.moveStep', { step: index + 1 })} onMove={(delta) => setSteps(move(draft.steps, index, index + delta))} />
              )}
              <span className={cx(s.stepNumber, trailing && s.stepNumberNext)} aria-hidden>
                {index + 1}
              </span>
              <div className={s.stepBody}>
                <textarea
                  className={s.textarea}
                  aria-label={t('add.step', { step: index + 1 })}
                  rows={2}
                  placeholder={t('add.stepPlaceholder')}
                  dir="auto"
                  value={row.text}
                  onChange={(event) => setSteps(draft.steps.map((r, i) => (i === index ? { ...r, text: event.target.value } : r)))}
                />
                {timers.length > 0 && (
                  <p className={s.detected}>
                    <Timer size={15} strokeWidth={2.2} aria-hidden />{' '}
                    <Trans i18nKey="add.timerDetected" values={{ times: formatList(timers.map((timer) => formatDuration(timer.seconds / 60)), 'unit') }} />
                  </p>
                )}
              </div>
              {!trailing && (
                <IconButton label={t('add.removeStep', { step: index + 1 })} icon={X} onClick={() => setSteps(draft.steps.filter((_, i) => i !== index))} />
              )}
            </li>
          );
        })}
      </ol>
      {errors.steps !== undefined && <ErrorText>{errors.steps}</ErrorText>}
      <Button variant="secondary" icon={Plus} className={s.addButton} onClick={() => set({ steps: [...draft.steps, emptyStep()] })}>
        {t('add.addStep')}
      </Button>
    </Card>
  );

  const deleteZone =
    editing !== undefined ? (
      <div className={s.danger}>
        {confirmDelete ? (
          <>
            <span>
              <Trans i18nKey="add.deleteQuestion" values={{ title: editing.title }} />
            </span>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t('common.keepIt')}
            </Button>
            <Button variant="primary" icon={Trash2} disabled={saving} onClick={() => void remove()}>
              {t('add.deleteRecipe')}
            </Button>
          </>
        ) : (
          <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
            {t('add.deleteRecipe')}
          </Button>
        )}
      </div>
    ) : null;

  const tabs = (
    <Segmented
      wrap
      label={t('add.howToAdd')}
      className={s.tabs}
      value="write"
      onChange={(value) => {
        if (value === 'import') navigate('/import');
      }}
      options={[
        { value: 'write', label: t('add.writeOwn') },
        { value: 'import', label: t('add.importWeb') },
      ]}
    />
  );

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {desktop ? (
        <>
          <Link to={editing !== undefined ? recipePath(editing) : '/library'} className={s.back}>
            <BackArrow size={18} strokeWidth={2} aria-hidden /> {editing !== undefined ? <bdi>{editing.title}</bdi> : t('common.library')}
          </Link>
          <PageHeader
            title={heading}
            actions={
              <>
                <Button variant="ghost" size="lg" onClick={cancel}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" variant="primary" size="lg" icon={Check} disabled={saving}>
                  {t('add.saveRecipe')}
                </Button>
              </>
            }
          />
          {editing === undefined && tabs}
        </>
      ) : (
        <>
          <div className={s.topBar}>
            <Button variant="ghost" onClick={cancel}>
              {t('common.cancel')}
            </Button>
            <h1 className={s.topTitle}>{editing !== undefined ? t('add.headingEdit') : t('add.headingNew')}</h1>
            <Button type="submit" variant="ghost" className={s.topSave} disabled={saving}>
              {t('common.save')}
            </Button>
          </div>
          {editing === undefined && tabs}
        </>
      )}

      {hasErrors && (
        <p className={s.summaryError} role="alert">
          {t('add.checkErrors')}
        </p>
      )}

      <div className={s.layout}>
        <div className={s.left}>
          {photoZone}
          {basics}
        </div>
        <div className={s.right}>
          {ingredients}
          {equipment}
          {steps}
          {deleteZone}
        </div>
      </div>

      {!desktop && (
        <Button type="submit" variant="primary" size="bar" block icon={Check} disabled={saving} className={s.bottomSave}>
          {t('add.saveRecipe')}
        </Button>
      )}
    </form>
  );
}
