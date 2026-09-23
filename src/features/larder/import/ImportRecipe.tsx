import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, Clock, Flame, Globe, Leaf, Link2, Pencil, Plus, RefreshCw, Search as SearchIcon, Timer, WifiOff } from 'lucide-react';
import { useSession } from '../../../auth/session';
import { PageHeader } from '../../../components/PageHeader';
import { SelectButton } from '../../../components/SelectButton';
import { useIsDesktop } from '../../../components/useMediaQuery';
import { Button, Chip, EstTag, MatchBlock, Segmented, SourceBadge, Stars, TextField, cx } from '../../../components/ui';
import type { AnyRecipe, Unit } from '../../../domain/types';
import { checkDiet, fitsProfileLine } from '../../../domain/kitchen/diet';
import { detectDurations } from '../../../domain/kitchen/durations';
import { pantryFit } from '../../../domain/kitchen/fit';
import { formatAmount, formatDuration } from '../../../domain/kitchen/quantity';
import { totalMinutes } from '../../../domain/kitchen/search';
import type { ImportedRecipe } from '../../../../server/import';
import { saveToLibrary } from '../actions';
import type { ImportHandoff } from '../add/AddRecipe';
import { UNITS } from '../add/draft';
import { StatusMarker, equipmentIcon } from '../detail/RecipeDetail';
import { useKitchen } from '../KitchenContext';
import { RecipeList, RecipeRow } from '../RecipeCard';
import { RecipePhoto } from '../RecipePhoto';
import { recipePath, recipeView } from '../recipeView';
import { applyFixes, fromImported, suggestedTags, whatWeRead } from './imported';
import type { Fix } from './imported';
import s from './ImportRecipe.module.css';

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; site: string }
  | { kind: 'error'; message: string; offerWrite?: boolean };

const OFFLINE = 'You’re offline — importing needs a connection';

function errorMessage(code: string): { message: string; offerWrite?: boolean } {
  switch (code) {
    case 'invalid-url':
      return { message: 'That doesn’t look like a web address — check the link and try again.' };
    case 'blocked':
      return { message: 'That address can’t be fetched. Use a link to a public recipe page.' };
    case 'timeout':
      return { message: 'That page took too long to answer — try again in a moment.' };
    case 'too-large':
      return { message: 'That page is too big to read. Try the recipe’s own page.' };
    default:
      return { message: 'Couldn’t find a recipe on that page — try another link or write it yourself', offerWrite: true };
  }
}

interface Preview {
  recipe: AnyRecipe;
  stated: { photo: boolean; servings: boolean; times: boolean };
}

function PreviewCard({ preview, onSaved }: { preview: Preview; onSaved: (id: string) => void }): JSX.Element {
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

export default function ImportRecipe(): JSX.Element {
  const kitchen = useKitchen();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const [mode, setMode] = useState<'link' | 'search'>('link');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AnyRecipe[] | null>(null);

  const fetchRecipe = async (): Promise<void> => {
    if (!navigator.onLine) {
      setStatus({ kind: 'error', message: OFFLINE });
      return;
    }
    setStatus({ kind: 'loading' });
    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const body = (await response.json().catch(() => ({ error: 'fetch-failed' }))) as {
        recipe?: ImportedRecipe;
        report?: { missing: string[] };
        error?: string;
      };
      if (body.recipe === undefined) {
        setPreview(null);
        setStatus({ kind: 'error', ...errorMessage(body.error ?? 'not-found') });
        return;
      }
      const missing = body.report?.missing ?? [];
      setPreview({
        recipe: fromImported(body.recipe),
        stated: { photo: !missing.includes('photo'), servings: !missing.includes('servings'), times: !missing.includes('times') },
      });
      setStatus({ kind: 'ok', site: body.recipe.site });
    } catch {
      setPreview(null);
      setStatus({ kind: 'error', message: navigator.onLine ? errorMessage('fetch-failed').message : OFFLINE });
    }
  };

  const runSearch = async (): Promise<void> => {
    if (!navigator.onLine) {
      setStatus({ kind: 'error', message: OFFLINE });
      return;
    }
    setStatus({ kind: 'idle' });
    setResults(await kitchen.provider.search(query));
  };

  const choose = (recipe: AnyRecipe): void => {
    setPreview({ recipe, stated: { photo: recipe.photoUrl !== undefined, servings: true, times: true } });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      {desktop && (
        <Link to="/library" className={s.back}>
          <ArrowLeft size={18} strokeWidth={2} aria-hidden /> Library
        </Link>
      )}
      <PageHeader title="Add a recipe" />
      <Segmented
        label="How to add"
        className={s.tabs}
        value="import"
        onChange={(value) => {
          if (value === 'write') navigate('/add');
        }}
        options={[
          { value: 'write', label: 'Write my own' },
          { value: 'import', label: 'Import from web' },
        ]}
      />

      <section className={s.card}>
        <div className={s.cardTop}>
          <Segmented
            label="Import by"
            value={mode}
            onChange={(value) => {
              setMode(value);
              setStatus({ kind: 'idle' });
            }}
            options={[
              { value: 'link', label: 'Paste a link' },
              { value: 'search', label: 'Search online' },
            ]}
          />
          {desktop && <span className={s.muted}>Works with most recipe sites</span>}
        </div>

        {mode === 'link' ? (
          <form
            className={s.fetchRow}
            onSubmit={(event) => {
              event.preventDefault();
              void fetchRecipe();
            }}
          >
            <TextField
              label="Recipe link"
              icon={Link2}
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              wrapClassName={s.urlField}
            />
            <Button type="submit" variant={status.kind === 'ok' ? 'secondary' : 'primary'} size="lg" icon={RefreshCw} disabled={url.trim() === '' || status.kind === 'loading'}>
              {status.kind === 'loading' ? 'Fetching…' : status.kind === 'ok' ? 'Fetch again' : 'Fetch recipe'}
            </Button>
          </form>
        ) : (
          <form
            className={s.fetchRow}
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch();
            }}
          >
            <TextField
              label="Search recipes online"
              icon={SearchIcon}
              type="search"
              placeholder="e.g. gnocchi, chicken soup"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              wrapClassName={s.urlField}
            />
            <Button type="submit" variant="primary" size="lg" icon={SearchIcon}>
              Search
            </Button>
          </form>
        )}

        <div aria-live="polite">
          {status.kind === 'ok' && (
            <p className={s.ok}>
              <Check size={18} strokeWidth={2.4} aria-hidden /> Recipe found and read from {status.site}
            </p>
          )}
          {status.kind === 'error' && (
            <p className={s.fail}>
              {status.message === OFFLINE ? <WifiOff size={18} strokeWidth={2.2} aria-hidden /> : <AlertTriangle size={18} strokeWidth={2.2} aria-hidden />}
              <span>
                {status.message}
                {status.offerWrite === true && (
                  <>
                    {' '}
                    — <Link to="/add">write it yourself</Link>
                  </>
                )}
              </span>
            </p>
          )}
        </div>

        {mode === 'search' && results !== null && (
          <div className={s.results}>
            {results.length === 0 ? (
              <p className={s.muted}>No recipes found for “{query}”.</p>
            ) : (
              <RecipeList>
                {results.map((recipe) => (
                  <RecipeRow key={recipe.id} view={recipeView(recipe, kitchen.pantry, kitchen.profile)} onChoose={() => choose(recipe)} />
                ))}
              </RecipeList>
            )}
          </div>
        )}
      </section>

      {preview !== null && <PreviewCard key={preview.recipe.id} preview={preview} onSaved={(id) => navigate(recipePath({ id }), { replace: true })} />}
    </div>
  );
}
