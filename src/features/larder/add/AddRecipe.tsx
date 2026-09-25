import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, ImagePlus, List, Plus, Timer, Trash2, User, X } from 'lucide-react';
import { useSession } from '../../../auth/session';
import { PageHeader } from '../../../components/PageHeader';
import { Button, IconButton, RemovableChip, Segmented, SelectButton, Stepper, TextField, cx } from '../../../components/ui';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import type { AnyRecipe, NewRow, Recipe, Unit } from '../../../domain/types';
import { CATALOG } from '../../../domain/kitchen/catalog';
import { detectDurations } from '../../../domain/kitchen/durations';
import { parseIngredientBlock } from '../../../domain/kitchen/parse';
import { formatDuration } from '../../../domain/kitchen/quantity';
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
        That recipe isn’t in the library any more. <Link to="/library">Back to the library</Link>
      </p>
    );
  }
  return <RecipeForm key={editId ?? 'new'} editing={editing} start={handoff} />;
}

function RecipeForm({ editing, start }: { editing: Recipe | undefined; start: AnyRecipe | undefined }): JSX.Element {
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
      setPhotoError(error instanceof Error ? error.message : 'That image could not be used.');
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
  const heading = editing !== undefined ? 'Edit recipe' : 'Add a recipe';

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
        aria-label="Choose a photo"
        onChange={(event) => {
          void takePhoto(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {preview !== null ? (
        <>
          <img src={preview} alt="Recipe photo" className={s.preview} />
          <div className={s.photoActions}>
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              Replace
            </Button>
            <Button variant="secondary" icon={Trash2} onClick={removePhoto}>
              Remove
            </Button>
          </div>
        </>
      ) : (
        <div className={s.dropText}>
          <span className={s.dropIcon} aria-hidden>
            <ImagePlus size={24} strokeWidth={2} />
          </span>
          <span className={s.dropTitle}>Add a photo</span>
          <span className={s.dropHint}>
            Drag an image here, or{' '}
            <button type="button" className={s.browse} onClick={() => fileInput.current?.click()}>
              browse
            </button>
          </span>
        </div>
      )}
      {photoError !== null && <ErrorText>{photoError}</ErrorText>}
    </div>
  );

  const basics = (
    <Card title="Basics">
      <TextField
        label="Title"
        showLabel
        value={draft.title}
        placeholder="e.g. Weeknight Chickpea Curry"
        aria-invalid={errors.title !== undefined}
        onChange={(event) => set({ title: event.target.value })}
      />
      {errors.title !== undefined && <ErrorText>{errors.title}</ErrorText>}
      <div className={s.numbers}>
        <div>
          <span className={s.label}>
            Servings
          </span>
          <Stepper label="Servings" value={draft.servings} min={1} max={24} onChange={(servings) => set({ servings })} />
        </div>
        <TextField label="Prep time" showLabel suffix="min" inputMode="numeric" value={draft.prepMin} onChange={(event) => set({ prepMin: event.target.value.replace(/\D/g, '') })} />
        <TextField label="Cook time" showLabel suffix="min" inputMode="numeric" value={draft.cookMin} onChange={(event) => set({ cookMin: event.target.value.replace(/\D/g, '') })} />
      </div>
      <div>
        <span className={s.label}>Tags</span>
        <div className={s.tagBox}>
          {draft.tags.map((t) => (
            <RemovableChip key={t} removeLabel={`Remove tag ${t}`} onRemove={() => set({ tags: draft.tags.filter((x) => x !== t) })}>
              {t}
            </RemovableChip>
          ))}
          <input
            className={s.inlineInput}
            aria-label="Add tag"
            placeholder="Add tag"
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
          <>
            <span className={s.webBadge}>Web</span> Saved as Web · {draft.source.kind === 'web' ? draft.source.site : ''} — the original link stays
            attached.
          </>
        ) : (
          <>
            <span className={s.mineBadge}>
              <User size={12} strokeWidth={2.4} aria-hidden /> Mine
            </span>{' '}
            Saved to your library as your own recipe.
          </>
        )}
      </p>
    </Card>
  );

  const ingredients = (
    <Card
      title={
        <>
          Ingredients <span className={s.count}>· {filled}</span>
        </>
      }
      aside={
        <Button variant="ghost" icon={List} onClick={() => setPasting(!pasting)} aria-expanded={pasting}>
          Paste a list
        </Button>
      }
    >
      {pasting && (
        <div className={s.paste}>
          <label htmlFor="paste-list" className={s.label}>
            One ingredient per line, e.g. “2 cans chickpeas, drained”
          </label>
          <textarea id="paste-list" className={s.textarea} rows={5} value={pasted} onChange={(event) => setPasted(event.target.value)} />
          <div className={s.pasteActions}>
            <Button variant="ghost" onClick={() => setPasting(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={pasted.trim() === ''} onClick={addPasted}>
              Add {parseIngredientBlock(pasted).length} ingredients
            </Button>
          </div>
        </div>
      )}
      <div className={s.ingredientHead} aria-hidden>
        <span />
        <span>Qty</span>
        <span>Unit</span>
        <span>Item</span>
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
                  <Handle label={`Move ${row.item || 'ingredient'}`} onMove={(delta) => setRows(move(draft.ingredients, index, index + delta))} />
                )
              ) : null}
              <input
                className={s.qty}
                aria-label="Quantity"
                placeholder="Qty"
                inputMode="decimal"
                value={row.qty}
                onChange={(event) => setRow(index, { qty: event.target.value })}
              />
              <SelectButton<string>
                label="Unit"
                shape="field"
                className={s.unit}
                value={row.unit ?? ''}
                display={row.unit ?? (trailing ? 'Unit' : '—')}
                onChange={(value) => setRow(index, { unit: value === '' ? null : (value as Unit) })}
                options={[{ value: '', label: '—' }, ...UNITS.map((unit) => ({ value: unit, label: unit }))]}
              />
              <input
                className={s.itemInput}
                aria-label="Ingredient"
                placeholder="Add an ingredient…"
                list={listId}
                value={row.item}
                onChange={(event) => setRow(index, { item: event.target.value })}
              />
              <IconButton
                label={`Remove ${row.item || 'ingredient'}`}
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
        Add ingredient
      </Button>
    </Card>
  );

  const addTool = (): void => {
    const name = tool.trim();
    if (name !== '' && !draft.equipment.includes(name)) set({ equipment: [...draft.equipment, name] });
    setTool('');
  };

  const equipment = (
    <Card title="Equipment">
      <div className={s.tools}>
        {draft.equipment.map((name) => (
          <RemovableChip key={name} icon={equipmentIcon(name)} removeLabel={`Remove ${name}`} onRemove={() => set({ equipment: draft.equipment.filter((e) => e !== name) })}>
            {name}
          </RemovableChip>
        ))}
        <input
          className={s.toolInput}
          aria-label="Add equipment"
          placeholder="Add equipment…"
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
    <Card title="Steps" aside={<span className={s.aside}>Times you write become timers in Cook mode</span>}>
      <ol className={s.steps}>
        {draft.steps.map((row, index) => {
          const trailing = index === draft.steps.length - 1 && row.text === '';
          const timers = detectDurations(row.text, index + 1);
          return (
            <li key={row.key} className={s.step} {...(!trailing ? dragStep(index) : {})}>
              {trailing ? (
                <span className={s.handleSpace} />
              ) : (
                <Handle label={`Move step ${index + 1}`} onMove={(delta) => setSteps(move(draft.steps, index, index + delta))} />
              )}
              <span className={cx(s.stepNumber, trailing && s.stepNumberNext)} aria-hidden>
                {index + 1}
              </span>
              <div className={s.stepBody}>
                <textarea
                  className={s.textarea}
                  aria-label={`Step ${index + 1}`}
                  rows={2}
                  placeholder="Describe this step…"
                  value={row.text}
                  onChange={(event) => setSteps(draft.steps.map((r, i) => (i === index ? { ...r, text: event.target.value } : r)))}
                />
                {timers.length > 0 && (
                  <p className={s.detected}>
                    <Timer size={15} strokeWidth={2.2} aria-hidden /> Timer detected · {timers.map((t) => formatDuration(t.seconds / 60)).join(', ')}
                  </p>
                )}
              </div>
              {!trailing && (
                <IconButton label={`Remove step ${index + 1}`} icon={X} onClick={() => setSteps(draft.steps.filter((_, i) => i !== index))} />
              )}
            </li>
          );
        })}
      </ol>
      {errors.steps !== undefined && <ErrorText>{errors.steps}</ErrorText>}
      <Button variant="secondary" icon={Plus} className={s.addButton} onClick={() => set({ steps: [...draft.steps, emptyStep()] })}>
        Add step
      </Button>
    </Card>
  );

  const deleteZone =
    editing !== undefined ? (
      <div className={s.danger}>
        {confirmDelete ? (
          <>
            <span>Delete “{editing.title}” for everyone in the family?</span>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button variant="primary" icon={Trash2} disabled={saving} onClick={() => void remove()}>
              Delete recipe
            </Button>
          </>
        ) : (
          <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
            Delete recipe
          </Button>
        )}
      </div>
    ) : null;

  const tabs = (
    <Segmented
      label="How to add"
      className={s.tabs}
      value="write"
      onChange={(value) => {
        if (value === 'import') navigate('/import');
      }}
      options={[
        { value: 'write', label: 'Write my own' },
        { value: 'import', label: 'Import from web' },
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
            <ArrowLeft size={18} strokeWidth={2} aria-hidden /> {editing !== undefined ? editing.title : 'Library'}
          </Link>
          <PageHeader
            title={heading}
            actions={
              <>
                <Button variant="ghost" size="lg" onClick={cancel}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="lg" icon={Check} disabled={saving}>
                  Save recipe
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
              Cancel
            </Button>
            <h1 className={s.topTitle}>{editing !== undefined ? 'Edit recipe' : 'New recipe'}</h1>
            <Button type="submit" variant="ghost" className={s.topSave} disabled={saving}>
              Save
            </Button>
          </div>
          {editing === undefined && tabs}
        </>
      )}

      {hasErrors && (
        <p className={s.summaryError} role="alert">
          Check the highlighted parts before saving.
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
          Save recipe
        </Button>
      )}
    </form>
  );
}
